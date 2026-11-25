import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import {
    Users, UserPlus, Search, Loader2, Edit, Trash2, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

export default function UsersList() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const canViewUsers = useHasPermission(['users:view', 'users:manage']);
    const canManageUsers = useHasPermission('users:manage');

    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [userToDelete, setUserToDelete] = useState(null);

    const { data: users = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: ['/api/users'],
        queryFn: () => customInstance({ url: '/api/users', method: 'GET' }),
        enabled: canViewUsers
    });

    const { mutate: deleteUser, isPending: isDeleting } = useMutation({
        mutationFn: (id) => customInstance({ url: `/api/users/${id}`, method: 'DELETE' }),
        onSuccess: () => {
            toast.success('Usuário excluído com sucesso.');
            queryClient.invalidateQueries({ queryKey: ['/api/users'] });
            setUserToDelete(null);
        },
        onError: (err) => {
            toast.error(err.response?.data?.message || 'Não foi possível excluir o usuário.');
        }
    });

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            const isExternal = u.assignments?.some(
                a => a.allowedCustomerIds && a.allowedCustomerIds.length > 0
            );

            if (typeFilter === 'EXTERNAL' && !isExternal) return false;
            if (typeFilter === 'INTERNAL' && (isExternal || u.isMaster)) return false;

            if (!search.trim()) return true;
            const term = search.toLowerCase();
            return (
                u.name?.toLowerCase().includes(term) ||
                u.email?.toLowerCase().includes(term) ||
                u.assignments?.some(
                    a => a.companyName?.toLowerCase().includes(term) || a.roleName?.toLowerCase().includes(term)
                )
            );
        });
    }, [users, search, typeFilter]);

    const renderUserTypeBadge = (user, isExternal) => {
        if (user.isMaster) {
            return (
                <Badge className="bg-slate-900 text-white text-[11px] font-medium">
                    Administrador Global
                </Badge>
            );
        }
        if (isExternal) {
            return (
                <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[11px] font-medium">
                    Externo
                </Badge>
            );
        }
        return (
            <Badge className="bg-blue-50 text-blue-800 border-blue-200 text-[11px] font-medium">
                Interno
            </Badge>
        );
    };

    const renderAssignmentsSummary = (user, isExternal) => {
        if (user.isMaster) {
            return (
                <span className="text-xs text-slate-500 italic">
                    Todas as empresas (acesso irrestrito)
                </span>
            );
        }

        const totalCompanies = user.assignments?.length || 0;
        if (totalCompanies === 0) {
            return (
                <span className="text-xs text-slate-400 italic">
                    Nenhum vínculo ativo
                </span>
            );
        }

        if (isExternal) {
            const uniqueCustomers = new Set(
                user.assignments.flatMap(a => a.allowedCustomerIds || [])
            ).size;

            return (
                <span className="text-xs font-medium text-slate-700">
                    {totalCompanies} {totalCompanies === 1 ? 'empresa' : 'empresas'} • {uniqueCustomers} {uniqueCustomers === 1 ? 'depositante' : 'depositantes'}
                </span>
            );
        }

        return (
            <span className="text-xs font-medium text-slate-700">
                {totalCompanies} {totalCompanies === 1 ? 'empresa vinculada' : 'empresas vinculadas'}
            </span>
        );
    };

    const colSpanCount = canManageUsers ? 4 : 3;

    return (
        <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Users className="h-6 w-6 text-blue-600" /> Usuários & Vínculos de Acesso
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gerencie operadores internos, gestores e usuários externos com acesso restrito por depositante.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {canViewUsers && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                            className="bg-white h-9 text-xs"
                        >
                            <RefreshCw size={14} className={`mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
                        </Button>
                    )}
                    {canManageUsers && (
                        <Button
                            onClick={() => navigate('/usuarios/novo')}
                            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold h-9 text-xs"
                        >
                            <UserPlus className="mr-1.5 h-4 w-4" /> Novo Usuário
                        </Button>
                    )}
                </div>
            </div>

            {/* BARRA DE FILTROS */}
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 flex-1">
                        <div className="relative flex-1 min-w-[240px] max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar por nome, e-mail, empresa ou perfil..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 bg-white border-slate-200 h-9 text-xs"
                            />
                        </div>

                        <div className="w-[180px]">
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="bg-white border-slate-200 h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os Tipos</SelectItem>
                                    <SelectItem value="INTERNAL">Interno</SelectItem>
                                    <SelectItem value="EXTERNAL">Externo</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <span className="text-xs text-slate-500 font-mono">
                        {filteredUsers.length} usuário(s)
                    </span>
                </div>

                {/* TABELA DE USUÁRIOS */}
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                            <TableRow>
                                <TableHead>Usuário</TableHead>
                                <TableHead className="w-[210px]">Tipo</TableHead>
                                <TableHead className="w-[260px]">Vínculos</TableHead>
                                {canManageUsers && <TableHead className="text-right w-[180px]">Ações</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={colSpanCount} className="h-32 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={colSpanCount} className="h-32 text-center text-xs text-slate-500 italic">
                                        Nenhum usuário encontrado com os filtros informados.
                                    </TableCell>
                                </TableRow>
                            ) : filteredUsers.map((user) => {
                                const isExternal = user.assignments?.some(
                                    a => a.allowedCustomerIds && a.allowedCustomerIds.length > 0
                                );

                                return (
                                    <TableRow key={user.id} className="hover:bg-slate-50/60 transition-colors">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-slate-900 text-sm">{user.name}</span>
                                                <span className="text-xs text-slate-500 font-mono">{user.email}</span>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            {renderUserTypeBadge(user, isExternal)}
                                        </TableCell>

                                        <TableCell>
                                            {renderAssignmentsSummary(user, isExternal)}
                                        </TableCell>

                                        {canManageUsers && (
                                            <TableCell className="text-right space-x-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => navigate(`/usuarios/${user.id}`)}
                                                    className="h-8 text-xs text-blue-700 border-blue-200 hover:bg-blue-50 bg-white"
                                                >
                                                    <Edit className="h-3.5 w-3.5 mr-1" /> Gerenciar
                                                </Button>
                                                {!user.isMaster && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setUserToDelete(user)}
                                                        className="h-8 text-xs text-rose-600 hover:bg-rose-50"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* CONFIRMAÇÃO DE EXCLUSÃO */}
            {canManageUsers && (
                <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
                    <AlertDialogContent className="bg-white">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-slate-900">Excluir Usuário?</AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-slate-600">
                                Deseja remover permanentemente o usuário <strong className="text-slate-900">{userToDelete?.name}</strong> ({userToDelete?.email}) e todos os seus vínculos de acesso?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => deleteUser(userToDelete.id)}
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