import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiRoles, usePostApiRoles, usePutApiRolesId, useDeleteApiRolesId } from '@/api/generated/roles/roles';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Search, Plus, Shield, Loader2, Edit, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

// Matriz de permissões simplificada (Removido os CRUDs avulsos de roles)
const MODULE_PERMISSIONS = [
    {
        module: 'Clientes Depositantes',
        permissions: [
            { id: 'customers:view', label: 'Visualizar Clientes' },
            { id: 'customers:create', label: 'Cadastrar Cliente' },
            { id: 'customers:edit', label: 'Editar Cliente' },
            { id: 'customers:delete', label: 'Inativar Cliente' },
        ]
    },
    {
        module: 'Usuários e Acessos',
        permissions: [
            { id: 'users:view', label: 'Visualizar Usuários' },
            { id: 'users:create', label: 'Cadastrar Usuário' },
            { id: 'users:edit', label: 'Editar Usuário' },
            { id: 'users:delete', label: 'Excluir Usuário' },
            { id: 'users:assign', label: 'Vincular Empresas/Perfis' },
        ]
    },
    {
        module: 'Perfis de Acesso',
        permissions: [
            // Agora é apenas Manage!
            { id: 'roles:manage', label: 'Gerenciar Perfis' },
        ]
    },
    {
        module: 'Configurações e Serviços',
        permissions: [
            { id: 'companies:manage', label: 'Gerenciar Empresas' },
            { id: 'printing:manage', label: 'Gestão de Impressão' },
            { id: 'audit:view', label: 'Consultar Auditoria' },
        ]
    }
];

// Schema Zod validando Nome e Array de Permissões
const roleSchema = z.object({
    name: z.string().min(3, 'O nome deve ter no mínimo 3 caracteres.'),
    permissions: z.array(z.string()).min(1, 'Selecione pelo menos uma permissão.')
});

export default function PerfisList() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);
    const [roleToDelete, setRoleToDelete] = useState(null);

    const { data: roles = [], isLoading } = useGetApiRoles();

    // RHF Setup
    const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(roleSchema),
        defaultValues: { name: '', permissions: [] }
    });

    const watchedPermissions = watch('permissions');

    useEffect(() => {
        if (isDialogOpen) {
            reset({
                name: selectedRole ? selectedRole.name : '',
                permissions: selectedRole ? selectedRole.permissions : []
            });
        }
    }, [isDialogOpen, selectedRole, reset]);

    const { mutate: createRole, isPending: isCreating } = usePostApiRoles({
        mutation: {
            onSuccess: () => {
                toast.success('Perfil criado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
                setIsDialogOpen(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar perfil.')
        }
    });

    const { mutate: updateRole, isPending: isUpdating } = usePutApiRolesId({
        mutation: {
            onSuccess: () => {
                toast.success('Perfil atualizado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
                setIsDialogOpen(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar perfil.')
        }
    });

    const { mutate: deleteRole, isPending: isDeleting } = useDeleteApiRolesId({
        mutation: {
            onSuccess: () => {
                toast.success('Perfil excluído com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
                setRoleToDelete(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Este perfil não pode ser excluído pois está em uso.')
        }
    });

    const togglePermission = (permId, checked) => {
        const current = watchedPermissions;
        const updated = checked
            ? [...current, permId]
            : current.filter(p => p !== permId);
        setValue('permissions', updated, { shouldValidate: true });
    };

    const onSubmit = (data) => {
        if (selectedRole) {
            updateRole({ id: selectedRole.id, data });
        } else {
            createRole({ data });
        }
    };

    const filteredRoles = roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
    const isSaving = isCreating || isUpdating;

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Perfis de Acesso</h1>
                    <p className="text-sm text-slate-500 mt-1">Configure os papéis e defina a matriz de permissões da equipe.</p>
                </div>
                <Button onClick={() => { setSelectedRole(null); setIsDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                    <Plus className="mr-2 h-4 w-4" /> Novo Perfil
                </Button>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por nome do perfil..."
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-slate-50 border-slate-200"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-sm z-10">
                            <TableRow>
                                <TableHead className="w-[280px]">Nome do Perfil</TableHead>
                                <TableHead>Permissões Ativas</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={3} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : filteredRoles.length === 0 ? (
                                <TableRow><TableCell colSpan={3} className="h-24 text-center text-slate-500">Nenhum perfil cadastrado.</TableCell></TableRow>
                            ) : filteredRoles.map((role) => (
                                <TableRow key={role.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                                                <Shield size={16} />
                                            </div>
                                            <span className="font-medium text-slate-900">{role.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1.5 max-w-xl">
                                            {role.permissions?.length > 0 ? (
                                                role.permissions.map((p) => (
                                                    <Badge key={p} variant="outline" className="bg-slate-50 text-slate-600 text-[11px] font-mono">
                                                        {p}
                                                    </Badge>
                                                ))
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Nenhuma permissão atribuída</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right space-x-1">
                                        <Button variant="ghost" size="sm" onClick={() => { setSelectedRole(role); setIsDialogOpen(true); }} className="text-blue-600 hover:bg-blue-50">
                                            <Edit className="h-4 w-4 mr-1" /> Configurar Permissões
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setRoleToDelete(role)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                                            <Trash2 className="h-4 w-4 mr-1" /> Excluir
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-2xl bg-white max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">{selectedRole ? 'Configurar Perfil' : 'Novo Perfil de Acesso'}</DialogTitle>
                        <DialogDescription className="text-slate-500">Defina o nome do papel e marque os privilégios concedidos aos usuários.</DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0 space-y-4">
                        <div className="space-y-1.5 pt-2">
                            <Label htmlFor="name" className="text-slate-700 font-medium">Nome do Perfil *</Label>
                            <Input
                                id="name" placeholder="Ex: Operador de Recebimento"
                                {...register('name')}
                                className={`bg-slate-50 ${errors.name ? 'border-rose-500' : ''}`}
                            />
                            {errors.name && <p className="text-xs text-rose-500">{errors.name.message}</p>}
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-5 pr-2 py-2">
                            {MODULE_PERMISSIONS.map((group) => (
                                <div key={group.module} className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/60 space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{group.module}</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {group.permissions.map((perm) => {
                                            const isChecked = watchedPermissions.includes(perm.id);
                                            return (
                                                <label
                                                    key={perm.id}
                                                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${isChecked ? 'bg-blue-50/80 border-blue-200 text-blue-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/50'
                                                        }`}
                                                >
                                                    <Checkbox
                                                        checked={isChecked}
                                                        onCheckedChange={(checked) => togglePermission(perm.id, checked)}
                                                    />
                                                    <span>{perm.label}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {errors.permissions && <p className="text-xs text-rose-500 text-center">{errors.permissions.message}</p>}
                        </div>

                        <DialogFooter className="pt-2 border-t border-slate-100">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isSaving} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[120px]">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar Perfil</>}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900">Excluir Perfil de Acesso?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-500">
                            Esta ação removerá o perfil <strong className="text-slate-800">{roleToDelete?.name}</strong>. Certifique-se de que nenhum usuário dependa dele.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteRole({ id: roleToDelete.id })} disabled={isDeleting} className="bg-rose-600 hover:bg-rose-700 text-white">
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Exclusão'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}