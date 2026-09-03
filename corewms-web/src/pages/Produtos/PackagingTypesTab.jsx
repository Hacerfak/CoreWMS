import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
    useGetApiProductsPackagingTypes,
    usePostApiProductsPackagingTypes,
    usePutApiProductsPackagingTypesId,
    useDeleteApiProductsPackagingTypesId
} from '@/api/generated/products/products';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, Trash2, Box } from 'lucide-react';
import { toast } from 'sonner';

const packagingTypeSchema = z.object({
    code: z.string().min(1, 'Código obrigatório.').max(20),
    description: z.string().min(3, 'Descrição obrigatória.').max(150),
});

export default function PackagingTypesTab() {
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedType, setSelectedType] = useState(null);
    const [typeToDelete, setTypeToDelete] = useState(null);

    const { data: packagingTypes = [], isLoading } = useGetApiProductsPackagingTypes();

    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(packagingTypeSchema),
        defaultValues: { code: '', description: '' }
    });

    useEffect(() => {
        if (isModalOpen) reset(selectedType || { code: '', description: '' });
    }, [isModalOpen, selectedType, reset]);

    const { mutate: createType, isPending: isCreating } = usePostApiProductsPackagingTypes({
        mutation: {
            onSuccess: () => {
                toast.success('Tipo de Embalagem criado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/products/packaging-types'] });
                setIsModalOpen(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar.')
        }
    });

    const { mutate: updateType, isPending: isUpdating } = usePutApiProductsPackagingTypesId({
        mutation: {
            onSuccess: () => {
                toast.success('Tipo atualizado!');
                queryClient.invalidateQueries({ queryKey: ['/api/products/packaging-types'] });
                setIsModalOpen(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar.')
        }
    });

    const { mutate: deleteType, isPending: isDeleting } = useDeleteApiProductsPackagingTypesId({
        mutation: {
            onSuccess: () => {
                toast.success('Tipo removido!');
                queryClient.invalidateQueries({ queryKey: ['/api/products/packaging-types'] });
                setTypeToDelete(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao remover.')
        }
    });

    const onSubmit = (data) => {
        if (selectedType) updateType({ id: selectedType.id, data: { ...data, isActive: true } });
        else createType({ data });
    };

    const isSaving = isCreating || isUpdating;

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden h-full">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-semibold text-slate-800">Dicionário de Embalagens</h3>
                <Button onClick={() => { setSelectedType(null); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white h-8">
                    <Plus className="mr-2 h-4 w-4" /> Novo Tipo
                </Button>
            </div>

            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                        <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : packagingTypes.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center text-slate-500">Nenhum tipo cadastrado.</TableCell></TableRow>
                        ) : packagingTypes.map((type) => (
                            <TableRow key={type.id} className="hover:bg-slate-50/50">
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center"><Box size={16} /></div>
                                        <span className="font-mono font-semibold text-slate-900">{type.code}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="font-medium text-slate-700">{type.description}</TableCell>
                                <TableCell><Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Ativo</Badge></TableCell>
                                <TableCell className="text-right space-x-1">
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedType(type); setIsModalOpen(true); }} className="text-blue-600 hover:bg-blue-50"><Edit className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => setTypeToDelete(type)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle>{selectedType ? 'Editar Embalagem' : 'Novo Tipo de Embalagem'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Código (Sigla) *</Label>
                            <Input {...register('code')} placeholder="Ex: CX, PAL, UN" disabled={!!selectedType} className="font-mono uppercase" />
                            {errors.code && <p className="text-xs text-rose-500">{errors.code.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Descrição *</Label>
                            <Input {...register('description')} placeholder="Ex: Caixa de Papelão" />
                            {errors.description && <p className="text-xs text-rose-500">{errors.description.message}</p>}
                        </div>
                        <DialogFooter><Button type="submit" disabled={isSaving} className="bg-slate-900 text-white">Salvar</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Alert */}
            <AlertDialog open={!!typeToDelete} onOpenChange={(open) => !open && setTypeToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Tipo?</AlertDialogTitle>
                        <AlertDialogDescription>Confirma a remoção? Se algum produto utilizar esta embalagem, a ação será bloqueada.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteType({ id: typeToDelete.id })} disabled={isDeleting} className="bg-rose-600 text-white hover:bg-rose-700">Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}