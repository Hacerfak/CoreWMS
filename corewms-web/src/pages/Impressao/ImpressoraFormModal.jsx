import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiPrintingPrinters, usePutApiPrintingPrintersId } from '@/api/generated/printing/printing';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Printer, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const impressoraSchema = z.object({
    name: z.string().min(3, 'Mínimo 3 caracteres.').max(100),
    target: z.string().min(4, 'Informe o alvo válido.')
});

export default function ImpressoraFormModal({ open, onOpenChange, agentId, impressoraToEdit }) {
    const queryClient = useQueryClient();
    const isEditing = !!impressoraToEdit;

    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(impressoraSchema),
        defaultValues: { name: '', target: '' }
    });

    useEffect(() => {
        if (open) {
            reset(isEditing ? { name: impressoraToEdit.name, target: impressoraToEdit.target } : { name: '', target: '' });
        }
    }, [open, isEditing, impressoraToEdit, reset]);

    const { mutate: createPrinter, isPending: isCreating } = usePostApiPrintingPrinters({
        mutation: {
            onSuccess: () => handleSuccess('Impressora adicionada!'),
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar.')
        }
    });

    const { mutate: updatePrinter, isPending: isUpdating } = usePutApiPrintingPrintersId({
        mutation: {
            onSuccess: () => handleSuccess('Impressora atualizada!'),
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar.')
        }
    });

    const handleSuccess = (msg) => {
        toast.success(msg);
        queryClient.invalidateQueries({ queryKey: ['/api/printing/agents'] });
        onOpenChange(false);
    };

    const onSubmit = (data) => {
        if (isEditing) updatePrinter({ id: impressoraToEdit.id, data: { name: data.name, target: data.target } });
        else createPrinter({ data: { printAgentId: agentId, name: data.name, target: data.target } });
    };

    const isPending = isCreating || isUpdating;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Printer className="text-blue-600" size={20} />
                        {isEditing ? 'Editar Impressora' : 'Nova Impressora'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Nome da Impressora *</Label>
                        <Input {...register('name')} placeholder="Ex: ZEBRA-EXPEDICAO" />
                        {errors.name && <p className="text-xs text-rose-500 flex items-center gap-1 mt-1"><AlertCircle size={12} /> {errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label>Target (IP ou Caminho) *</Label>
                        <Input {...register('target')} placeholder="Ex: 192.168.0.100:9100" />
                        {errors.target && <p className="text-xs text-rose-500 flex items-center gap-1 mt-1"><AlertCircle size={12} /> {errors.target.message}</p>}
                    </div>

                    <DialogFooter className="pt-4 border-t border-slate-100">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={isPending} className="bg-slate-900 text-white min-w-[120px]">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar</>}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}