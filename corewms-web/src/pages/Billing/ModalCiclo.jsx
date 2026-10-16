import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { customInstance } from '@/api/orval-mutator';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const cycleSchema = z.object({
    customerId: z.string().min(1, 'Selecione o depositante.'),
    referenceMonth: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/, 'Formato deve ser MM/YYYY (Ex: 10/2026)'),
    startDate: z.string().min(1, 'Informe a data inicial.'),
    endDate: z.string().min(1, 'Informe a data final.')
});

export default function ModalCiclo({ isOpen, onOpenChange, customers, reload }) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const today = new Date();
    const currentRefMonth = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(cycleSchema),
        defaultValues: {
            customerId: '',
            referenceMonth: currentRefMonth,
            startDate: '',
            endDate: ''
        }
    });

    const onSave = async (data) => {
        try {
            setIsSubmitting(true);
            const startUtc = `${data.startDate.split('T')[0]}T00:00:00.000Z`;
            const endUtc = `${data.endDate.split('T')[0]}T23:59:59.999Z`;

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
                referenceMonth: currentRefMonth,
                startDate: '',
                endDate: ''
            });
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
                        <Label className="text-xs font-semibold text-slate-700">Competência (MM/YYYY) *</Label>
                        <Input
                            placeholder="Ex: 10/2026"
                            value={watch('referenceMonth')}
                            onChange={(e) => setValue('referenceMonth', e.target.value, { shouldValidate: true })}
                            className="bg-white font-mono text-xs h-9"
                        />
                        {errors.referenceMonth && <p className="text-[10px] text-rose-500">{errors.referenceMonth.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Data Inicial *</Label>
                            <Input
                                type="date"
                                onChange={(e) => setValue('startDate', e.target.value, { shouldValidate: true })}
                                className="bg-white text-xs h-9"
                            />
                            {errors.startDate && <p className="text-[10px] text-rose-500">{errors.startDate.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Data Final *</Label>
                            <Input
                                type="date"
                                onChange={(e) => setValue('endDate', e.target.value, { shouldValidate: true })}
                                className="bg-white text-xs h-9"
                            />
                            {errors.endDate && <p className="text-[10px] text-rose-500">{errors.endDate.message}</p>}
                        </div>
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