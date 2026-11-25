import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiRoles, useDeleteApiRolesId } from '@/api/generated/roles/roles';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Search, Plus, Shield, Loader2, Edit, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PerfisList() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const canViewRoles = useHasPermission(['roles:view', 'roles:manage']);
    const canManageRoles = useHasPermission('roles:manage');

    const [search, setSearch] = useState('');
    const [roleToDelete, setRoleToDelete] = useState(null);

    const { data: roles = [], isLoading } = useGetApiRoles({
        query: { enabled: canViewRoles }
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

    const filteredRoles = roles.filter(r =>
        r.name?.toLowerCase().includes(search.toLowerCase())
    );

    const colSpanCount = canManageRoles ? 4 : 3;

    return (
        <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Shield className="h-6 w-6 text-blue-600" /> Perfis de Acesso & Permissões
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Configure os papéis operacionais, administrativos e perfis externos (Portal B2B).
                    </p>
                </div>
                {canManageRoles && (
                    <Button
                        onClick={() => navigate('/perfis/novo')}
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Novo Perfil
                    </Button>
                )}
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por nome do perfil..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white border-slate-200 h-9 text-xs"
                        />
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                        {filteredRoles.length} perfil(is)
                    </span>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[340px]">Nome do Perfil</TableHead>
                                <TableHead>Privilégios Concedidos</TableHead>
                                <TableHead className="w-[150px]">Criado em</TableHead>
                                {canManageRoles && <TableHead className="text-right w-[200px]">Ações</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={colSpanCount} className="h-28 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredRoles.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={colSpanCount} className="h-28 text-center text-slate-500 text-xs italic">
                                        Nenhum perfil encontrado.
                                    </TableCell>
                                </TableRow>
                            ) : filteredRoles.map((role) => (
                                <TableRow key={role.id} className="hover:bg-slate-50/60 transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                                                <Shield size={16} />
                                            </div>
                                            <span className="font-semibold text-slate-900 text-sm">{role.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {role.permissions?.length > 0 ? (
                                            <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-xs gap-1 font-medium">
                                                <CheckCircle2 size={12} /> {role.permissions.length} permissão(ões) ativa(s)
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">
                                                Nenhuma permissão atribuída
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-slate-500">
                                        {role.createdAt ? new Date(role.createdAt).toLocaleDateString('pt-BR') : '-'}
                                    </TableCell>
                                    {canManageRoles && (
                                        <TableCell className="text-right space-x-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => navigate(`/perfis/${role.id}/editar`)}
                                                className="h-8 text-xs text-blue-700 border-blue-200 hover:bg-blue-50 bg-white"
                                            >
                                                <Edit className="h-3.5 w-3.5 mr-1" /> Configurar
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setRoleToDelete(role)}
                                                className="h-8 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {canManageRoles && (
                <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
                    <AlertDialogContent className="bg-white">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-slate-900">Excluir Perfil de Acesso?</AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-500 text-xs">
                                Esta ação removerá o perfil <strong className="text-slate-800">{roleToDelete?.name}</strong> permanentemente. Certifique-se de que nenhum usuário dependa dele.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => deleteRole({ id: roleToDelete.id })}
                                disabled={isDeleting}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                            >
                                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Exclusão'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    );
}