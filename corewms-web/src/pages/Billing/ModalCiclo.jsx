import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { customInstance } from '@/api/orval-mutator';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonthPicker } from '@/components/ui/month-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Calendar, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const cycleSchema = z.object({
    customerId: z.string().min(1, 'Selecione o depositante.'),
    referenceMonth: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/, 'Formato deve ser MM/YYYY (Ex: 10/2026)')
});

// Calcula automaticamente o 1º e último dia de um mês no formato MM/YYYY
const getDefaultRangeForMonth = (refMonth) => {
    if (!refMonth || !refMonth.includes('/')) return undefined;
    const [mStr, yStr] = refMonth.split('/');
    const month = parseInt(mStr, 10) - 1;
    const year = parseInt(yStr, 10);
    if (isNaN(month) || isNaN(year)) return undefined;

    return {
        from: new Date(year, month, 1),
        to: new Date(year, month + 1, 0)
    };
};

export default function ModalCiclo({ isOpen, onOpenChange, customers, reload }) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const today = new Date();
    const currentRefMonth = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const [dateRange, setDateRange] = useState(() => getDefaultRangeForMonth(currentRefMonth));

    const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(cycleSchema),
        defaultValues: {
            customerId: '',
            referenceMonth: currentRefMonth
        }
    });

    const selectedRefMonth = watch('referenceMonth');

    // Ao alterar o mês de competência, ajusta o período sugerido caso o usuário não tenha personalizado
    const handleMonthChange = (newMonth) => {
        setValue('referenceMonth', newMonth, { shouldValidate: true });
        if (newMonth) {
            setDateRange(getDefaultRangeForMonth(newMonth));
        }
    };

    // Reseta os campos ao abrir o modal
    useEffect(() => {
        if (isOpen) {
            setValue('referenceMonth', currentRefMonth);
            setDateRange(getDefaultRangeForMonth(currentRefMonth));
        }
    }, [isOpen, setValue, currentRefMonth]);

    const onSave = async (data) => {
        if (!dateRange?.from) {
            toast.warning('Selecione o período contábil do ciclo.');
            return;
        }

        try {
            setIsSubmitting(true);

            // Início do 1º dia às 00:00:00.000 e fim do último dia às 23:59:59.999
            const fromDate = new Date(dateRange.from);
            fromDate.setHours(0, 0, 0, 0);
            const startUtc = fromDate.toISOString();

            const toDate = new Date(dateRange.to || dateRange.from);
            toDate.setHours(23, 59, 59, 999);
            const endUtc = toDate.toISOString();

            await customInstance({
                url: '/api/billing/cycles/generate',
                method: 'POST',
                data: {
                    customerId: data.customerId,
                    referenceMonth: data.referenceMonth.trim(),
                    startDate: startUtc,
                    endDate: endUtc
                }
            });

            toast.success('Ciclo de faturamento aberto com sucesso!');
            reset({
                customerId: '',
                referenceMonth: currentRefMonth
            });
            setDateRange(getDefaultRangeForMonth(currentRefMonth));
            onOpenChange(false);
            reload();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao abrir ciclo de faturamento.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <Calendar className="text-blue-600" size={20} /> Abertura de Ciclo de Faturamento
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Abre a competência mensal para registrar as diárias e eventos operacionais.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSave)} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Depositante *</Label>
                        <Select value={watch('customerId')} onValueChange={(v) => setValue('customerId', v, { shouldValidate: true })}>
                            <SelectTrigger className="bg-white text-xs h-9">
                                <SelectValue placeholder="Escolha o depositante..." />
                            </SelectTrigger>
                            <SelectContent>
                                {customers.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.customerId && <p className="text-[10px] text-rose-500">{errors.customerId.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Mês de Competência Contábil *</Label>
                        <MonthPicker
                            value={selectedRefMonth}
                            onChange={handleMonthChange}
                            className="h-9"
                        />
                        {errors.referenceMonth && <p className="text-[10px] text-rose-500">{errors.referenceMonth.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-slate-700">Período Contábil do Ciclo *</Label>
                            <span className="text-[10px] text-slate-400">00:00 às 23:59</span>
                        </div>
                        <DateRangePicker
                            date={dateRange}
                            setDate={setDateRange}
                            className="w-full"
                        />
                    </div>

                    <DialogFooter className="pt-3">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            Abrir Ciclo
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}