import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
    useGetApiUsers,
    usePostApiUsers,
    usePutApiUsersId,
    useDeleteApiUsersId,
    usePutApiUsersIdPassword
} from '@/api/generated/users/users';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Search, Plus, KeyRound, Loader2, Edit, Trash2, Building2, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import VincularEmpresaModal from './VincularEmpresaModal';

// Schema do Usuário
const userSchema = z.object({
    name: z.string().min(3, 'O nome deve ter no mínimo 3 caracteres.'),
    email: z.string().email('Formato de e-mail inválido.'),
    password: z.string().optional()
});

// Schema para Reset de Senha
const resetPasswordSchema = z.object({
    newPassword: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres.')
});

export default function UsuariosList() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');

    // Controles de Modais
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userToDelete, setUserToDelete] = useState(null);
    const [userToAssign, setUserToAssign] = useState(null);
    const [userToResetPassword, setUserToResetPassword] = useState(null);

    const { data: users = [], isLoading } = useGetApiUsers();

    // RHF - Form de Usuário
    const { register: regUser, handleSubmit: submitUser, reset: resetUser, formState: { errors: errUser } } = useForm({
        resolver: zodResolver(userSchema),
        defaultValues: { name: '', email: '', password: '' }
    });

    // RHF - Form de Senha
    const { register: regPwd, handleSubmit: submitPwd, reset: resetPwd, formState: { errors: errPwd } } = useForm({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: { newPassword: '' }
    });

    useEffect(() => {
        if (isUserModalOpen) {
            resetUser({
                name: selectedUser ? selectedUser.name : '',
                email: selectedUser ? selectedUser.email : '',
                password: ''
            });
        }
    }, [isUserModalOpen, selectedUser, resetUser]);

    useEffect(() => {
        if (userToResetPassword) resetPwd();
    }, [userToResetPassword, resetPwd]);

    // Mutações
    const { mutate: createUser, isPending: isCreating } = usePostApiUsers({
        mutation: {
            onSuccess: () => {
                toast.success('Usuário cadastrado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                setIsUserModalOpen(false);
            },
            onError: (err) => toast.error(err.response?.data?.detail || 'Erro ao criar usuário.')
        }
    });

    const { mutate: updateUser, isPending: isUpdating } = usePutApiUsersId({
        mutation: {
            onSuccess: () => {
                toast.success('Usuário atualizado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                setIsUserModalOpen(false);
            },
            onError: (err) => toast.error(err.response?.data?.detail || 'Erro ao atualizar usuário.')
        }
    });

    const { mutate: resetPassword, isPending: isResetting } = usePutApiUsersIdPassword({
        mutation: {
            onSuccess: () => {
                toast.success('Senha alterada com sucesso!');
                setUserToResetPassword(null);
            },
            onError: (err) => toast.error(err.response?.data?.detail || 'Erro ao redefinir senha.')
        }
    });

    const { mutate: deleteUser, isPending: isDeleting } = useDeleteApiUsersId({
        mutation: {
            onSuccess: () => {
                toast.success('Usuário excluído com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                setUserToDelete(null);
            },
            onError: (err) => toast.error(err.response?.data?.detail || 'Erro ao excluir usuário.')
        }
    });

    const handleSaveUser = (data) => {
        if (selectedUser) {
            updateUser({ id: selectedUser.id, data: { name: data.name, email: data.email } });
        } else {
            if (!data.password) return toast.warning('A senha é obrigatória para novos usuários.');
            createUser({ data: { name: data.name, email: data.email, password: data.password } });
        }
    };

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    const isSavingUser = isCreating || isUpdating;

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gestão de Usuários</h1>
                    <p className="text-sm text-slate-500 mt-1">Gerencie os acessos, permissões e empresas vinculadas.</p>
                </div>
                <Button onClick={() => { setSelectedUser(null); setIsUserModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                    <Plus className="mr-2 h-4 w-4" /> Novo Usuário
                </Button>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por Nome ou E-mail..."
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-slate-50 border-slate-200"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-sm z-10">
                            <TableRow>
                                <TableHead className="w-[300px]">Usuário</TableHead>
                                <TableHead>E-mail</TableHead>
                                <TableHead>Acessos Vinculados</TableHead>
                                <TableHead>Data de Cadastro</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : filteredUsers.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">Nenhum usuário encontrado.</TableCell></TableRow>
                            ) : filteredUsers.map((user) => (
                                <TableRow key={user.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center font-medium">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-medium text-slate-900">{user.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-600 font-mono">{user.email}</TableCell>
                                    <TableCell>
                                        {user.isMaster ? (
                                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-semibold gap-1">
                                                <ShieldCheck size={14} /> Master (Global)
                                            </Badge>
                                        ) : (
                                            <span className="text-sm font-medium text-slate-600 px-2">
                                                {user.assignments?.length || 0} ambiente(s)
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-500">
                                        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                                    </TableCell>
                                    <TableCell className="text-right space-x-1">
                                        {!user.isMaster && (
                                            <Button variant="ghost" size="sm" onClick={() => setUserToAssign(user)} className="text-emerald-600 hover:bg-emerald-50">
                                                <Building2 className="h-4 w-4 mr-1" /> Vínculos
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="sm" onClick={() => setUserToResetPassword(user)} className="text-amber-600 hover:bg-amber-50">
                                            <KeyRound className="h-4 w-4 mr-1" /> Senha
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => { setSelectedUser(user); setIsUserModalOpen(true); }} className="text-blue-600 hover:bg-blue-50">
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        {!user.isMaster && (
                                            <Button variant="ghost" size="sm" onClick={() => setUserToDelete(user)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Modal de Usuário */}
            <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">{selectedUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            {selectedUser ? 'Atualize as informações do usuário.' : 'Cadastre as credenciais para concessão de acesso.'}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={submitUser(handleSaveUser)} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="name" className="text-slate-700">Nome Completo *</Label>
                            <Input id="name" {...regUser('name')} className={`bg-slate-50 ${errUser.name ? 'border-rose-500' : ''}`} />
                            {errUser.name && <p className="text-xs text-rose-500">{errUser.name.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-slate-700">E-mail corporativo *</Label>
                            <Input id="email" type="email" {...regUser('email')} className={`bg-slate-50 ${errUser.email ? 'border-rose-500' : ''}`} />
                            {errUser.email && <p className="text-xs text-rose-500">{errUser.email.message}</p>}
                        </div>

                        {!selectedUser && (
                            <div className="space-y-1.5">
                                <Label htmlFor="password" className="text-slate-700">Senha de Acesso *</Label>
                                <Input id="password" type="password" {...regUser('password')} className={`bg-slate-50 ${errUser.password ? 'border-rose-500' : ''}`} />
                                {errUser.password && <p className="text-xs text-rose-500">{errUser.password.message}</p>}
                            </div>
                        )}

                        <DialogFooter className="pt-2 border-t border-slate-100">
                            <Button type="button" variant="outline" onClick={() => setIsUserModalOpen(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isSavingUser} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[100px]">
                                {isSavingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar</>}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal de Reset de Senha */}
            <Dialog open={!!userToResetPassword} onOpenChange={(open) => !open && setUserToResetPassword(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Alterar Senha do Usuário</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Digite a nova senha de acesso para <strong className="text-slate-800">{userToResetPassword?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={submitPwd((data) => resetPassword({ id: userToResetPassword.id, data }))} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="newPassword" className="text-slate-700">Nova Senha *</Label>
                            <Input id="newPassword" type="password" {...regPwd('newPassword')} className={`bg-slate-50 ${errPwd.newPassword ? 'border-rose-500' : ''}`} />
                            {errPwd.newPassword && <p className="text-xs text-rose-500">{errPwd.newPassword.message}</p>}
                        </div>

                        <DialogFooter className="pt-2 border-t border-slate-100">
                            <Button type="button" variant="outline" onClick={() => setUserToResetPassword(null)}>Cancelar</Button>
                            <Button type="submit" disabled={isResetting} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[150px]">
                                {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Nova Senha'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal de Gestão de Vínculos - Injeta o Usuário Fresco da Lista */}
            {userToAssign && (
                <VincularEmpresaModal
                    user={users.find(u => u.id === userToAssign.id) || userToAssign}
                    open={!!userToAssign}
                    onOpenChange={(open) => !open && setUserToAssign(null)}
                />
            )}

            {/* Modal de Exclusão de Usuário */}
            <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900">Excluir Usuário?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-500">
                            Esta ação revogará permanentemente o acesso do usuário <strong className="text-slate-800">{userToDelete?.name}</strong> de todas as empresas vinculadas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteUser({ id: userToDelete.id })} disabled={isDeleting} className="bg-rose-600 hover:bg-rose-700 text-white">
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Exclusão'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}