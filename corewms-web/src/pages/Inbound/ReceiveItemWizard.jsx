import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiInboundItemsFinish } from '@/api/generated/inbound/inbound';
import { useGetApiProducts } from '@/api/generated/products/products';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PackageOpen, Calculator, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const SERVICES = [
    { id: 'DESC_BATIDA', name: 'Descarga Batida (Montagem de Pallet)' },
    { id: 'DESC_PALETIZADA', name: 'Descarga Paletizada (Pallet Fechado)' },
    { id: 'DESC_AVULSA', name: 'Descarga Fracionada / Caixas Avulsas' }
];

export default function ReceiveItemWizard({ open, onOpenChange, item, orderId, customerId }) {
    const queryClient = useQueryClient();

    // Busca os detalhes do Produto e suas embalagens
    const { data: productsList } = useGetApiProducts({ CustomerId: customerId });
    const productData = productsList?.find(p => p.id === item?.productId);

    const [serviceType, setServiceType] = useState('');
    const [selectedPackId, setSelectedPackId] = useState('');
    const [volumeCount, setVolumeCount] = useState('');
    const [damagedQty, setDamagedQty] = useState('');
    const [missingQty, setMissingQty] = useState('');
    const [overageQty, setOverageQty] = useState('');

    const activePack = productData?.packagings?.find(p => p.id === selectedPackId);

    const math = useMemo(() => {
        if (!activePack || volumeCount === '') return null;

        const count = parseInt(volumeCount, 10);
        if (isNaN(count) || count < 0) return null;

        const dQty = parseFloat(damagedQty) || 0;
        const mQty = parseFloat(missingQty) || 0;
        const baseCapacity = count * activePack.conversionFactor;

        // Regra de Ouro CQRS Backend: Good + Damaged + Missing == Expected
        const totalAccountedFor = baseCapacity + dQty + mQty;
        const remainderToExpected = item.expectedQty - totalAccountedFor;

        return {
            baseCapacity,
            dQty,
            mQty,
            totalAccountedFor,
            remainder: remainderToExpected,
            isValid: remainderToExpected >= 0,
            needsPartial: remainderToExpected > 0
        };
    }, [activePack, volumeCount, item?.expectedQty, damagedQty, missingQty]);

    const { mutate: finishReceiving, isPending } = usePostApiInboundItemsFinish({
        mutation: {
            onSuccess: () => {
                toast.success('HUs geradas. Etiquetas enviadas para a Doca!');
                queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao finalizar o recebimento.')
        }
    });

    const handleConfirm = () => {
        if (!math || !math.isValid) return;
        finishReceiving({
            data: {
                orderItemId: item.id,
                serviceType,
                productPackagingId: selectedPackId,
                fullVolumesCount: parseInt(volumeCount, 10),
                partialVolumeQty: math.remainder,
                damagedQty: math.dQty,
                missingQty: math.mQty,
                overageQty: parseFloat(overageQty) || 0
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !isPending && onOpenChange(val)}>
            <DialogContent className="sm:max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><PackageOpen className="text-blue-600" /> Conferência Cega</DialogTitle>
                    <DialogDescription>
                        Faturamento de doca e validação do balanço físico-fiscal.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>Serviço Prestado (Billing) *</Label>
                            <Select value={serviceType} onValueChange={setServiceType}>
                                <SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger>
                                <SelectContent>{SERVICES.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Embalagem a ser montada *</Label>
                            <Select value={selectedPackId} onValueChange={setSelectedPackId}>
                                <SelectTrigger><SelectValue placeholder="Selecione a embalagem" /></SelectTrigger>
                                <SelectContent>
                                    {productData?.packagings?.map(pack => (
                                        <SelectItem key={pack.id} value={pack.id}>{pack.packagingTypeCode} (Comporta {pack.conversionFactor} UN)</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Quantidade de Volumes COMPLETOS *</Label>
                        <Input type="number" placeholder="Ex: 20 pallets cheios" value={volumeCount} onChange={(e) => setVolumeCount(e.target.value)} className="font-bold text-center text-lg h-12 bg-blue-50 border-blue-200" />
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 p-3 border-b border-slate-200">
                            <Label className="text-sm font-bold text-slate-800 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> Registro de Qualidade</Label>
                            <p className="text-xs text-slate-500 mt-1">Sinalize avarias para quarentena, faltas e sobras sem nota.</p>
                        </div>
                        <div className="grid grid-cols-3 gap-4 p-4 bg-white">
                            <div className="space-y-1.5"><Label className="text-xs text-amber-700">Avarias (UN)</Label><Input type="number" placeholder="0" value={damagedQty} onChange={(e) => setDamagedQty(e.target.value)} /></div>
                            <div className="space-y-1.5"><Label className="text-xs text-rose-700">Faltas (UN)</Label><Input type="number" placeholder="0" value={missingQty} onChange={(e) => setMissingQty(e.target.value)} /></div>
                            <div className="space-y-1.5"><Label className="text-xs text-emerald-700">Sobras (UN)</Label><Input type="number" placeholder="0" value={overageQty} onChange={(e) => setOverageQty(e.target.value)} /></div>
                        </div>
                    </div>

                    {math && (
                        <div className={`p-4 rounded-xl border ${math.isValid ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-200'}`}>
                            <div className="text-sm space-y-1.5 text-slate-700">
                                <p>LPNs Bons: <strong>{volumeCount} HUs x {activePack.conversionFactor} = {math.baseCapacity} UN</strong></p>
                                {math.dQty > 0 && <p className="text-amber-600">LPN Quarentena (Avaria): <strong>{math.dQty} UN</strong></p>}
                                {math.mQty > 0 && <p className="text-rose-600">LPN Fantasma (Falta): <strong>{math.mQty} UN</strong></p>}

                                <div className="border-t border-slate-200 my-2 pt-2 text-xs font-mono">Total Distribuído: {math.totalAccountedFor} / Total NF-e: {item.expectedQty}</div>

                                {!math.isValid ? (
                                    <p className="text-rose-600 font-bold mt-2">A distribuição excede a quantidade fiscal. Revise as caixas.</p>
                                ) : math.needsPartial ? (
                                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <p className="text-blue-800 font-semibold mb-1">Diferença Encontrada ({math.remainder} UN)</p>
                                        <p className="text-blue-700 text-xs">O WMS gerará automaticamente <strong>1 LPN parcial extra</strong> contendo estas {math.remainder} UN para fechar o espelho fiscal.</p>
                                    </div>
                                ) : <p className="text-emerald-600 font-bold mt-2 text-center bg-emerald-50 p-2 rounded">Balanço Físico-Fiscal fechado com sucesso!</p>}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleConfirm} disabled={isPending || !math || !math.isValid || !serviceType} className="bg-slate-900 text-white min-w-[200px] h-12 shadow-lg">
                        {isPending ? <Loader2 className="animate-spin" /> : 'Finalizar Recebimento'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}