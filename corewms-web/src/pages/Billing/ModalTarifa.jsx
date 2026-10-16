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
import { DollarSign, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const getTodayLocalString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const tariffSchema = z.object({
    customerId: z.string().min(1, 'Selecione o depositante.'),
    billingServiceId: z.string().min(1, 'Selecione o serviço.'),
    unitValue: z.number().min(0, 'Informe um valor válido.'),
    validFrom: z.string().min(1, 'Informe a data de início da vigência.')
});

export default function ModalTarifa({ isOpen, onOpenChange, customers, services, reload }) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(tariffSchema),
        defaultValues: { customerId: '', billingServiceId: '', unitValue: 0, validFrom: getTodayLocalString() }
    });

    const onSave = async (data) => {
        try {
            setIsSubmitting(true);
            const validFromUtc = `${data.validFrom.split('T')[0]}T00:00:00.000Z`;

            await customInstance({
                url: '/api/billing/tariffs',
                method: 'POST',
                data: {
                    customerId: data.customerId,
                    billingServiceId: data.billingServiceId,
                    unitValue: Number(data.unitValue),
                    validFrom: validFromUtc
                }
            });
            toast.success('Tarifa cadastrada com sucesso!');
            reset({ customerId: '', billingServiceId: '', unitValue: 0, validFrom: getTodayLocalString() });
            onOpenChange(false);
            reload();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao cadastrar tarifa.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <DollarSign className="text-emerald-600" size={20} /> Cadastrar Tarifa por Depositante
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Defina o valor cobrado para o serviço contratado pelo cliente.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSave)} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Depositante *</Label>
                        <Select value={watch('customerId')} onValueChange={(v) => setValue('customerId', v, { shouldValidate: true })}>
                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue placeholder="Escolha o depositante..." /></SelectTrigger>
                            <SelectContent>
                                {customers.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.customerId && <p className="text-[10px] text-rose-500">{errors.customerId.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Serviço Logístico *</Label>
                        <Select value={watch('billingServiceId')} onValueChange={(v) => setValue('billingServiceId', v, { shouldValidate: true })}>
                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue placeholder="Escolha o serviço..." /></SelectTrigger>
                            <SelectContent>
                                {services.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.billingServiceId && <p className="text-[10px] text-rose-500">{errors.billingServiceId.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Valor Unitário R$ *</Label>
                            <Input
                                type="number"
                                step="any"
                                placeholder="0,0000000000"
                                onChange={(e) => setValue('unitValue', parseFloat(e.target.value) || 0, { shouldValidate: true })}
                                className="bg-white font-mono text-xs h-9"
                            />
                            {errors.unitValue && <p className="text-[10px] text-rose-500">{errors.unitValue.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Início da Vigência *</Label>
                            <Input
                                type="date"
                                value={watch('validFrom')}
                                onChange={(e) => setValue('validFrom', e.target.value, { shouldValidate: true })}
                                className="bg-white text-xs font-mono h-9"
                            />
                            {errors.validFrom && <p className="text-[10px] text-rose-500">{errors.validFrom.message}</p>}
                        </div>
                    </div>

                    <DialogFooter className="pt-3">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            Gravar Tarifa
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}