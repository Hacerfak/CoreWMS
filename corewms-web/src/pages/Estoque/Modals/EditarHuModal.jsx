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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/date-picker';
import { DatePickerTime } from '@/components/ui/date-picker-time';

export default function EditarHuModal({ open, onOpenChange, hu, onSuccess }) {
    const [packagings, setPackagings] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [form, setForm] = useState({
        batch: '',
        mfgDate: undefined,
        expDate: undefined,
        serialNumber: '',
        createdAt: new Date(),
        consumedAt: undefined,
        packagingTypeId: '',
        unitValue: ''
    });

    useEffect(() => {
        if (open && hu) {
            setForm({
                batch: hu.batch || '',
                mfgDate: hu.manufactureDate ? new Date(hu.manufactureDate) : undefined,
                expDate: hu.expirationDate ? new Date(hu.expirationDate) : undefined,
                serialNumber: hu.serialNumber || '',
                createdAt: hu.createdAt ? new Date(hu.createdAt) : new Date(),
                consumedAt: hu.consumedAt ? new Date(hu.consumedAt) : undefined,
                packagingTypeId: hu.packagingTypeId || '',
                unitValue: hu.unitValue !== undefined && hu.unitValue !== null ? String(hu.unitValue) : ''
            });

            customInstance({ url: '/api/topology/packaging-types', method: 'GET' })
                .then(res => setPackagings(Array.isArray(res?.data || res) ? (res?.data || res) : []))
                .catch(() => { });
        }
    }, [open, hu]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setIsLoading(true);

            await customInstance({
                url: `/api/inventory/handling-units/${hu.id}`,
                method: 'PUT',
                data: {
                    id: hu.id,
                    batch: form.batch ? form.batch.trim().toUpperCase() : null,
                    manufactureDate: form.mfgDate ? new Date(form.mfgDate).toISOString() : null,
                    expirationDate: form.expDate ? new Date(form.expDate).toISOString() : null,
                    serialNumber: form.serialNumber ? form.serialNumber.trim().toUpperCase() : null,
                    createdAt: form.createdAt ? new Date(form.createdAt).toISOString() : null,
                    packagingTypeId: form.packagingTypeId || null,
                    unitValue: form.unitValue ? Number(form.unitValue) : null,
                    consumedAt: form.consumedAt ? new Date(form.consumedAt).toISOString() : null
                }
            });

            toast.success('HU atualizada com sucesso!');
            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao atualizar dados da HU.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Pencil className="h-5 w-5 text-blue-600" /> Editar Unidade de Manuseio ({hu?.lpn})
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Ajuste os dados de rastreabilidade, embalagem ou data técnica de entrada.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <Label className="text-xs font-bold uppercase text-slate-700">Lote Físico</Label>
                            <Input
                                placeholder="Lote..."
                                className="h-9 mt-1 font-mono uppercase bg-white"
                                value={form.batch}
                                onChange={(e) => setForm({ ...form, batch: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-bold uppercase text-slate-700">Número de Série</Label>
                            <Input
                                placeholder="Série..."
                                className="h-9 mt-1 font-mono uppercase bg-white"
                                value={form.serialNumber}
                                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <Label className="text-xs font-bold uppercase text-slate-700 mb-1 block">Data Fabricação</Label>
                            <DatePicker
                                date={form.mfgDate}
                                setDate={(d) => setForm({ ...form, mfgDate: d })}
                                placeholder="DD/MM/AAAA"
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-bold uppercase text-slate-700 mb-1 block">Data Validade</Label>
                            <DatePicker
                                date={form.expDate}
                                setDate={(d) => setForm({ ...form, expDate: d })}
                                placeholder="DD/MM/AAAA"
                            />
                        </div>
                    </div>

                    <div className="text-xs">
                        <Label className="text-xs font-bold uppercase text-slate-700 mb-1 block">Data de Entrada no WMS</Label>
                        <DatePickerTime
                            date={form.createdAt}
                            setDate={(d) => setForm({ ...form, createdAt: d || new Date() })}
                        />
                    </div>

                    {(hu?.status === 'Consumed' || form.consumedAt) && (
                        <div className="text-xs">
                            <Label className="text-xs font-bold uppercase text-rose-700 mb-1 block">
                                Data de Finalização / Consumo (100%)
                            </Label>
                            <DatePickerTime
                                date={form.consumedAt}
                                setDate={(d) => setForm({ ...form, consumedAt: d })}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <Label className="text-xs font-bold uppercase text-slate-700">Tipo de Embalagem</Label>
                            <Select
                                value={form.packagingTypeId}
                                onValueChange={(val) => setForm({ ...form, packagingTypeId: val })}
                            >
                                <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                <SelectContent>
                                    {packagings.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.code} - {p.description}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs font-bold uppercase text-slate-700">Valor Unitário (R$)</Label>
                            <Input
                                type="number"
                                step="0.0001"
                                placeholder="0.00"
                                className="h-9 mt-1 font-mono bg-white"
                                value={form.unitValue}
                                onChange={(e) => setForm({ ...form, unitValue: e.target.value })}
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}