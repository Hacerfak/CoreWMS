import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Box, MapPin, Barcode, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundPickingPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTask, setActiveTask] = useState(null);

    // Form Bipagem
    const [scannedLpn, setScannedLpn] = useState('');
    const [pickedQuantity, setPickedQuantity] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Override Warning Modal
    const [overrideWarning, setOverrideWarning] = useState(null);

    const loadTasks = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/picking/${orderId}/tasks`,
                method: 'GET'
            });
            setTasks(res || []);
        } catch {
            toast.error('Erro ao carregar tarefas de separação.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) loadTasks();
    }, [orderId]);

    const handleExecuteScan = async (confirmOverride = false) => {
        if (!activeTask || !scannedLpn) return;

        try {
            setIsSubmitting(true);
            const payload = {
                orderId,
                allocationId: activeTask.allocationId,
                scannedLpn: scannedLpn.trim().toUpperCase(),
                pickedQuantity: Number(pickedQuantity),
                confirmOverride
            };

            const res = await customInstance({
                url: '/api/outbound/picking/scan',
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || 'Item separado com sucesso!');
            setActiveTask(null);
            setOverrideWarning(null);
            setScannedLpn('');
            loadTasks();
        } catch (error) {
            const errData = error.response?.data;
            if (errData?.code === 'LPN_MISMATCH_WARNING') {
                setOverrideWarning(errData.message);
            } else {
                toast.error(errData?.message || 'Erro ao bipar item.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/outbound')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                            <Box className="text-purple-600" size={24} /> Coletor de Separação (Picking)
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">Siga a rota otimizada e bipe o LPN dos endereços sugeridos.</p>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/80">
                        <TableRow>
                            <TableHead>Endereço / Rota</TableHead>
                            <TableHead>SKU / Descrição</TableHead>
                            <TableHead>LPN Sugerido</TableHead>
                            <TableHead className="text-right">Qtd Solicitada</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right w-36">Ação</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin text-purple-600 mx-auto" /></TableCell></TableRow>
                        ) : tasks.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-28 text-center text-slate-500">Nenhuma tarefa de separação encontrada.</TableCell></TableRow>
                        ) : tasks.map((t) => (
                            <TableRow key={t.allocationId} className="hover:bg-slate-50/60">
                                <TableCell>
                                    <Badge variant="outline" className="bg-slate-50 font-mono text-slate-800 gap-1 text-xs">
                                        <MapPin size={12} className="text-blue-600" /> {t.locationPath}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-bold font-mono text-slate-900">{t.skuCode}</span>
                                        <span className="text-[10px] text-slate-400">{t.description}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs font-semibold text-purple-700">{t.expectedLpn}</TableCell>
                                <TableCell className="text-right font-mono font-bold text-slate-900 text-xs">{t.quantityToPick}</TableCell>
                                <TableCell>
                                    <Badge className={`text-[10px] ${t.isPicked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                        {t.isPicked ? '✅ Separado' : '⏳ Pendente'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    {!t.isPicked && (
                                        <Button
                                            onClick={() => { setActiveTask(t); setPickedQuantity(t.quantityToPick); setScannedLpn(''); setIsCountModalOpen(true); }}
                                            size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                                        >
                                            <Barcode size={13} className="mr-1" /> Bipar LPN
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* MODAL BIPAGEM COLETOR */}
            <Dialog open={Boolean(activeTask)} onOpenChange={() => setActiveTask(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Barcode className="text-purple-600" size={20} /> Bipagem de Picking
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Endereço: <strong className="font-mono text-slate-800">{activeTask?.locationPath}</strong> | SKU: <strong className="font-mono text-slate-800">{activeTask?.skuCode}</strong>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {overrideWarning ? (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2 text-amber-900">
                                <p className="font-bold flex items-center gap-1">
                                    <AlertTriangle size={15} className="text-amber-600" /> Troca de Etiqueta Detectada!
                                </p>
                                <p>{overrideWarning}</p>
                                <Button
                                    onClick={() => handleExecuteScan(true)}
                                    disabled={isSubmitting}
                                    className="w-full bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs mt-2"
                                >
                                    Confirmar Troca e Separar Novo LPN
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700">Código LPN Bipado *</Label>
                                    <Input
                                        placeholder="Bipe o código do palete..."
                                        value={scannedLpn}
                                        onChange={(e) => setScannedLpn(e.target.value)}
                                        className="bg-white font-mono text-sm"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700">Quantidade Retirada *</Label>
                                    <Input
                                        type="number"
                                        value={pickedQuantity}
                                        onChange={(e) => setPickedQuantity(e.target.value)}
                                        className="bg-white font-mono text-sm"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {!overrideWarning && (
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setActiveTask(null)} disabled={isSubmitting}>Cancelar</Button>
                            <Button onClick={() => handleExecuteScan(false)} disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700 text-white">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Confirmar Coleta
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}