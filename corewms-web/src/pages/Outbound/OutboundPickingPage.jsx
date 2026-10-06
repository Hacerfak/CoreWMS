import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Box, MapPin, Barcode, CheckCircle2, Loader2, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundPickingPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    const [orderData, setOrderData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeItem, setActiveItem] = useState(null);

    // Form Bipagem Coletor
    const [scannedLpn, setScannedLpn] = useState('');
    const [pickedQuantity, setPickedQuantity] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadTasks = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/picking/${orderId}/tasks`,
                method: 'GET'
            });
            setOrderData(res);
        } catch {
            toast.error('Erro ao carregar dados de separação.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) loadTasks();
    }, [orderId]);

    const handleOpenScanDialog = (item) => {
        setActiveItem(item);
        const pending = item.expectedQuantity - item.pickedQuantity;
        setPickedQuantity(pending > 0 ? pending.toString() : '');
        setScannedLpn('');
    };

    const handleExecuteScan = async (e) => {
        e?.preventDefault();
        if (!activeItem || !scannedLpn || !pickedQuantity) return;

        const qtyNum = parseFloat(pickedQuantity);
        if (isNaN(qtyNum) || qtyNum <= 0) return toast.warning('Informe uma quantidade válida.');

        try {
            setIsSubmitting(true);
            const payload = {
                orderId,
                orderItemId: activeItem.orderItemId,
                scannedLpn: scannedLpn.trim().toUpperCase(),
                pickedQuantity: qtyNum
            };

            const res = await customInstance({
                url: '/api/outbound/picking/scan',
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || 'Coleta efetuada com sucesso!');
            setActiveItem(null);
            setScannedLpn('');
            loadTasks();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao bipar LPN.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando mapa de separação...</p>
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
                                <Box className="text-purple-600" size={22} /> Coletor de Separação (Picking)
                            </h1>
                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                                Pedido #{orderData?.orderNumber}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong>{orderData?.customerName}</strong>
                        </p>
                    </div>
                </div>

                <Button onClick={() => navigate('/outbound')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9">
                    <CheckCircle2 size={16} className="mr-1.5" /> Finalizar Separação
                </Button>
            </div>

            {/* LISTA DE ITENS DA ORDEM COM BARRA DE PROGRESSO E HUS */}
            <div className="space-y-4">
                {orderData?.items?.map((item) => {
                    const percent = Math.min(100, (item.pickedQuantity / item.expectedQuantity) * 100);
                    const isComplete = item.pickedQuantity >= item.expectedQuantity;
                    const pendingQty = item.expectedQuantity - item.pickedQuantity;

                    const pickedAllocations = item.allocations?.filter(a => a.isPicked) || [];
                    const suggestedAllocations = item.allocations?.filter(a => !a.isPicked) || [];

                    return (
                        <Card key={item.orderItemId} className={`border transition-all ${isComplete ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200 bg-white'}`}>
                            <CardHeader className="p-4 border-b bg-slate-50/60 flex flex-row items-center justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-sm text-slate-900">{item.skuCode}</span>
                                        <Badge variant="outline" className="text-[10px] font-mono">{item.baseUnit}</Badge>
                                        {isComplete && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]"><Check size={12} className="mr-1" /> Concluído</Badge>}
                                    </div>
                                    <p className="text-xs text-slate-500">{item.description}</p>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="text-right font-mono text-xs">
                                        <span className="font-bold text-slate-900">{item.pickedQuantity}</span> / {item.expectedQuantity} {item.baseUnit}
                                        <span className="block text-[10px] text-slate-400 font-sans">
                                            {isComplete ? 'Totalmente Separado' : `Pendente: ${pendingQty} ${item.baseUnit}`}
                                        </span>
                                    </div>

                                    {!isComplete && (
                                        <Button
                                            onClick={() => handleOpenScanDialog(item)}
                                            size="sm"
                                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-9 px-4"
                                        >
                                            <Barcode size={15} className="mr-1.5" /> Bipar LPN
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>

                            <CardContent className="p-4 space-y-3">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                                        <span>Progresso de Separação do SKU</span>
                                        <span>{percent.toFixed(0)}%</span>
                                    </div>
                                    <Progress value={percent} className="h-1.5" />
                                </div>

                                {/* DETALHAMENTO DE HUS ORIGEM (SUGERIDAS X SEPARADAS) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
                                    {/* HUS JÁ SEPARADAS */}
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 space-y-2">
                                        <span className="font-bold text-slate-800 uppercase text-[10px] tracking-wider block flex items-center gap-1">
                                            <CheckCircle2 size={13} className="text-emerald-600" /> HUs Coletadas ({pickedAllocations.length})
                                        </span>
                                        {pickedAllocations.length === 0 ? (
                                            <p className="text-[11px] text-slate-400 italic">Nenhum LPN bipado ainda.</p>
                                        ) : (
                                            <div className="space-y-1 font-mono text-[11px]">
                                                {pickedAllocations.map(a => (
                                                    <div key={a.allocationId} className="flex justify-between items-center bg-white p-1.5 rounded border border-slate-200">
                                                        <span>LPN: <strong>{a.lpn}</strong> ({a.locationPath})</span>
                                                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{a.quantity} {item.baseUnit}</Badge>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* HUS SUGERIDAS PELO WMS */}
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 space-y-2">
                                        <span className="font-bold text-slate-800 uppercase text-[10px] tracking-wider block flex items-center gap-1">
                                            <MapPin size={13} className="text-blue-600" /> Sugestões de Rota no Armazém ({suggestedAllocations.length})
                                        </span>
                                        {suggestedAllocations.length === 0 ? (
                                            <p className="text-[11px] text-slate-400 italic">Sem sugestões pendentes.</p>
                                        ) : (
                                            <div className="space-y-1 font-mono text-[11px]">
                                                {suggestedAllocations.map(a => (
                                                    <div key={a.allocationId} className="flex justify-between items-center bg-white p-1.5 rounded border border-slate-200">
                                                        <span><strong>{a.lpn}</strong> @ {a.locationPath}</span>
                                                        <span className="text-slate-600">{a.quantity} {item.baseUnit}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* MODAL BIPAGEM COLETOR */}
            <Dialog open={Boolean(activeItem)} onOpenChange={() => setActiveItem(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Barcode className="text-purple-600" size={20} /> Leitura de Etiqueta LPN
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            SKU: <strong className="font-mono text-slate-800">{activeItem?.skuCode}</strong> - {activeItem?.description}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleExecuteScan} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Código LPN Bipado (Etiqueta) *</Label>
                            <Input
                                placeholder="Bipe ou digite o LPN..."
                                value={scannedLpn}
                                onChange={(e) => setScannedLpn(e.target.value)}
                                autoFocus
                                className="bg-white font-mono text-sm h-10 border-slate-300 focus-visible:ring-purple-600"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Quantidade Retirada ({activeItem?.baseUnit}) *</Label>
                            <Input
                                type="number"
                                step="0.0001"
                                value={pickedQuantity}
                                onChange={(e) => setPickedQuantity(e.target.value)}
                                className="bg-white font-mono text-sm h-10 border-slate-300"
                            />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => setActiveItem(null)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting || !scannedLpn || !pickedQuantity} className="bg-purple-600 hover:bg-purple-700 text-white font-bold">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Confirmar Bipagem
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}