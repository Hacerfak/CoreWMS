import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiInboundReceiveCheckout } from '@/api/generated/inbound/inbound';

// Importações corrigidas para os hooks reais gerados pelo Orval
import {
    useGetApiTopologyLocationsDocks,
    useGetApiTopologyLocationsStorage
} from '@/api/generated/topology/topology';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, PackageCheck, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const volumeSchema = z.object({
    packagingTypeId: z.string().min(1, 'Selecione a embalagem.'),
    volumeCount: z.coerce.number().min(1, 'Mínimo 1 volume.'),
    quantityPerVolume: z.coerce.number().min(0.0001, 'Informe a qtd por volume.'),
    batch: z.string().optional().nullable(),
    expirationDate: z.string().optional().nullable(),
    manufactureDate: z.string().optional().nullable(),
    serialNumber: z.string().optional().nullable(),
    targetLocationId: z.string().min(1, 'Selecione a doca/posição de destino.'),
    qualityStatus: z.coerce.number().default(1)
});

const checkoutSchema = z.object({
    volumes: z.array(volumeSchema).min(1, 'Adicione pelo menos um lote/volume.')
});

export default function ReceiveLoteModal({ open, onOpenChange, item, dockLocationId }) {
    const queryClient = useQueryClient();

    // Busca Docas e Posições de Armazenamento diretamente
    const { data: docks = [] } = useGetApiTopologyLocationsDocks();
    const { data: storageLocations = [] } = useGetApiTopologyLocationsStorage();

    // Une as opções ativas para seleção de destino
    const targetLocations = [...docks, ...storageLocations];

    const { handleSubmit, control, register, setValue, watch } = useForm({
        resolver: zodResolver(checkoutSchema),
        defaultValues: {
            volumes: [{
                packagingTypeId: '',
                volumeCount: 1,
                quantityPerVolume: item?.expectedQuantity || 1,
                batch: '',
                expirationDate: '',
                manufactureDate: '',
                serialNumber: '',
                targetLocationId: dockLocationId || '',
                qualityStatus: 1
            }]
        }
    });

    const { fields, append, remove } = useFieldArray({ control, name: 'volumes' });

    const { mutate: checkoutLote, isPending } = usePostApiInboundReceiveCheckout({
        mutation: {
            onSuccess: () => {
                toast.success('Recebimento registrado e HUs geradas com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
                onOpenChange(false);
            },
            onError: (err) => {
                toast.error(err.response?.data?.message || err.response?.data?.detail || 'Erro ao registrar conferência.');
            }
        }
    });

    const onSubmit = (data) => {
        checkoutLote({
            data: {
                orderItemId: item.id,
                billingServiceId: null,
                volumes: data.volumes.map(v => ({
                    ...v,
                    expirationDate: v.expirationDate ? new Date(v.expirationDate).toISOString() : null,
                    manufactureDate: v.manufactureDate ? new Date(v.manufactureDate).toISOString() : null
                }))
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!isPending) onOpenChange(v); }}>
            <DialogContent className="sm:max-w-3xl bg-white p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <PackageCheck className="text-blue-600" size={20} /> Conferência & Descarregamento de Item
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Registre a entrada física, lotes e gere as HUs (Handling Units) de estoque.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="p-6 overflow-y-auto space-y-6 flex-1">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-4 text-xs">
                        <div>
                            <span className="text-slate-400 font-semibold uppercase block">SKU / Item</span>
                            <span className="font-bold font-mono text-slate-800 text-sm">{item?.sku || item?.rawSkuCode}</span>
                        </div>
                        <div>
                            <span className="text-slate-400 font-semibold uppercase block">Descrição</span>
                            <span className="font-medium text-slate-800 truncate block">{item?.description || item?.rawDescription}</span>
                        </div>
                        <div>
                            <span className="text-slate-400 font-semibold uppercase block">A Conferir / Esperado</span>
                            <span className="font-bold text-blue-700 text-sm">
                                {item?.expectedQuantity - (item?.receivedQuantity || 0)} / {item?.expectedQuantity} UN
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b pb-2">
                            <Label className="text-sm font-bold text-slate-800">Pallets / Volumes Descarregados</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => append({ packagingTypeId: '', volumeCount: 1, quantityPerVolume: 1, targetLocationId: dockLocationId || '', qualityStatus: 1 })}
                                className="h-7 text-xs border-dashed text-blue-600 border-blue-200 hover:bg-blue-50"
                            >
                                <Plus size={14} className="mr-1" /> Adicionar Lote / Pallet
                            </Button>
                        </div>

                        {fields.map((field, idx) => (
                            <div key={field.id} className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3 relative">
                                {fields.length > 1 && (
                                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)} className="absolute top-2 right-2 text-rose-500 hover:bg-rose-50 h-7 w-7 p-0">
                                        <Trash2 size={14} />
                                    </Button>
                                )}

                                <div className="grid grid-cols-4 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Embalagem *</Label>
                                        <Select value={watch(`volumes.${idx}.packagingTypeId`)} onValueChange={(v) => setValue(`volumes.${idx}.packagingTypeId`, v, { shouldValidate: true })}>
                                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="2b123456-1111-2222-3333-444455556666">CX - Caixa Mestre</SelectItem>
                                                <SelectItem value="3c123456-1111-2222-3333-444455556666">PAL - Pallet Padrão</SelectItem>
                                                <SelectItem value="1a123456-1111-2222-3333-444455556666">UN - Unidade Avulsa</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Qtd Volumes (HUs)</Label>
                                        <Input type="number" {...register(`volumes.${idx}.volumeCount`)} className="h-8 text-xs font-mono" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Qtd Por Volume</Label>
                                        <Input type="number" step="0.0001" {...register(`volumes.${idx}.quantityPerVolume`)} className="h-8 text-xs font-mono" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Status Qualidade</Label>
                                        <Select value={String(watch(`volumes.${idx}.qualityStatus`))} onValueChange={(v) => setValue(`volumes.${idx}.qualityStatus`, Number(v))}>
                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">Liberado (Disponível)</SelectItem>
                                                <SelectItem value="2">Quarentena / Bloqueado</SelectItem>
                                                <SelectItem value="3">Avariado / Danificado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-2">
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Lote Físico</Label>
                                        <Input {...register(`volumes.${idx}.batch`)} placeholder="Ex: LOT2026A" className="h-8 text-xs font-mono" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Data de Validade</Label>
                                        <Input type="date" {...register(`volumes.${idx}.expirationDate`)} className="h-8 text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px]">Posição / Doca Destino *</Label>
                                        <Select value={watch(`volumes.${idx}.targetLocationId`)} onValueChange={(v) => setValue(`volumes.${idx}.targetLocationId`, v, { shouldValidate: true })}>
                                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha a posição..." /></SelectTrigger>
                                            <SelectContent>
                                                {targetLocations.map(loc => (
                                                    <SelectItem key={loc.id} value={loc.id}>{loc.fullPath}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <DialogFooter className="border-t border-slate-100 pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
                        <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Concluir Checkout</>}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}