import { useState, useEffect, useMemo } from 'react';
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
import { Pencil, Loader2, CheckCircle2, Layers, Scale, Calendar, Barcode } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePickerTime } from '@/components/ui/date-picker-time';

export default function EditarHuModal({ open, onOpenChange, hu = null, hus = [], onSuccess }) {
    const [packagings, setPackagings] = useState([]);
    const [isLoadingPackagings, setIsLoadingPackagings] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const targetHus = useMemo(() => {
        if (Array.isArray(hus) && hus.length > 0) return hus;
        if (hu) return [hu];
        return [];
    }, [hu, hus]);

    const isBatch = targetHus.length > 1;
    const firstHu = targetHus[0];

    const [form, setForm] = useState({
        batch: '',
        mfgDate: undefined,
        expDate: undefined,
        serialNumber: '',
        createdAt: undefined,
        packagingTypeId: '',
        unitNetWeight: '',
        unitGrossWeight: ''
    });

    useEffect(() => {
        if (!open || targetHus.length === 0) return;

        // Recupera o ProductId de forma resiliente
        const productId = firstHu?.productId;

        if (productId) {
            setIsLoadingPackagings(true);
            customInstance({ url: `/api/products/${productId}/packagings`, method: 'GET' })
                .then(res => {
                    const items = res?.data || res || [];
                    setPackagings(Array.isArray(items) ? items : []);
                })
                .catch(() => {
                    setPackagings([]);
                })
                .finally(() => setIsLoadingPackagings(false));
        } else {
            setPackagings([]);
        }

        if (!isBatch) {
            setForm({
                batch: firstHu.batch || '',
                mfgDate: firstHu.manufactureDate ? new Date(firstHu.manufactureDate) : undefined,
                expDate: firstHu.expirationDate ? new Date(firstHu.expirationDate) : undefined,
                serialNumber: firstHu.serialNumber || '',
                createdAt: firstHu.createdAt ? new Date(firstHu.createdAt) : new Date(),
                packagingTypeId: firstHu.packagingTypeId || '',
                unitNetWeight: firstHu.unitNetWeight !== undefined && firstHu.unitNetWeight !== null ? String(firstHu.unitNetWeight) : '',
                unitGrossWeight: firstHu.unitGrossWeight !== undefined && firstHu.unitGrossWeight !== null ? String(firstHu.unitGrossWeight) : ''
            });
        } else {
            setForm({
                batch: '',
                mfgDate: undefined,
                expDate: undefined,
                serialNumber: '',
                createdAt: undefined,
                packagingTypeId: '',
                unitNetWeight: '',
                unitGrossWeight: ''
            });
        }
    }, [open, targetHus, isBatch, firstHu]);

    const handlePackagingSelect = (packagingTypeId) => {
        const selectedPack = packagings.find(p => p.packagingTypeId === packagingTypeId);
        setForm(prev => ({
            ...prev,
            packagingTypeId,
            unitNetWeight: (!prev.unitNetWeight && selectedPack?.netWeight) ? String(selectedPack.netWeight) : prev.unitNetWeight,
            unitGrossWeight: (!prev.unitGrossWeight && selectedPack?.grossWeight) ? String(selectedPack.grossWeight) : prev.unitGrossWeight
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const netWeightNum = form.unitNetWeight !== '' ? Number(form.unitNetWeight) : null;
        const grossWeightNum = form.unitGrossWeight !== '' ? Number(form.unitGrossWeight) : null;

        if (netWeightNum !== null && netWeightNum < 0) {
            return toast.warning('O peso líquido unitário não pode ser negativo.');
        }

        if (grossWeightNum !== null && grossWeightNum < 0) {
            return toast.warning('O peso bruto unitário não pode ser negativo.');
        }

        if (netWeightNum !== null && grossWeightNum !== null && grossWeightNum < netWeightNum) {
            return toast.warning('O peso bruto unitário não pode ser menor que o peso líquido.');
        }

        try {
            setIsLoading(true);

            if (isBatch) {
                await customInstance({
                    url: '/api/inventory/handling-units/batch',
                    method: 'PUT',
                    data: {
                        handlingUnitIds: targetHus.map(h => h.id),
                        batch: form.batch ? form.batch.trim().toUpperCase() : null,
                        manufactureDate: form.mfgDate ? new Date(form.mfgDate).toISOString() : null,
                        expirationDate: form.expDate ? new Date(form.expDate).toISOString() : null,
                        createdAt: form.createdAt ? new Date(form.createdAt).toISOString() : null,
                        packagingTypeId: form.packagingTypeId || null,
                        unitNetWeight: netWeightNum,
                        unitGrossWeight: grossWeightNum
                    }
                });

                toast.success(`${targetHus.length} HUs atualizadas em lote com sucesso!`);
            } else {
                await customInstance({
                    url: `/api/inventory/handling-units/${firstHu.id}`,
                    method: 'PUT',
                    data: {
                        id: firstHu.id,
                        batch: form.batch ? form.batch.trim().toUpperCase() : null,
                        manufactureDate: form.mfgDate ? new Date(form.mfgDate).toISOString() : null,
                        expirationDate: form.expDate ? new Date(form.expDate).toISOString() : null,
                        serialNumber: form.serialNumber ? form.serialNumber.trim().toUpperCase() : null,
                        createdAt: form.createdAt ? new Date(form.createdAt).toISOString() : null,
                        packagingTypeId: form.packagingTypeId || null,
                        unitNetWeight: netWeightNum,
                        unitGrossWeight: grossWeightNum
                    }
                });

                toast.success(`HU ${firstHu.lpn} atualizada com sucesso!`);
            }

            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao atualizar dados da(s) HU(s).');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl bg-white p-0 overflow-hidden shadow-xl border-slate-200">
                {/* CABEÇALHO PADRÃO WMS */}
                <DialogHeader className="p-5 border-b border-slate-100 bg-slate-50/70">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60">
                            <Pencil className="h-4 w-4" />
                        </div>
                        <div>
                            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                                {isBatch ? 'Editar HUs em Lote' : `Editar HU ${firstHu?.lpn}`}
                                {isBatch ? (
                                    <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-mono text-[10px]">
                                        {targetHus.length} volumes
                                    </Badge>
                                ) : (
                                    firstHu?.packagingTypeCode && (
                                        <Badge variant="outline" className="font-mono text-[10px] text-slate-600 bg-white">
                                            {firstHu.packagingTypeCode}
                                        </Badge>
                                    )
                                )}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-500 mt-0.5">
                                {isBatch
                                    ? 'Os campos preenchidos serão replicados para os volumes selecionados.'
                                    : 'Ajuste os dados de rastreabilidade, pesagem e marcos temporais.'}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* FORMULÁRIO */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* BANNER DE INFORMAÇÕES CONTEXTUAIS */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">Produto / SKU</span>
                            <span className="font-mono font-bold text-slate-900 truncate block" title={firstHu?.productDescription}>
                                {firstHu?.productSku} {firstHu?.productDescription ? `- ${firstHu.productDescription}` : ''}
                            </span>
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">Posição</span>
                            <span className="font-mono font-semibold text-slate-800 block">
                                {firstHu?.locationPath || 'Na Doca'}
                            </span>
                        </div>
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">Saldo Físico</span>
                            <span className="font-mono font-bold text-blue-700 block">
                                {firstHu?.currentQuantity?.toLocaleString('pt-BR')} {firstHu?.unit || 'UN'}
                            </span>
                        </div>
                    </div>

                    {/* SEÇÃO 1: RASTREABILIDADE */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 border-b border-slate-100 pb-1.5 uppercase tracking-wide">
                            <Barcode className="h-3.5 w-3.5 text-blue-600" /> Rastreabilidade
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-700">Lote Físico</Label>
                                <Input
                                    placeholder="Digite o lote..."
                                    className="h-9 font-mono uppercase bg-white border-slate-200 text-xs"
                                    value={form.batch}
                                    onChange={(e) => setForm({ ...form, batch: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-700 flex justify-between">
                                    <span>Número de Série</span>
                                    {isBatch && <span className="text-[10px] text-amber-600 font-normal">Bloqueado em lote</span>}
                                </Label>
                                <Input
                                    placeholder={isBatch ? "Indisponível em lote" : "Digite a série..."}
                                    disabled={isBatch}
                                    className="h-9 font-mono uppercase bg-white border-slate-200 text-xs disabled:bg-slate-100"
                                    value={form.serialNumber}
                                    onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* SEÇÃO 2: MARCOS TEMPORAIS (ORGANIZAÇÃO EM 2 COLUNAS PARA EVITAR CORTES) */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 border-b border-slate-100 pb-1.5 uppercase tracking-wide">
                            <Calendar className="h-3.5 w-3.5 text-blue-600" /> Prazos e Entrada
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-700">Data de Fabricação</Label>
                                <DatePicker
                                    date={form.mfgDate}
                                    setDate={(d) => setForm({ ...form, mfgDate: d })}
                                    placeholder="DD/MM/AAAA"
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-700">Data de Validade</Label>
                                <DatePicker
                                    date={form.expDate}
                                    setDate={(d) => setForm({ ...form, expDate: d })}
                                    placeholder="DD/MM/AAAA"
                                    className="w-full"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-700">Entrada no Armazém</Label>
                            <DatePickerTime
                                date={form.createdAt}
                                setDate={(d) => setForm({ ...form, createdAt: d })}
                                className="w-full sm:w-80"
                            />
                        </div>
                    </div>

                    {/* SEÇÃO 3: EMBALAGEM E PESOS */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 border-b border-slate-100 pb-1.5 uppercase tracking-wide">
                            <Scale className="h-3.5 w-3.5 text-blue-600" /> Embalagem e Pesagem
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                            <div className="sm:col-span-6 space-y-1">
                                <Label className="text-xs font-semibold text-slate-700">Embalagem Homologada</Label>
                                <Select
                                    value={form.packagingTypeId}
                                    onValueChange={handlePackagingSelect}
                                    disabled={isLoadingPackagings || packagings.length === 0}
                                >
                                    <SelectTrigger className="h-9 bg-white border-slate-200 text-xs">
                                        <SelectValue placeholder={
                                            isLoadingPackagings
                                                ? "Carregando embalagens..."
                                                : packagings.length === 0
                                                    ? "Sem embalagens homologadas"
                                                    : "Selecione a embalagem..."
                                        } />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {packagings.map(p => (
                                            <SelectItem key={p.packagingTypeId} value={p.packagingTypeId}>
                                                <span className="font-mono font-bold mr-1.5">{p.code}</span>
                                                {p.description && <span className="text-slate-500">({p.description})</span>}
                                                {p.conversionFactor > 1 && (
                                                    <span className="text-[10px] text-blue-600 font-mono ml-1.5 font-semibold">
                                                        [{p.conversionFactor} UN]
                                                    </span>
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="sm:col-span-3 space-y-1">
                                <Label className="text-xs font-semibold text-slate-700">Peso Líquido (kg)</Label>
                                <Input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    placeholder="0.0000"
                                    className="h-9 font-mono bg-white border-slate-200 text-xs"
                                    value={form.unitNetWeight}
                                    onChange={(e) => setForm({ ...form, unitNetWeight: e.target.value })}
                                />
                            </div>

                            <div className="sm:col-span-3 space-y-1">
                                <Label className="text-xs font-semibold text-slate-700">Peso Bruto (kg)</Label>
                                <Input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    placeholder="0.0000"
                                    className="h-9 font-mono bg-white border-slate-200 text-xs"
                                    value={form.unitGrossWeight}
                                    onChange={(e) => setForm({ ...form, unitGrossWeight: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* RODAPÉ */}
                    <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-xs bg-white">
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 px-5 text-xs shadow-xs"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            {isBatch ? `Aplicar a ${targetHus.length} HUs` : 'Salvar Alterações'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}