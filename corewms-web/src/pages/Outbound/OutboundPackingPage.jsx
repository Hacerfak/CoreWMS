import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, Loader2, Truck, Package, Box, Layers, Scissors, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundPackingPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    const [order, setOrder] = useState(null);
    const [pickingTasks, setPickingTasks] = useState(null);
    const [packagingTypes, setPackagingTypes] = useState([]);
    const [docks, setDocks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Form de Packing
    const [selectedDockId, setSelectedDockId] = useState('');
    const [usedStretch, setUsedStretch] = useState(false);
    const [selectedFracPackagingTypeId, setSelectedFracPackagingTypeId] = useState('');
    const [fracBoxesCount, setFracBoxesCount] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const [orderRes, tasksRes, packTypesRes, docksRes] = await Promise.all([
                customInstance({ url: `/api/outbound/orders/${orderId}`, method: 'GET' }),
                customInstance({ url: `/api/outbound/picking/${orderId}/tasks`, method: 'GET' }),
                customInstance({ url: '/api/packaging-types', method: 'GET' }),
                customInstance({ url: '/api/topology/locations/docks', method: 'GET' })
            ]);

            setOrder(orderRes);
            setPickingTasks(tasksRes);
            setPackagingTypes(packTypesRes?.items || packTypesRes || []);
            setDocks(docksRes || []);

            if (docksRes && docksRes.length > 0) {
                setSelectedDockId(docksRes[0].id);
            }
        } catch {
            toast.error('Erro ao carregar dados de packing.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) loadData();
    }, [orderId]);

    // Separa os itens bipados em Paletes Fechados e Fracionados
    const packingAnalysis = useMemo(() => {
        if (!pickingTasks?.items) return { fullPallets: [], fracionadoItems: [], totalFracUnits: 0 };

        const fullPallets = [];
        const fracionadoItems = [];
        let totalFracUnits = 0;

        pickingTasks.items.forEach(item => {
            const pickedAllocations = item.allocations?.filter(a => a.isPicked) || [];

            pickedAllocations.forEach(alloc => {
                // Se a quantidade for do volume inteiro (ex: 1200 UN)
                if (alloc.quantity >= 100) { // Ou flag do backend
                    fullPallets.push({
                        lpn: alloc.lpn,
                        sku: item.skuCode,
                        description: item.description,
                        qty: alloc.quantity,
                        unit: item.baseUnit,
                        location: alloc.locationPath
                    });
                } else {
                    fracionadoItems.push({
                        sku: item.skuCode,
                        description: item.description,
                        qty: alloc.quantity,
                        unit: item.baseUnit,
                        lpn: alloc.lpn
                    });
                    totalFracUnits += alloc.quantity;
                }
            });
        });

        return { fullPallets, fracionadoItems, totalFracUnits };
    }, [pickingTasks]);

    const handleExecutePack = async (e) => {
        e.preventDefault();
        if (!selectedDockId) {
            return toast.error('Selecione a Doca de embarque destino.');
        }

        try {
            setIsSubmitting(true);

            const fracionadoBoxesPayload = packingAnalysis.totalFracUnits > 0 && selectedFracPackagingTypeId ? [{
                packagingTypeId: selectedFracPackagingTypeId,
                boxCount: Number(fracBoxesCount),
                orderItemIds: order?.items?.map(i => i.id) || []
            }] : [];

            const payload = {
                orderId,
                dockLocationId: selectedDockId,
                usedStretchFilm: usedStretch,
                fracionadoBoxes: fracionadoBoxesPayload
            };

            const res = await customInstance({
                url: '/api/outbound/packing/pack',
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || 'Conferência finalizada com sucesso!');
            navigate('/outbound');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao finalizar packing.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando estativa de packing...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/outbound')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Package className="text-orange-600" size={22} /> Mesa de Embalagem & Conferência (Packing)
                            </h1>
                            <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">
                                Pedido #{order?.orderNumber}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong>{order?.customerName}</strong> | Destinatário: <strong>{order?.destinationName}</strong>
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUNA ESQUERDA: VISÃO OPERACIONAL DE EMBALAGEM */}
                <div className="lg:col-span-2 space-y-5">
                    {/* 1. PALETES FECHADOS IDENTIFICADOS AUTOMATICAMENTE */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-2"><Box size={16} className="text-orange-600" /> Paletes/Caixas Fechadas (Auto-Identificados)</span>
                                <Badge variant="secondary" className="font-mono">{packingAnalysis.fullPallets.length} Vol. Fechado(s)</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            {packingAnalysis.fullPallets.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">Nenhum palete fechado neste pedido.</p>
                            ) : (
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead>LPN Origem</TableHead>
                                                <TableHead>SKU Produto</TableHead>
                                                <TableHead>Quantidade</TableHead>
                                                <TableHead className="text-right">Status Envío</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {packingAnalysis.fullPallets.map((pal, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="font-mono font-bold text-xs text-slate-900">{pal.lpn}</TableCell>
                                                    <TableCell className="text-xs">{pal.sku}</TableCell>
                                                    <TableCell className="font-mono text-xs">{pal.qty} {pal.unit}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                                                            ✓ Pronto p/ Embarque
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* 2. MESA DE AGRUPAMENTO DE FRACIONADOS */}
                    {packingAnalysis.totalFracUnits > 0 && (
                        <Card className="border-purple-200 bg-purple-50/20 shadow-xs">
                            <CardHeader className="p-4 border-b border-purple-200 bg-purple-100/40">
                                <CardTitle className="text-xs uppercase font-bold text-purple-900 flex items-center justify-between">
                                    <span className="flex items-center gap-2"><Scissors size={16} className="text-purple-600" /> Unidades Soltas Fracionadas Coletadas</span>
                                    <Badge className="bg-purple-200 text-purple-900 border-purple-300 font-mono">{packingAnalysis.totalFracUnits} UN Soltas</Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="p-3 bg-white border border-purple-200 rounded-xl space-y-1 text-xs text-slate-700">
                                    <p className="font-bold text-purple-900 flex items-center gap-1.5">
                                        <Sparkles size={14} className="text-purple-600" /> Instruções de Embalagem:
                                    </p>
                                    <p>Abaixo estão as unidades soltas separadas de vários SKUs. Selecione o tipo de caixa de papelão/embalagem que você usará para acomodar essas itens:</p>
                                </div>

                                <div className="border border-purple-200 bg-white rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-purple-50/60">
                                            <TableRow>
                                                <TableHead>SKU / Descrição</TableHead>
                                                <TableHead className="text-right">Qtd Unidades Soltas</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {packingAnalysis.fracionadoItems.map((frac, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>
                                                        <span className="font-mono font-bold text-xs text-slate-900 block">{frac.sku}</span>
                                                        <span className="text-[11px] text-slate-500">{frac.description}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-purple-900 text-xs">
                                                        {frac.qty} {frac.unit}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* EMBALAGEM DAS GARRAFAS EM CAIXAS */}
                                <div className="p-4 bg-white border border-purple-200 rounded-xl space-y-3">
                                    <Label className="text-xs font-bold text-purple-900 uppercase">Embalar Unidades Soltas em:</Label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-slate-700">Tipo de Caixa / Embalagem *</Label>
                                            <Select value={selectedFracPackagingTypeId} onValueChange={setSelectedFracPackagingTypeId}>
                                                <SelectTrigger className="bg-white text-xs h-9">
                                                    <SelectValue placeholder="Escolha a caixa (ex: Caixa Master 6 Un)..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {packagingTypes.map(pt => (
                                                        <SelectItem key={pt.id} value={pt.id}>
                                                            <span className="font-mono font-bold">{pt.code}</span> - {pt.description}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs text-slate-700">Quantidade de Caixas Geradas *</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                value={fracBoxesCount}
                                                onChange={(e) => setFracBoxesCount(e.target.value)}
                                                className="bg-white font-mono text-xs h-9"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* COLUNA DIREITA: FINALIZAÇÃO & SELEÇÃO DE DOCA */}
                <Card className="border-slate-200/80 bg-white shadow-xs h-fit">
                    <CardHeader className="pb-3 border-b bg-slate-50/60">
                        <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Truck size={18} className="text-orange-600" /> Endereçamento da Doca & Insumos
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="p-4 space-y-5">
                        <form onSubmit={handleExecutePack} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-800">Doca de Embarque Destino *</Label>
                                <Select value={selectedDockId} onValueChange={setSelectedDockId}>
                                    <SelectTrigger className="bg-white text-xs h-10 border-slate-300">
                                        <SelectValue placeholder="Escolha a doca na expedição..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {docks.map(d => (
                                            <SelectItem key={d.id} value={d.id}>
                                                <span className="font-mono font-bold text-slate-900">{d.code || d.fullPath}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-start space-x-2 pt-3 border-t border-slate-100">
                                <Checkbox
                                    id="stretch"
                                    checked={usedStretch}
                                    onCheckedChange={setUsedStretch}
                                    className="mt-0.5"
                                />
                                <label htmlFor="stretch" className="text-xs text-slate-700 font-medium cursor-pointer leading-tight">
                                    Aplicar Filme Stretch nos Paletes <span className="text-[10px] text-slate-400 block font-normal">(Dispara tarifação automática de Insumo no faturamento)</span>
                                </label>
                            </div>

                            <Button
                                type="submit"
                                disabled={isSubmitting || !selectedDockId}
                                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-11 shadow-xs mt-2"
                            >
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Finalizar Packing e Enviar para Doca 🚀
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}