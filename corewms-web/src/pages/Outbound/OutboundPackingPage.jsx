import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, ArrowUpFromLine, CheckCircle2, Loader2, Truck, Package } from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundPackingPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    const [order, setOrder] = useState(null);
    const [packagingTypes, setPackagingTypes] = useState([]);
    const [docks, setDocks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Form de Packing
    const [selectedPackId, setSelectedPackId] = useState('');
    const [selectedDockId, setSelectedDockId] = useState('');
    const [volumeCount, setVolumeCount] = useState(1);
    const [grossWeight, setGrossWeight] = useState(0);
    const [usedStretch, setUsedStretch] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const [orderRes, topologyRes] = await Promise.all([
                customInstance({ url: `/api/outbound/orders/${orderId}`, method: 'GET' }),
                customInstance({ url: '/api/topology/tree', method: 'GET' })
            ]);

            setOrder(orderRes);

            // Extrai Docas e Embalagens da Topologia
            if (topologyRes && Array.isArray(topologyRes)) {
                const foundDocks = [];
                topologyRes.forEach(wh => {
                    wh.zones?.forEach(z => {
                        z.locations?.forEach(loc => {
                            foundDocks.push(loc);
                        });
                    });
                });
                setDocks(foundDocks);
            }
        } catch {
            toast.error('Erro ao carregar dados do pedido.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) loadData();
    }, [orderId]);

    const handleExecutePack = async (e) => {
        e.preventDefault();
        if (!selectedPackId || !selectedDockId) {
            return toast.error('Selecione o tipo de embalagem e a Doca de destino.');
        }

        try {
            setIsSubmitting(true);
            const payload = {
                orderId,
                packagingTypeId: selectedPackId,
                volumeCount: Number(volumeCount),
                totalGrossWeight: Number(grossWeight),
                usedStretchFilm: usedStretch,
                dockLocationId: selectedDockId
            };

            await customInstance({
                url: '/api/outbound/packing/pack',
                method: 'POST',
                data: payload
            });

            toast.success('Conferência concluída e eventos de bilhetagem gerados com sucesso!');
            navigate('/outbound');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao finalizar packing do pedido.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-orange-600" /></div>;
    }

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={() => navigate('/outbound')} className="bg-white">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <ArrowUpFromLine className="text-orange-600" size={24} /> Conferência & Embalagem (Packing)
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">Pedido Nº <strong className="font-mono text-slate-900">{order?.orderNumber}</strong> - {order?.destinationName}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* CONFERÊNCIA DOS ITENS SEPARADOS */}
                <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-slate-50/80 font-bold text-slate-900 text-xs flex items-center gap-2">
                        <Package size={16} className="text-orange-600" /> Itens Conferidos do Pedido
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>SKU Produto</TableHead>
                                <TableHead className="text-right">Solicitado</TableHead>
                                <TableHead className="text-right">Separado</TableHead>
                                <TableHead className="text-right">Empacotado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {order?.items?.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-bold font-mono text-slate-900 text-xs">{item.skuCode}</TableCell>
                                    <TableCell className="text-right font-mono text-xs">{item.expectedQuantity}</TableCell>
                                    <TableCell className="text-right font-mono text-xs font-bold text-purple-700">{item.pickedQuantity}</TableCell>
                                    <TableCell className="text-right font-mono text-xs font-bold text-emerald-700">{item.packedQuantity}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* PAINEL DE MONTAGEM DOS VOLUMES & SERVIÇOS */}
                <Card className="border-slate-200/80 bg-white shadow-sm h-fit">
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Truck size={18} className="text-orange-600" /> Finalizar Volume e Doca
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                        <form onSubmit={handleExecutePack} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Doca de Embarque Destino *</Label>
                                <Select value={selectedDockId} onValueChange={setSelectedDockId}>
                                    <SelectTrigger className="bg-white text-xs"><SelectValue placeholder="Escolha a doca..." /></SelectTrigger>
                                    <SelectContent>
                                        {docks.map(d => <SelectItem key={d.id} value={d.id}>{d.fullPath || d.code}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Tipo de Volume / Embalagem *</Label>
                                <Input
                                    placeholder="Ex: Palete Padrão PBR / Caixa Master"
                                    value={selectedPackId}
                                    onChange={(e) => setSelectedPackId(e.target.value)}
                                    className="bg-white text-xs"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700">Qtd Volumes *</Label>
                                    <Input
                                        type="number" min="1"
                                        value={volumeCount}
                                        onChange={(e) => setVolumeCount(e.target.value)}
                                        className="bg-white font-mono text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700">Peso Bruto Total (KG) *</Label>
                                    <Input
                                        type="number" step="0.01"
                                        value={grossWeight}
                                        onChange={(e) => setGrossWeight(e.target.value)}
                                        className="bg-white font-mono text-xs"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center space-x-2 pt-2 border-t">
                                <Checkbox
                                    id="stretch"
                                    checked={usedStretch}
                                    onCheckedChange={setUsedStretch}
                                />
                                <label htmlFor="stretch" className="text-xs text-slate-700 font-medium cursor-pointer">
                                    Aplicar Filme Stretch (Dispara Bilhetagem Insumo)
                                </label>
                            </div>

                            <Button type="submit" disabled={isSubmitting} className="w-full bg-orange-600 hover:bg-orange-700 text-white mt-2">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Finalizar Packing e Bilhetagem
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}