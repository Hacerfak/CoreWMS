import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
    useGetApiTopologyStorageTypes,
    usePostApiTopologyStorageTypes,
    usePutApiTopologyStorageTypesId,
    useDeleteApiTopologyStorageTypesId
} from '@/api/generated/topology/topology'; // Verifique o caminho correto gerado pelo Orval
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';

const storageTypeSchema = z.object({
    name: z.string().min(3, 'O nome deve ter no mínimo 3 caracteres.'),
    capacityStrategy: z.coerce.number().min(1),
    isVirtual: z.boolean().default(false),
    allowMixedProducts: z.boolean().default(false),
    allowMixedBatches: z.boolean().default(false),
});

export default function StorageTypesTab() {
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedType, setSelectedType] = useState(null);
    const [typeToDelete, setTypeToDelete] = useState(null);

    const { data: storageTypes = [], isLoading } = useGetApiTopologyStorageTypes();

    const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(storageTypeSchema),
        defaultValues: { name: '', capacityStrategy: 1, isVirtual: false, allowMixedProducts: false, allowMixedBatches: false }
    });

    useEffect(() => {
        if (isModalOpen) {
            reset(selectedType || { name: '', capacityStrategy: 1, isVirtual: false, allowMixedProducts: false, allowMixedBatches: false });
        }
    }, [isModalOpen, selectedType, reset]);

    const { mutate: createType, isPending: isCreating } = usePostApiTopologyStorageTypes({
        mutation: {
            onSuccess: () => {
                toast.success('Tipo criado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/topology/storage-types'] });
                setIsModalOpen(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar.')
        }
    });

    const { mutate: updateType, isPending: isUpdating } = usePutApiTopologyStorageTypesId({
        mutation: {
            onSuccess: () => {
                toast.success('Tipo atualizado!');
                queryClient.invalidateQueries({ queryKey: ['/api/topology/storage-types'] });
                setIsModalOpen(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar.')
        }
    });

    const { mutate: deleteType, isPending: isDeleting } = useDeleteApiTopologyStorageTypesId({
        mutation: {
            onSuccess: () => {
                toast.success('Tipo removido!');
                queryClient.invalidateQueries({ queryKey: ['/api/topology/storage-types'] });
                setTypeToDelete(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao remover.')
        }
    });

    const onSubmit = (data) => {
        if (selectedType) updateType({ id: selectedType.id, data });
        else createType({ data });
    };

    const isSaving = isCreating || isUpdating;

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden h-full">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-semibold text-slate-800">Tipos de Armazenamento</h3>
                <Button onClick={() => { setSelectedType(null); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white h-8">
                    <Plus className="mr-2 h-4 w-4" /> Novo Tipo
                </Button>
            </div>

            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                        <TableRow>
                            <TableHead>Nome do Tipo</TableHead>
                            <TableHead>Estratégia de Capacidade</TableHead>
                            <TableHead>Regras de Restrição</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : storageTypes.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center text-slate-500">Nenhum tipo cadastrado.</TableCell></TableRow>
                        ) : storageTypes.map((type) => (
                            <TableRow key={type.id} className="hover:bg-slate-50/50">
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center"><Layers size={16} /></div>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-900">{type.name}</span>
                                            {type.isVirtual && <span className="text-[10px] text-amber-600 font-medium">Virtual (Não conta capacidade)</span>}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {type.capacityStrategy === 1 ? <Badge variant="outline" className="bg-slate-100">Unitária (1 Vão = 1 Pallet)</Badge> : <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Dinâmica (Empilhamento Blocado)</Badge>}
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        {type.allowMixedProducts ? <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Mistura Produtos</Badge> : <Badge variant="outline" className="text-slate-500">Bloqueia Prod. Diferentes</Badge>}
                                        {type.allowMixedBatches ? <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Mistura Lotes</Badge> : <Badge variant="outline" className="text-slate-500">Bloqueia Lotes</Badge>}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right space-x-1">
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedType(type); setIsModalOpen(true); }} className="text-blue-600 hover:bg-blue-50"><Edit className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => setTypeToDelete(type)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Modal de Criação/Edição */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle>{selectedType ? 'Editar Tipo' : 'Novo Tipo de Armazenamento'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
                        <div className="space-y-1.5">
                            <Label>Nome (Ex: Blocado Padrão) *</Label>
                            <Input {...register('name')} className={errors.name ? 'border-rose-500' : ''} />
                            {errors.name && <p className="text-xs text-rose-500">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label>Cálculo de Capacidade do Espaço *</Label>
                            <Select value={String(watch('capacityStrategy') || '1')} onValueChange={(v) => setValue('capacityStrategy', Number(v))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione a estratégia" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Capacidade Unitária (Porta-Pallets)</SelectItem>
                                    <SelectItem value="2">Capacidade Dinâmica (Blocado - Multiplica Empilhamento)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-4 pt-2 border-t">
                            <div className="flex items-center justify-between">
                                <Label className="text-slate-600">Área Virtual (Ex: Doca, Quarentena)</Label>
                                <Switch checked={watch('isVirtual')} onCheckedChange={(v) => setValue('isVirtual', v)} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="text-slate-600">Permitir SKUs misturados no mesmo endereço</Label>
                                <Switch checked={watch('allowMixedProducts')} onCheckedChange={(v) => setValue('allowMixedProducts', v)} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="text-slate-600">Permitir Lotes misturados no mesmo endereço</Label>
                                <Switch checked={watch('allowMixedBatches')} onCheckedChange={(v) => setValue('allowMixedBatches', v)} />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isSaving} className="bg-slate-900 text-white">
                                {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : 'Salvar'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal de Exclusão */}
            <AlertDialog open={!!typeToDelete} onOpenChange={(open) => !open && setTypeToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Tipo de Armazenamento?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação é irreversível e só ocorrerá se não houver endereços vinculados.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteType({ id: typeToDelete?.id })} disabled={isDeleting} className="bg-rose-600 hover:bg-rose-700 text-white">Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}