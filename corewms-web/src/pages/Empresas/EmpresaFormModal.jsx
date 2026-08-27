import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { usePutApiCompaniesId } from '@/api/generated/companies/companies';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const empresaSchema = z.object({
    corporateName: z.string().min(3, 'A Razão Social é obrigatória.').max(150),
    tradeName: z.string().optional(),
    state: z.string().length(2, 'Informe a UF com exatamente 2 letras.')
});

export default function EmpresaFormModal({ open, onOpenChange, empresaToEdit }) {
    const queryClient = useQueryClient();

    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(empresaSchema)
    });

    // Se recebermos uma empresa para editar, preenchemos o form magicamente!
    useEffect(() => {
        if (open && empresaToEdit) {
            reset({
                corporateName: empresaToEdit.corporateName,
                tradeName: empresaToEdit.tradeName || '',
                state: empresaToEdit.state
            });
        }
    }, [open, empresaToEdit, reset]);

    const { mutate: updateCompany, isPending } = usePutApiCompaniesId({
        mutation: {
            onSuccess: () => {
                toast.success('Dados da empresa atualizados!');
                queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar.')
        }
    });

    const onSubmit = (data) => {
        updateCompany({
            id: empresaToEdit.id,
            data: data
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <Building2 className="text-blue-600" size={20} /> Editar Empresa
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Ajuste os dados cadastrais da empresa selecionada.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="corporateName">Razão Social *</Label>
                        <Input id="corporateName" {...register('corporateName')} />
                        {errors.corporateName && <p className="text-xs text-rose-500 flex items-center gap-1"><AlertCircle size={12} /> {errors.corporateName.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="tradeName">Nome Fantasia</Label>
                        <Input id="tradeName" {...register('tradeName')} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="state">Estado (UF) *</Label>
                        <Input id="state" maxLength={2} className="uppercase" {...register('state')} />
                        {errors.state && <p className="text-xs text-rose-500 flex items-center gap-1"><AlertCircle size={12} /> {errors.state.message}</p>}
                    </div>

                    <DialogFooter className="pt-4 border-t border-slate-100">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={isPending} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[120px]">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Atualizar</>}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}