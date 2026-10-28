import { useState, useMemo, useEffect } from 'react';
import { customInstance } from '@/api/orval-mutator';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Merge, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Layers } from 'lucide-react';
import { toast } from 'sonner';

export default function AgruparHuModal({ open, onOpenChange, sourceHu, onSuccess }) {
    const [destinationHuId, setDestinationHuId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [isAllQuantity, setIsAllQuantity] = useState(true);
    const [candidates, setCandidates] = useState([]);
    const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open && sourceHu) {
            setIsAllQuantity(true);
            setQuantity(String(sourceHu.currentQuantity));
            setDestinationHuId('');

            // Busca HUs candidatas da mesma empresa
            setIsLoadingCandidates(true);
            const params = new URLSearchParams({
                ProductId: sourceHu.productId || '',
                Sku: sourceHu.productSku || '',
                PageSize: '100'
            });

            customInstance({ url: `/api/inventory/handling-units?${params.toString()}`, method: 'GET' })
                .then(res => {
                    const items = res?.items || (Array.isArray(res) ? res : []);
                    // Regras estritas: Mesma Nota, Diferente da Origem, Sem Série, Mesmo Lote e Datas
                    const filtered = items.filter(h =>
                        h.id !== sourceHu.id &&
                        h.status !== 'Consumed' &&
                        h.status !== 'Shipped' &&
                        !h.serialNumber &&
                        h.receiptDocumentId === sourceHu.receiptDocumentId &&
                        (h.batch || '').trim().toUpperCase() === (sourceHu.batch || '').trim().toUpperCase()
                    );
                    setCandidates(filtered);
                })
                .catch(() => setCandidates([]))
                .finally(() => setIsLoadingCandidates(false));
        }
    }, [open, sourceHu]);

    const handleQuantityTypeChange = (isAll) => {
        setIsAllQuantity(isAll);
        if (isAll && sourceHu) {
            setQuantity(String(sourceHu.currentQuantity));
        } else {
            setQuantity('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const numQty = Number(quantity);

        if (!destinationHuId) return toast.warning('Selecione a HU de destino.');
        if (!numQty || numQty <= 0) return toast.warning('Informe uma quantidade válida.');
        if (numQty > sourceHu.currentQuantity) {
            return toast.warning(`A quantidade não pode exceder o saldo atual (${sourceHu.currentQuantity}).`);
        }

        try {
            setIsSubmitting(true);
            const res = await customInstance({
                url: '/api/inventory/handling-units/merge',
                method: 'POST',
                data: {
                    sourceHandlingUnitId: sourceHu.id,
                    destinationHandlingUnitId: destinationHuId,
                    quantity: numQty
                }
            });

            toast.success(res?.message || 'HUs agrupadas com sucesso!');
            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao agrupar HUs.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedDest = candidates.find(c => c.id === destinationHuId);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg bg-white">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Merge className="h-5 w-5 text-blue-600" /> Agrupar Unidade de Manuseio (HU)
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Junte o saldo total ou parcial desta HU em outra HU existente da mesma nota fiscal.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    {/* HU ORIGEM */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">HU Origem</span>
                        <div className="flex justify-between items-center">
                            <span className="font-mono font-bold text-sm text-slate-900">{sourceHu?.lpn}</span>
                            <Badge variant="outline" className="font-mono bg-white text-blue-700 border-blue-200">
                                Saldo: {sourceHu?.currentQuantity} {sourceHu?.unit || 'UN'}
                            </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-slate-600 font-mono text-[11px] pt-1 border-t border-slate-200/60">
                            <span>SKU: {sourceHu?.productSku}</span>
                            <span>Lote: {sourceHu?.batch || 'Sem Lote'}</span>
                        </div>
                    </div>

                    {/* SELEÇÃO DO TIPO DE SALDO */}
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-700 uppercase">Quantidade a Transferir *</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => handleQuantityTypeChange(true)}
                                className={`p-2.5 rounded-lg border text-xs font-semibold transition-all ${isAllQuantity ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}
                            >
                                Saldo Total ({sourceHu?.currentQuantity})
                                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">A HU de origem será consumida</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuantityTypeChange(false)}
                                className={`p-2.5 rounded-lg border text-xs font-semibold transition-all ${!isAllQuantity ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}
                            >
                                Saldo Parcial
                                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">Mantém saldo restante na origem</span>
                            </button>
                        </div>

                        {!isAllQuantity && (
                            <div className="pt-1">
                                <Input
                                    type="number"
                                    step="0.0001"
                                    max={sourceHu?.currentQuantity}
                                    placeholder="Digite a quantidade..."
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="h-9 text-xs font-mono font-bold"
                                    required
                                />
                            </div>
                        )}
                    </div>

                    {/* SELEÇÃO DA HU DESTINO */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700 uppercase">HU de Destino *</Label>
                        {isLoadingCandidates ? (
                            <div className="p-4 text-center text-xs text-slate-400">
                                <Loader2 className="h-4 w-4 animate-spin mx-auto text-blue-600 mb-1" />
                                Buscando HUs compatíveis da mesma nota...
                            </div>
                        ) : candidates.length === 0 ? (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                                <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                                <span>Nenhuma outra HU compatível encontrada (mesma nota, mesmo SKU e mesmo lote).</span>
                            </div>
                        ) : (
                            <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-1.5">
                                {candidates.map(c => {
                                    const isSel = c.id === destinationHuId;
                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => setDestinationHuId(c.id)}
                                            className={`p-2 rounded-lg cursor-pointer flex justify-between items-center text-xs transition-colors ${isSel ? 'bg-blue-50 border border-blue-300 text-blue-900 font-bold' : 'hover:bg-slate-50 border border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-2 font-mono">
                                                <Layers size={14} className={isSel ? 'text-blue-600' : 'text-slate-400'} />
                                                <span>{c.lpn}</span>
                                                <span className="text-[10px] text-slate-400">({c.locationPath || 'Doca'})</span>
                                            </div>
                                            <Badge variant="outline" className="font-mono text-[10px]">
                                                {c.currentQuantity} {c.unit || 'UN'}
                                            </Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || !destinationHuId || !quantity || candidates.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            Confirmar Agrupamento
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}