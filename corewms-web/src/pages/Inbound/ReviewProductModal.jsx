import { useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiInboundReviewItem } from '@/api/generated/inbound/inbound';
import { useGetApiProductsPackagingTypes } from '@/api/generated/products/products';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, PlusCircle, Trash2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const reviewSchema = z.object({
    sku: z.string().min(1),
    description: z.string().min(3),
    baseUnit: z.string().min(1),
    packagings: z.array(z.object({
        packagingTypeId: z.string().min(1),
        conversionFactor: z.coerce.number().min(1),
        isDefaultInbound: z.boolean().default(true),
        isDefaultOutbound: z.boolean().default(true),
        allowFractionalPicking: z.boolean().default(true),
        grossWeight: z.coerce.number().default(0),
        netWeight: z.coerce.number().default(0),
        lengthMm: z.coerce.number().default(0),
        widthMm: z.coerce.number().default(0),
        heightMm: z.coerce.number().default(0)
    })).min(1, 'Cadastre pelo menos uma embalagem de recebimento.')
});

export default function ReviewProductModal({ open, onOpenChange, item, orderId }) {
    const queryClient = useQueryClient();
    const { data: packagingTypes = [] } = useGetApiProductsPackagingTypes();

    const { register, control, handleSubmit, reset, watch, setValue } = useForm({
        resolver: zodResolver(reviewSchema),
        defaultValues: { sku: '', description: '', baseUnit: '', packagings: [] }
    });
    const { fields, append, remove } = useFieldArray({ control, name: 'packagings' });

    useEffect(() => {
        if (open && item) {
            reset({
                sku: item.skuOriginal || '',
                description: item.descriptionOriginal || '',
                baseUnit: item.unitOriginal || 'UN',
                packagings: [{ packagingTypeId: '', conversionFactor: 1, isDefaultInbound: true, isDefaultOutbound: true, allowFractionalPicking: true, grossWeight: 0, netWeight: 0, lengthMm: 0, widthMm: 0, heightMm: 0 }]
            });
        }
    }, [open, item, reset]);

    const { mutate: reviewItem, isPending } = usePostApiInboundReviewItem({
        mutation: {
            onSuccess: () => {
                toast.success('Produto salvo e vinculado ao XML!');
                queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao revisar produto.')
        }
    });

    return (
        <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
            <DialogContent className="sm:max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Revisar Produto: {item?.skuOriginal}</DialogTitle>
                    <DialogDescription>Ajuste a descrição WMS e crie o fator de conversão de embalagens.</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit((data) => reviewItem({ data: { orderItemId: item.id, ...data } }))} className="space-y-6 py-4">
                    <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <div className="space-y-1.5 col-span-1">
                            <Label>SKU WMS</Label>
                            <Input {...register('sku')} className="font-mono uppercase" />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <Label>Descrição WMS (Limpa)</Label>
                            <Input {...register('description')} />
                        </div>
                        <div className="space-y-1.5 col-span-1">
                            <Label>Unid. Base Fiscal</Label>
                            <Input {...register('baseUnit')} className="font-mono uppercase" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label className="font-semibold text-slate-800 border-b pb-2 w-full block">Embalagens Logísticas</Label>
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid grid-cols-12 gap-3 items-end bg-white border border-slate-200 p-3 rounded-lg">
                                <div className="col-span-5 space-y-1.5">
                                    <Label className="text-xs">Tipo de Embalagem</Label>
                                    <Select value={watch(`packagings.${index}.packagingTypeId`)} onValueChange={(v) => setValue(`packagings.${index}.packagingTypeId`, v)}>
                                        <SelectTrigger><SelectValue placeholder="Ex: Palete PBR" /></SelectTrigger>
                                        <SelectContent>
                                            {packagingTypes.map(pt => <SelectItem key={pt.id} value={pt.id}>{pt.code} - {pt.description}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-4 space-y-1.5">
                                    <Label className="text-xs">Capacidade (em {watch('baseUnit')})</Label>
                                    <Input type="number" {...register(`packagings.${index}.conversionFactor`)} />
                                </div>
                                <div className="col-span-3 flex justify-end">
                                    {fields.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-rose-500"><Trash2 size={16} /></Button>}
                                </div>
                            </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => append({ packagingTypeId: '', conversionFactor: 1, isDefaultInbound: true, isDefaultOutbound: true, allowFractionalPicking: true, grossWeight: 0, netWeight: 0, lengthMm: 0, widthMm: 0, heightMm: 0 })} className="text-blue-600 border-blue-200 border-dashed w-full">
                            <PlusCircle size={14} className="mr-2" /> Nova Embalagem
                        </Button>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <><CheckCircle size={16} className="mr-2" /> Salvar Produto</>}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}