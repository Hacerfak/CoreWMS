import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiPrintingAgents, usePutApiPrintingAgentsId } from '@/api/generated/printing/printing';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Server, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const agenteSchema = z.object({
    name: z.string().min(3, 'Mínimo 3 caracteres.').max(100)
});

export default function AgenteFormModal({ open, onOpenChange, agenteToEdit }) {
    const queryClient = useQueryClient();
    const isEditing = !!agenteToEdit;

    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(agenteSchema),
        defaultValues: { name: '' }
    });

    useEffect(() => {
        if (open) {
            reset(isEditing ? { name: agenteToEdit.name } : { name: '' });
        }
    }, [open, isEditing, agenteToEdit, reset]);

    const { mutate: createAgent, isPending: isCreating } = usePostApiPrintingAgents({
        mutation: {
            onSuccess: () => handleSuccess('Agente criado!'),
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar.')
        }
    });

    const { mutate: updateAgent, isPending: isUpdating } = usePutApiPrintingAgentsId({
        mutation: {
            onSuccess: () => handleSuccess('Agente atualizado!'),
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar.')
        }
    });

    const handleSuccess = (msg) => {
        toast.success(msg);
        queryClient.invalidateQueries({ queryKey: ['/api/printing/agents'] });
        onOpenChange(false);
    };

    const onSubmit = (data) => {
        if (isEditing) updateAgent({ id: agenteToEdit.id, data: { name: data.name } });
        else createAgent({ data });
    };

    const isPending = isCreating || isUpdating;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Server className="text-blue-600" size={20} />
                        {isEditing ? 'Editar Agente' : 'Novo Agente Global'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Nome da Estação *</Label>
                        <Input {...register('name')} placeholder="Ex: PC-EXPEDICAO-01" />
                        {errors.name && <p className="text-xs text-rose-500 flex items-center gap-1 mt-1"><AlertCircle size={12} /> {errors.name.message}</p>}
                    </div>

                    <DialogFooter className="pt-2 border-t border-slate-100">
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