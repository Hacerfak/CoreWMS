import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiPrintingTemplates, usePutApiPrintingTemplatesId } from '@/api/generated/printing/printing';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Tag, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const templateSchema = z.object({
    name: z.string().min(3, 'Mínimo 3 caracteres.'),
    zplContent: z.string().min(10, 'Conteúdo ZPL inválido.'),
    widthMm: z.coerce.number().min(1, 'Obrigatório.'),
    heightMm: z.coerce.number().min(1, 'Obrigatório.')
});

export default function TemplateFormModal({ open, onOpenChange, templateToEdit }) {
    const queryClient = useQueryClient();
    const isEditing = !!templateToEdit;

    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(templateSchema)
    });

    useEffect(() => {
        if (open) {
            reset(isEditing ? templateToEdit : { name: '', zplContent: '', widthMm: 100, heightMm: 150 });
        }
    }, [open, isEditing, templateToEdit, reset]);

    const { mutate: createTemplate, isPending: isCreating } = usePostApiPrintingTemplates({
        mutation: {
            onSuccess: () => handleSuccess('Template salvo!'),
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar.')
        }
    });

    const { mutate: updateTemplate, isPending: isUpdating } = usePutApiPrintingTemplatesId({
        mutation: {
            onSuccess: () => handleSuccess('Template atualizado!'),
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar.')
        }
    });

    const handleSuccess = (msg) => {
        toast.success(msg);
        queryClient.invalidateQueries({ queryKey: ['/api/printing/templates'] });
        onOpenChange(false);
    };

    const onSubmit = (data) => {
        if (isEditing) updateTemplate({ id: templateToEdit.id, data });
        else createTemplate({ data });
    };

    const isPending = isCreating || isUpdating;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Tag className="text-blue-600" size={20} />
                        {isEditing ? 'Editar Template' : 'Novo Template ZPL'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Nome do Template *</Label>
                        <Input {...register('name')} placeholder="Ex: Etiqueta de Expedição Padrão" />
                        {errors.name && <p className="text-xs text-rose-500">{errors.name.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Largura (mm) *</Label>
                            <Input type="number" {...register('widthMm')} />
                        </div>
                        <div className="space-y-2">
                            <Label>Altura (mm) *</Label>
                            <Input type="number" {...register('heightMm')} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Código ZPL *</Label>
                        <Textarea {...register('zplContent')} className="h-40 font-mono text-xs" placeholder="^XA...^XZ" />
                        {errors.zplContent && <p className="text-xs text-rose-500">{errors.zplContent.message}</p>}
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