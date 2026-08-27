import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiUsers, usePostApiUsers, usePutApiUsersId, useDeleteApiUsersId } from '@/api/generated/users/users';
import { api } from '@/api/client';
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
import { Search, Plus, KeyRound, Loader2, Edit, Trash2, Building2, Save } from 'lucide-react';
import { toast } from 'sonner';
import VincularEmpresaModal from './VincularEmpresaModal';

export default function UsuariosList() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');

    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userToDelete, setUserToDelete] = useState(null);
    const [userToAssign, setUserToAssign] = useState(null);
    const [userToResetPassword, setUserToResetPassword] = useState(null);

    const [formData, setFormData] = useState({ name: '', email: '', password: '' });
    const [newPassword, setNewPassword] = useState('');

    const { data: users = [], isLoading } = useGetApiUsers();

    const { mutate: createUser, isPending: isCreating } = usePostApiUsers({
        mutation: {
            onSuccess: () => {
                toast.success('Usuário cadastrado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                handleCloseUserModal();
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar usuário.')
        }
    });

    const { mutate: updateUser, isPending: isUpdating } = usePutApiUsersId({
        mutation: {
            onSuccess: () => {
                toast.success('Usuário atualizado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                handleCloseUserModal();
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar usuário.')
        }
    });

    const { mutate: deleteUser, isPending: isDeleting } = useDeleteApiUsersId({
        mutation: {
            onSuccess: () => {
                toast.success('Usuário excluído com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                setUserToDelete(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao excluir usuário.')
        }
    });

    const handleOpenCreate = () => {
        setSelectedUser(null);
        setFormData({ name: '', email: '', password: '' });
        setIsUserModalOpen(true);
    };

    const handleOpenEdit = (user) => {
        setSelectedUser(user);
        setFormData({ name: user.name, email: user.email, password: '' });
        setIsUserModalOpen(true);
    };

    const handleCloseUserModal = () => {
        setIsUserModalOpen(false);
        setSelectedUser(null);
        setFormData({ name: '', email: '', password: '' });
    };

    const handleSave = (e) => {
        e.preventDefault();
        if (!formData.name || !formData.email) return toast.warning('Preencha os campos obrigatórios.');

        if (selectedUser) {
            updateUser({ id: selectedUser.id, data: { name: formData.name, email: formData.email } });
        } else {
            if (!formData.password) return toast.warning('Informe a senha do novo usuário.');
            createUser({ data: formData });
        }
    };

    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 6) return toast.warning('A senha deve ter no mínimo 6 caracteres.');

        try {
            await api.put(`/api/users/${userToResetPassword.id}/password`, { newPassword });
            toast.success('Senha alterada com sucesso!');
            setUserToResetPassword(null);
            setNewPassword('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao redefinir senha.');
        }
    };

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    const isSaving = isCreating || isUpdating;

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gestão de Usuários</h1>
                    <p className="text-sm text-slate-500 mt-1">Gerencie os acessos, permissões e empresas vinculadas.</p>
                </div>
                <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
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
                                <TableHead>Tipo de Acesso</TableHead>
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
                                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-semibold">Master</Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">Operacional</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-500">
                                        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                                    </TableCell>
                                    <TableCell className="text-right space-x-1">
                                        {!user.isMaster && (
                                            <Button variant="ghost" size="sm" onClick={() => setUserToAssign(user)} className="text-emerald-600 hover:bg-emerald-50">
                                                <Building2 className="h-4 w-4 mr-1" /> Vincular
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="sm" onClick={() => setUserToResetPassword(user)} className="text-amber-600 hover:bg-amber-50">
                                            <KeyRound className="h-4 w-4 mr-1" /> Senha
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(user)} className="text-blue-600 hover:bg-blue-50">
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

            <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">{selectedUser ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            {selectedUser ? 'Atualize as informações do usuário.' : 'Cadastre as credenciais para concessão de acesso.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-slate-700">Nome Completo *</Label>
                            <Input
                                id="name" placeholder="Ex: João da Silva"
                                value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="bg-slate-50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-700">E-mail corporativo *</Label>
                            <Input
                                id="email" type="email" placeholder="nome@empresa.com"
                                value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                className="bg-slate-50"
                            />
                        </div>
                        {!selectedUser && (
                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-slate-700">Senha de Acesso *</Label>
                                <Input
                                    id="password" type="password" placeholder="••••••••"
                                    value={formData.password} onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                    className="bg-slate-50"
                                />
                            </div>
                        )}
                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={handleCloseUserModal}>Cancelar</Button>
                            <Button type="submit" disabled={isSaving} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[100px]">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar</>}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={!!userToResetPassword} onOpenChange={(open) => !open && setUserToResetPassword(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Alterar Senha do Usuário</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Digite a nova senha de acesso para <strong className="text-slate-800">{userToResetPassword?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleResetPasswordSubmit} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="newPassword" className="text-slate-700">Nova Senha *</Label>
                            <Input
                                id="newPassword" type="password" placeholder="••••••••"
                                value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                                className="bg-slate-50"
                            />
                        </div>
                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => setUserToResetPassword(null)}>Cancelar</Button>
                            <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white">Salvar Nova Senha</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {userToAssign && (
                <VincularEmpresaModal
                    user={userToAssign}
                    open={!!userToAssign}
                    onOpenChange={(open) => !open && setUserToAssign(null)}
                />
            )}

            <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900">Excluir Usuário?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-500">
                            Esta ação revogará permanentemente o acesso do usuário <strong className="text-slate-800">{userToDelete?.name}</strong>.
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