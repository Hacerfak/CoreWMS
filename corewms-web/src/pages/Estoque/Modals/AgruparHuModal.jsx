import { useState, useEffect, useRef } from 'react';
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
import { Merge, Loader2, CheckCircle2, ScanLine } from 'lucide-react';
import { toast } from 'sonner';

export default function AgruparHuModal({ open, onOpenChange, sourceHu, onSuccess }) {
    const [destinationLpn, setDestinationLpn] = useState('');
    const [quantity, setQuantity] = useState('');
    const [isAllQuantity, setIsAllQuantity] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputLpnRef = useRef(null);

    useEffect(() => {
        if (open && sourceHu) {
            setIsAllQuantity(true);
            setQuantity(String(sourceHu.currentQuantity));
            setDestinationLpn('');

            // Foca automaticamente no campo de bipagem ao abrir o modal
            setTimeout(() => {
                inputLpnRef.current?.focus();
            }, 100);
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

        const cleanDestLpn = destinationLpn.trim().toUpperCase();
        const numQty = Number(quantity);

        if (!cleanDestLpn) {
            return toast.warning('Bipe ou digite o código LPN da HU de destino.');
        }

        if (cleanDestLpn === sourceHu?.lpn?.toUpperCase()) {
            return toast.warning('A HU de destino não pode ser a mesma HU de origem.');
        }

        if (!numQty || numQty <= 0) {
            return toast.warning('Informe uma quantidade válida para transferência.');
        }

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
                    destinationLpn: cleanDestLpn,
                    quantity: numQty
                }
            });

            toast.success(res?.message || 'HUs agrupadas com sucesso!');
            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            const data = err.response?.data;
            const msg = data?.message || data?.title || (data?.errors ? Object.values(data.errors).flat()[0] : null) || err.message || 'Erro ao agrupar HUs.';
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Merge className="h-5 w-5 text-blue-600" /> Agrupar Unidade de Manuseio (HU)
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Transfira saldo desta HU para outra HU existente da mesma nota fiscal.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    {/* DADOS DA HU DE ORIGEM */}
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-xs">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">HU Origem</span>
                        <div className="flex justify-between items-center">
                            <span className="font-mono font-bold text-sm text-slate-900">{sourceHu?.lpn}</span>
                            <Badge variant="outline" className="font-mono bg-white text-blue-700 border-blue-200">
                                Saldo: {sourceHu?.currentQuantity} {sourceHu?.unit || 'UN'}
                            </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-slate-600 font-mono text-[11px] pt-1.5 border-t border-slate-200/60">
                            <span className="truncate">SKU: <strong>{sourceHu?.productSku}</strong></span>
                            <span>Lote: <strong>{sourceHu?.batch || 'Sem Lote'}</strong></span>
                        </div>
                    </div>

                    {/* QUANTIDADE A TRANSFERIR */}
                    <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-700 uppercase">Quantidade a Transferir *</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => handleQuantityTypeChange(true)}
                                className={`p-2.5 rounded-lg border text-xs font-semibold transition-all ${isAllQuantity
                                    ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-2xs'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                Saldo Total ({sourceHu?.currentQuantity})
                                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">Consome a HU de origem</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuantityTypeChange(false)}
                                className={`p-2.5 rounded-lg border text-xs font-semibold transition-all ${!isAllQuantity
                                    ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-2xs'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                Saldo Parcial
                                <span className="block text-[10px] text-slate-400 font-normal mt-0.5">Mantém saldo restante</span>
                            </button>
                        </div>

                        {!isAllQuantity && (
                            <div className="pt-1">
                                <Input
                                    type="number"
                                    step="0.0001"
                                    max={sourceHu?.currentQuantity}
                                    placeholder="Informe a quantidade..."
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="h-9 text-xs font-mono font-bold bg-white"
                                    required
                                />
                            </div>
                        )}
                    </div>

                    {/* BIPAGEM / DIGITAÇÃO DO LPN DE DESTINO */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700 uppercase flex items-center justify-between">
                            <span>HU de Destino *</span>
                            <span className="text-[10px] text-slate-400 font-normal">Bipe ou digite o código</span>
                        </Label>
                        <div className="relative">
                            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600 pointer-events-none" />
                            <Input
                                ref={inputLpnRef}
                                placeholder="Bipar código da HU de destino..."
                                value={destinationLpn}
                                onChange={(e) => setDestinationLpn(e.target.value.toUpperCase())}
                                className="pl-9 h-10 text-xs font-mono font-bold uppercase tracking-wider bg-white border-slate-200 focus:border-blue-500"
                                required
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || !destinationLpn.trim() || !quantity}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 shadow-xs text-xs"
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