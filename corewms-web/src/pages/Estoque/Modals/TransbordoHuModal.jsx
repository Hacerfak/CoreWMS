import { useState, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Split, Loader2, CheckCircle2, Plus, Trash2, AlertCircle, Package } from 'lucide-react';
import { toast } from 'sonner';

export default function TransbordoHuModal({ open, onOpenChange, sourceHu, onSuccess }) {
    const [packagings, setPackagings] = useState([]);
    const [isLoadingPackagings, setIsLoadingPackagings] = useState(false);
    const [newHus, setNewHus] = useState([{ quantity: '', packagingTypeId: '' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open && sourceHu) {
            setNewHus([{ quantity: '', packagingTypeId: sourceHu.packagingTypeId || '' }]);

            const productId = sourceHu.productId;
            if (productId) {
                setIsLoadingPackagings(true);
                // Consulta estrita ao endpoint de embalagens do produto
                customInstance({ url: `/api/products/${productId}/packagings`, method: 'GET' })
                    .then(res => {
                        const items = res?.data || res || [];
                        setPackagings(Array.isArray(items) ? items : []);
                    })
                    .catch(() => {
                        toast.error('Não foi possível carregar as embalagens cadastradas para este produto.');
                        setPackagings([]);
                    })
                    .finally(() => setIsLoadingPackagings(false));
            } else {
                setPackagings([]);
            }
        }
    }, [open, sourceHu]);

    const handleAddLine = () => {
        setNewHus(prev => [...prev, { quantity: '', packagingTypeId: sourceHu?.packagingTypeId || '' }]);
    };

    const handleRemoveLine = (index) => {
        if (newHus.length === 1) return;
        setNewHus(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpdateLine = (index, field, value) => {
        setNewHus(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
    };

    const totalToTransfer = newHus.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
    const remainingInSource = (sourceHu?.currentQuantity || 0) - totalToTransfer;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (newHus.some(h => !h.quantity || Number(h.quantity) <= 0)) {
            return toast.warning('Indique uma quantidade válida (> 0) para cada nova HU gerada.');
        }

        // REGRA ESTRITA: O transbordo NÃO pode transferir 100% do saldo da origem
        if (totalToTransfer >= sourceHu.currentQuantity) {
            return toast.warning(
                `Não é permitido transbordar todo o saldo da HU (${sourceHu.currentQuantity}). O transbordo exige a retenção de saldo residual. Para transferir a totalidade, utilize o Agrupamento.`
            );
        }

        try {
            setIsSubmitting(true);
            const res = await customInstance({
                url: '/api/inventory/handling-units/split',
                method: 'POST',
                data: {
                    sourceHandlingUnitId: sourceHu.id,
                    newHandlingUnits: newHus.map(h => ({
                        quantity: Number(h.quantity),
                        packagingTypeId: h.packagingTypeId || null
                    }))
                }
            });

            toast.success(res?.message || 'Transbordo realizado com sucesso!');
            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            const data = err.response?.data;
            const msg = data?.message || data?.title || (data?.errors ? Object.values(data.errors).flat()[0] : null) || err.message || 'Erro ao realizar transbordo.';
            toast.error(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Split className="h-5 w-5 text-purple-600" /> Divisão / Transbordo de HU
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Crie novas HUs filhas transferindo parte do saldo disponível desta unidade de manuseio.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    {/* RESUMO DA HU DE ORIGEM */}
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-sm text-slate-900">{sourceHu?.lpn}</span>
                            <Badge className="bg-slate-200 text-slate-800 border-none font-bold">
                                Saldo Atual: {sourceHu?.currentQuantity} {sourceHu?.unit || 'UN'}
                            </Badge>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-slate-200/60 text-slate-500 text-[11px]">
                            <span>A transbordar: <strong className="text-purple-700">{totalToTransfer}</strong></span>
                            <span>
                                Saldo Restante na Origem:{' '}
                                <strong className={remainingInSource <= 0 ? "text-rose-600 font-bold" : "text-emerald-700 font-bold"}>
                                    {remainingInSource}
                                </strong>
                            </span>
                        </div>
                    </div>

                    {remainingInSource <= 0 && (
                        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                            <AlertCircle size={15} className="shrink-0 text-rose-600" />
                            <span>O transbordo requer a permanência de saldo residual na HU de origem.</span>
                        </div>
                    )}

                    {/* LISTAGEM DE NOVAS HUS */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                Novas HUs a Gerar
                            </Label>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleAddLine}
                                className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                            >
                                <Plus size={12} className="mr-1" /> Adicionar HU
                            </Button>
                        </div>

                        <div className="space-y-2">
                            {newHus.map((item, index) => (
                                <div key={index} className="flex items-center gap-2 p-2 bg-slate-50/70 border border-slate-200 rounded-lg">
                                    <span className="text-xs font-mono font-bold text-slate-400 w-6 text-center">#{index + 1}</span>

                                    <div className="flex-1">
                                        <Input
                                            type="number"
                                            step="0.0001"
                                            placeholder="Quantidade..."
                                            value={item.quantity}
                                            onChange={(e) => handleUpdateLine(index, 'quantity', e.target.value)}
                                            className="h-8 text-xs font-mono font-bold bg-white"
                                            required
                                        />
                                    </div>

                                    <div className="w-48">
                                        <Select
                                            value={item.packagingTypeId}
                                            onValueChange={(val) => handleUpdateLine(index, 'packagingTypeId', val)}
                                        >
                                            <SelectTrigger className="h-8 text-xs bg-white">
                                                <SelectValue placeholder={isLoadingPackagings ? "A carregar..." : "Embalagem..."} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {packagings.length === 0 ? (
                                                    <div className="p-2 text-center text-xs text-slate-400">
                                                        Sem embalagens cadastradas
                                                    </div>
                                                ) : (
                                                    packagings.map(p => (
                                                        <SelectItem key={p.packagingTypeId} value={p.packagingTypeId}>
                                                            {p.code} {p.description ? `- ${p.description}` : ''}
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {newHus.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveLine(index)}
                                            className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                        >
                                            <Trash2 size={13} />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || totalToTransfer <= 0 || remainingInSource <= 0}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-9 shadow-xs text-xs"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            Gerar {newHus.length} Nova(s) HU(s)
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}