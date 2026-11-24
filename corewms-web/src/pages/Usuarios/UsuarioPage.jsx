import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import {
    ArrowLeft, Users, Save, Loader2, Building2, Shield,
    KeyRound, Plus, Trash2, Globe, Briefcase, Search,
    Pencil, X, Check
} from 'lucide-react';
import { toast } from 'sonner';

export default function UserFormPage() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Dados cadastrais básicos
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');

    // Estados de salvamento
    const [isSavingUser, setIsSavingUser] = useState(false);
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [isSavingAssignment, setIsSavingAssignment] = useState(false);
    const [removingCompanyId, setRemovingCompanyId] = useState(null);

    // Vínculos locais (usados antes de salvar no modo /usuarios/novo)
    const [draftAssignments, setDraftAssignments] = useState([]);

    // Cache de depositantes por empresa: Record<companyId, CustomerSummaryDto[]>
    const [customersByCompany, setCustomersByCompany] = useState({});
    const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

    // Estado do Modal de Adicionar / Editar Vínculo
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [editingCompanyId, setEditingCompanyId] = useState(null); // null = novo vínculo
    const [modalCompanyId, setModalCompanyId] = useState('');
    const [modalRoleId, setModalRoleId] = useState('');
    const [modalScope, setModalScope] = useState('INTERNAL'); // 'INTERNAL' | 'EXTERNAL'
    const [modalCustomerIds, setModalCustomerIds] = useState([]);

    // Estado do Campo de Pesquisa de Depositantes (Combobox)
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const comboboxRef = useRef(null);

    // Consultas base
    const { data: users = [], isLoading: isLoadingUsers, refetch: refetchUsers } = useQuery({
        queryKey: ['/api/users'],
        queryFn: () => customInstance({ url: '/api/users', method: 'GET' })
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['/api/companies-list'],
        queryFn: () => customInstance({ url: '/api/companies-list', method: 'GET' })
    });

    const { data: roles = [] } = useQuery({
        queryKey: ['/api/roles'],
        queryFn: () => customInstance({ url: '/api/roles', method: 'GET' })
    });

    const currentUser = useMemo(
        () => (isEdit ? users.find(u => u.id === id) : null),
        [isEdit, users, id]
    );

    const activeAssignments = isEdit ? (currentUser?.assignments || []) : draftAssignments;

    useEffect(() => {
        if (isEdit && currentUser) {
            setName(currentUser.name || '');
            setEmail(currentUser.email || '');
        }
    }, [isEdit, currentUser]);

    // Fecha o dropdown de pesquisa ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (comboboxRef.current && !comboboxRef.current.contains(e.target)) {
                setIsCustomerDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Carrega depositantes de uma empresa sob demanda (com cache em memória)
    const fetchCustomersForCompany = async (companyId) => {
        if (!companyId) return;
        if (customersByCompany[companyId]) return;

        setIsLoadingCustomers(true);
        try {
            const res = await customInstance({
                url: `/api/customers/summary?companyId=${companyId}`,
                method: 'GET'
            });
            setCustomersByCompany(prev => ({
                ...prev,
                [companyId]: Array.isArray(res) ? res : []
            }));
        } catch {
            setCustomersByCompany(prev => ({ ...prev, [companyId]: [] }));
        } finally {
            setIsLoadingCustomers(false);
        }
    };

    // Pré-carrega nomes dos depositantes para vínculos externos já existentes
    useEffect(() => {
        activeAssignments.forEach((a) => {
            if (a.allowedCustomerIds?.length > 0 && !customersByCompany[a.companyId]) {
                fetchCustomersForCompany(a.companyId);
            }
        });
    }, [
	
	customersByCompany,
	
]);

    // Abre modal para NOVO vínculo
    const handleOpenNewAssignmentModal = () => {
        setEditingCompanyId(null);
        setModalCompanyId('');
        setModalRoleId('');
        setModalScope('INTERNAL');
        setModalCustomerIds([]);
        setCustomerSearch('');
        setIsCustomerDropdownOpen(false);
        setIsLinkModalOpen(true);
    };

    // Abre modal para EDITAR vínculo existente
    const handleOpenEditAssignmentModal = (assignment) => {
        setEditingCompanyId(assignment.companyId);
        setModalCompanyId(assignment.companyId);
        const matchedRole = roles.find(r => r.id === assignment.roleId || r.name === assignment.roleName);
        setModalRoleId(matchedRole?.id || '');
        const isExternal = assignment.allowedCustomerIds && assignment.allowedCustomerIds.length > 0;
        setModalScope(isExternal ? 'EXTERNAL' : 'INTERNAL');
        setModalCustomerIds(isExternal ? [...assignment.allowedCustomerIds] : []);
        setCustomerSearch('');
        setIsCustomerDropdownOpen(false);
        fetchCustomersForCompany(assignment.companyId);
        setIsLinkModalOpen(true);
    };

    const handleModalCompanyChange = (companyId) => {
        setModalCompanyId(companyId);
        setModalCustomerIds([]);
        setCustomerSearch('');
        fetchCustomersForCompany(companyId);
    };

    const modalCompanyCustomers = customersByCompany[modalCompanyId] || [];

    const filteredSearchCustomers = useMemo(() => {
        const term = customerSearch.trim().toLowerCase();
        if (!term) return modalCompanyCustomers.slice(0, 30);
        return modalCompanyCustomers
            .filter(
                c =>
                    c.corporateName?.toLowerCase().includes(term) ||
                    c.cnpj?.replace(/\D/g, '').includes(term.replace(/\D/g, ''))
            )
            .slice(0, 30);
    }, [customerSearch, modalCompanyCustomers]);

    const selectedCustomerObjects = useMemo(() => {
        return modalCustomerIds.map(cid => {
            const found = modalCompanyCustomers.find(c => c.id === cid);
            return found || { id: cid, corporateName: cid };
        });
    }, [modalCustomerIds, modalCompanyCustomers]);

    const toggleCustomerInModal = (customerId) => {
        setModalCustomerIds(prev =>
            prev.includes(customerId)
                ? prev.filter(item => item !== customerId)
                : [...prev, customerId]
        );
    };

    // Salva vínculo a partir do Modal
    const handleConfirmModalAssignment = async () => {
        if (!modalCompanyId) return toast.warning('Selecione uma empresa.');
        if (!modalRoleId) return toast.warning('Selecione um perfil de acesso.');
        if (modalScope === 'EXTERNAL' && modalCustomerIds.length === 0) {
            return toast.warning('Selecione ao menos um depositante para o usuário externo.');
        }

        const allowedCustomerIds = modalScope === 'EXTERNAL' ? modalCustomerIds : [];

        if (!isEdit) {
            const compObj = companies.find(c => c.id === modalCompanyId);
            const roleObj = roles.find(r => r.id === modalRoleId);
            setDraftAssignments(prev => {
                const others = prev.filter(a => a.companyId !== modalCompanyId);
                return [
                    ...others,
                    {
                        companyId: modalCompanyId,
                        companyName: compObj?.corporateName || 'Empresa',
                        roleId: modalRoleId,
                        roleName: roleObj?.name || 'Perfil',
                        allowedCustomerIds
                    }
                ];
            });
            setIsLinkModalOpen(false);
            toast.success('Vínculo configurado! Clique em "Criar Usuário" para concluir.');
            return;
        }

        setIsSavingAssignment(true);
        try {
            const res = await customInstance({
                url: `/api/users/${id}/companies`,
                method: 'POST',
                data: {
                    companyId: modalCompanyId,
                    roleId: modalRoleId,
                    allowedCustomerIds
                }
            });
            toast.success(res?.message || 'Vínculo atualizado com sucesso!');
            setIsLinkModalOpen(false);
            await refetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao salvar vínculo.');
        } finally {
            setIsSavingAssignment(false);
        }
    };

    const handleRemoveAssignment = async (companyId) => {
        if (!isEdit) {
            setDraftAssignments(prev => prev.filter(a => a.companyId !== companyId));
            return;
        }

        setRemovingCompanyId(companyId);
        try {
            await customInstance({
                url: `/api/users/${id}/companies/${companyId}`,
                method: 'DELETE'
            });
            toast.success('Vínculo removido com sucesso.');
            await refetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao remover vínculo.');
        } finally {
            setRemovingCompanyId(null);
        }
    };

    // Salva dados cadastrais (ou cria usuário + vínculos staged)
    const handleSaveUser = async (e) => {
        e.preventDefault();
        if (!name.trim() || name.trim().length < 3) {
            return toast.warning('Informe o nome completo (mínimo 3 caracteres).');
        }
        if (!email.trim() || !email.includes('@')) {
            return toast.warning('Informe um e-mail válido.');
        }

        setIsSavingUser(true);
        try {
            if (isEdit) {
                await customInstance({
                    url: `/api/users/${id}`,
                    method: 'PUT',
                    data: { name: name.trim(), email: email.trim() }
                });
                toast.success('Dados cadastrais atualizados!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
            } else {
                if (!password || password.length < 6) {
                    setIsSavingUser(false);
                    return toast.warning('A senha inicial deve ter no mínimo 6 caracteres.');
                }

                const created = await customInstance({
                    url: '/api/users',
                    method: 'POST',
                    data: {
                        name: name.trim(),
                        email: email.trim(),
                        password
                    }
                });

                if (created?.id && draftAssignments.length > 0) {
                    for (const item of draftAssignments) {
                        await customInstance({
                            url: `/api/users/${created.id}/companies`,
                            method: 'POST',
                            data: {
                                companyId: item.companyId,
                                roleId: item.roleId,
                                allowedCustomerIds: item.allowedCustomerIds
                            }
                        });
                    }
                }

                toast.success('Usuário criado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                navigate('/usuarios');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao salvar usuário.');
        } finally {
            setIsSavingUser(false);
        }
    };

    const handleResetPassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            return toast.warning('A nova senha deve ter no mínimo 6 caracteres.');
        }

        setIsResettingPassword(true);
        try {
            const res = await customInstance({
                url: `/api/users/${id}/password`,
                method: 'PUT',
                data: { newPassword }
            });
            toast.success(res?.message || 'Senha redefinida com sucesso!');
            setNewPassword('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao redefinir senha.');
        } finally {
            setIsResettingPassword(false);
        }
    };

    const availableCompaniesForNew = useMemo(() => {
        const linkedIds = new Set(activeAssignments.map(a => a.companyId));
        return companies.filter(c => !linkedIds.has(c.id));
    }, [companies, activeAssignments]);

    if (isEdit && isLoadingUsers) {
        return (
            <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (isEdit && !isLoadingUsers && !currentUser) {
        return (
            <div className="p-8 text-center space-y-3">
                <p className="text-sm text-slate-500">Usuário não encontrado.</p>
                <Button variant="outline" onClick={() => navigate('/usuarios')}>Voltar para Usuários</Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-6 pb-10 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-wrap items-center justify-between bg-white p-5 border border-slate-200/80 rounded-xl shadow-2xs gap-4">
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => navigate('/usuarios')}
                        className="bg-white"
                    >
                        <ArrowLeft size={16} />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-blue-600" />
                            <h1 className="text-xl font-bold text-slate-900">
                                {isEdit ? `Gerenciar Usuário: ${currentUser?.name}` : 'Novo Usuário'}
                            </h1>
                            {currentUser?.isMaster && (
                                <Badge className="bg-slate-900 text-white text-[10px]">
                                    Administrador Global
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Configure credenciais, empresas vinculadas, perfis de acesso e restrições de depositantes.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate('/usuarios')}
                        className="bg-white h-9 text-xs"
                    >
                        Voltar à Lista
                    </Button>
                    <Button
                        type="submit"
                        form="user-base-form"
                        disabled={isSavingUser}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-9 text-xs min-w-[160px]"
                    >
                        {isSavingUser ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                            <Save className="h-4 w-4 mr-1.5" />
                        )}
                        {isEdit ? 'Salvar Dados Cadastrais' : 'Criar Usuário'}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* COLUNA ESQUERDA: DADOS CADASTRAIS & SENHA */}
                <div className="lg:col-span-5 space-y-6">
                    <Card className="bg-white border-slate-200/80 shadow-xs">
                        <CardHeader className="pb-3 border-b border-slate-100">
                            <CardTitle className="text-sm font-bold text-slate-900">
                                Identificação & Credenciais
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Informações básicas para autenticação no portal web e coletor.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <form id="user-base-form" onSubmit={handleSaveUser} className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-700">Nome Completo *</Label>
                                    <Input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Ex: João da Silva"
                                        className="bg-white h-9 text-xs"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-700">E-mail de Acesso *</Label>
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="usuario@empresa.com.br"
                                        className="bg-white h-9 text-xs font-mono"
                                    />
                                </div>

                                {!isEdit && (
                                    <div className="space-y-1.5 pt-1">
                                        <Label className="text-xs font-bold text-slate-700">Senha Inicial *</Label>
                                        <Input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Mínimo 6 caracteres"
                                            className="bg-white h-9 text-xs"
                                        />
                                    </div>
                                )}
                            </form>
                        </CardContent>
                    </Card>

                    {isEdit && (
                        <Card className="bg-white border-slate-200/80 shadow-xs">
                            <CardHeader className="pb-3 border-b border-slate-100">
                                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <KeyRound size={16} className="text-amber-600" /> Redefinir Senha de Acesso
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Defina uma nova senha caso o usuário tenha perdido o acesso.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-700">Nova Senha</Label>
                                    <Input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Mínimo 6 caracteres"
                                        className="bg-white h-9 text-xs"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleResetPassword}
                                    disabled={isResettingPassword || newPassword.length < 6}
                                    className="w-full h-9 text-xs font-bold border-amber-300 text-amber-800 hover:bg-amber-50 bg-white"
                                >
                                    {isResettingPassword && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                                    Atualizar Senha
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* COLUNA DIREITA: EMPRESAS & ACESSOS CONFIGURADOS */}
                <div className="lg:col-span-7">
                    {currentUser?.isMaster ? (
                        <Card className="bg-slate-50 border-slate-200">
                            <CardContent className="p-6 text-xs text-slate-700 space-y-1">
                                <p className="font-bold text-sm text-slate-900">Administrador Global</p>
                                <p>
                                    Este usuário possui acesso irrestrito a todas as empresas e módulos do sistema.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="bg-white border-slate-200/80 shadow-xs">
                            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <Building2 size={16} className="text-blue-600" />
                                        Empresas & Acessos Configurados ({activeAssignments.length})
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-0.5">
                                        Cada empresa pode possuir um perfil e um escopo (Interno ou Externo) independentes.
                                    </CardDescription>
                                </div>

                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleOpenNewAssignmentModal}
                                    disabled={availableCompaniesForNew.length === 0}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-8 text-xs shrink-0"
                                >
                                    <Plus size={14} className="mr-1" /> Adicionar Vínculo
                                </Button>
                            </CardHeader>

                            <CardContent className="pt-4 space-y-3">
                                {activeAssignments.length === 0 ? (
                                    <div className="py-10 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2">
                                        <p className="text-xs text-slate-500">
                                            Nenhuma empresa vinculada a este usuário ainda.
                                        </p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleOpenNewAssignmentModal}
                                            className="bg-white text-xs h-8"
                                        >
                                            <Plus size={13} className="mr-1" /> Vincular Primeira Empresa
                                        </Button>
                                    </div>
                                ) : (
                                    activeAssignments.map((a) => {
                                        const isExternal = a.allowedCustomerIds && a.allowedCustomerIds.length > 0;
                                        const cachedCustomers = customersByCompany[a.companyId] || [];

                                        return (
                                            <div
                                                key={a.companyId}
                                                className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                            >
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-sm text-slate-900">{a.companyName}</span>
                                                        <Badge variant="outline" className="bg-white text-xs gap-1 font-medium">
                                                            <Shield size={11} className="text-blue-600" /> {a.roleName}
                                                        </Badge>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {isExternal ? (
                                                            <>
                                                                <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] gap-1">
                                                                    <Globe size={10} /> Externo ({a.allowedCustomerIds.length})
                                                                </Badge>
                                                                {a.allowedCustomerIds.slice(0, 3).map(cid => {
                                                                    const cust = cachedCustomers.find(c => c.id === cid);
                                                                    return cust ? (
                                                                        <Badge
                                                                            key={cid}
                                                                            variant="outline"
                                                                            className="bg-white text-[10px] text-slate-600 font-normal"
                                                                        >
                                                                            {cust.corporateName}
                                                                        </Badge>
                                                                    ) : null;
                                                                })}
                                                                {a.allowedCustomerIds.length > 3 && (
                                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                                        +{a.allowedCustomerIds.length - 3}
                                                                    </span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <Badge className="bg-blue-50 text-blue-800 border-blue-200 text-[10px] gap-1">
                                                                <Briefcase size={10} /> Interno (Acesso Geral)
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleOpenEditAssignmentModal(a)}
                                                        className="h-8 text-xs bg-white text-slate-700 hover:text-blue-700 hover:border-blue-300"
                                                    >
                                                        <Pencil size={12} className="mr-1.5" /> Editar
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        disabled={removingCompanyId === a.companyId}
                                                        onClick={() => handleRemoveAssignment(a.companyId)}
                                                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                        title="Remover vínculo"
                                                    >
                                                        {removingCompanyId === a.companyId ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* MODAL DE ADICIONAR / EDITAR VÍNCULO DE EMPRESA */}
            <Dialog open={isLinkModalOpen} onOpenChange={(v) => !isSavingAssignment && setIsLinkModalOpen(v)}>
                <DialogContent className="sm:max-w-lg bg-white overflow-visible">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2 text-base">
                            <Building2 className="h-5 w-5 text-blue-600" />
                            {editingCompanyId ? 'Editar Vínculo da Empresa' : 'Novo Vínculo de Empresa'}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Defina o perfil de permissões e o escopo de acesso do usuário nesta empresa.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* EMPRESA */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">Empresa *</Label>
                            <Select
                                value={modalCompanyId}
                                onValueChange={handleModalCompanyChange}
                                disabled={Boolean(editingCompanyId)}
                            >
                                <SelectTrigger className="bg-white h-9 text-xs">
                                    <SelectValue placeholder="Selecione a empresa..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {(editingCompanyId ? companies : availableCompaniesForNew).map(c => (
                                        <SelectItem key={c.id} value={c.id} className="text-xs">
                                            {c.corporateName} ({c.cnpj})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* PERFIL */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">Perfil de Acesso *</Label>
                            <Select value={modalRoleId} onValueChange={setModalRoleId}>
                                <SelectTrigger className="bg-white h-9 text-xs">
                                    <SelectValue placeholder="Selecione o perfil..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {roles.map(r => (
                                        <SelectItem key={r.id} value={r.id} className="text-xs">
                                            {r.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* TIPO DE ESCOPO: INTERNO VS EXTERNO */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700 block">Tipo de Acesso *</Label>
                            <div className="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setModalScope('INTERNAL');
                                        setModalCustomerIds([]);
                                    }}
                                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${modalScope === 'INTERNAL'
                                        ? 'border-blue-500 bg-blue-50/50 text-blue-950'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                >
                                    <Briefcase size={15} className="text-blue-600 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="text-xs font-bold block">Interno</span>
                                        <span className="text-[10px] text-slate-500 block">
                                            Acesso a todos os depositantes.
                                        </span>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setModalScope('EXTERNAL')}
                                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${modalScope === 'EXTERNAL'
                                        ? 'border-amber-500 bg-amber-50/50 text-amber-950'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                >
                                    <Globe size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="text-xs font-bold block">Externo</span>
                                        <span className="text-[10px] text-slate-500 block">
                                            Restrito aos depositantes escolhidos.
                                        </span>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* CAMPO DE PESQUISA DE DEPOSITANTES (QUANDO EXTERNO) */}
                        {modalScope === 'EXTERNAL' && (
                            <div className="space-y-2.5 pt-1">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-slate-700">
                                        Depositantes Autorizados ({modalCustomerIds.length}) *
                                    </Label>
                                    {modalCustomerIds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setModalCustomerIds([])}
                                            className="text-[11px] text-rose-600 hover:underline font-medium"
                                        >
                                            Limpar todos
                                        </button>
                                    )}
                                </div>

                                {!modalCompanyId ? (
                                    <p className="text-xs text-slate-400 italic">
                                        Selecione a empresa acima para pesquisar depositantes.
                                    </p>
                                ) : (
                                    <div ref={comboboxRef} className="relative">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Pesquisar depositante por razão social ou CNPJ..."
                                                value={customerSearch}
                                                onFocus={() => setIsCustomerDropdownOpen(true)}
                                                onChange={(e) => {
                                                    setCustomerSearch(e.target.value);
                                                    setIsCustomerDropdownOpen(true);
                                                }}
                                                className="pl-8 pr-8 h-9 text-xs bg-white"
                                            />
                                            {isLoadingCustomers && (
                                                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
                                            )}
                                        </div>

                                        {/* DROPDOWN DE RESULTADOS DA PESQUISA */}
                                        {isCustomerDropdownOpen && !isLoadingCustomers && (
                                            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto py-1">
                                                {filteredSearchCustomers.length === 0 ? (
                                                    <div className="px-3 py-4 text-center text-xs text-slate-400 italic">
                                                        Nenhum depositante encontrado.
                                                    </div>
                                                ) : (
                                                    filteredSearchCustomers.map((cust) => {
                                                        const isSelected = modalCustomerIds.includes(cust.id);
                                                        return (
                                                            <button
                                                                key={cust.id}
                                                                type="button"
                                                                onClick={() => toggleCustomerInModal(cust.id)}
                                                                className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${isSelected
                                                                    ? 'bg-amber-50/80 text-amber-950 font-semibold'
                                                                    : 'hover:bg-slate-50 text-slate-700'
                                                                    }`}
                                                            >
                                                                <div className="min-w-0">
                                                                    <span className="block truncate">{cust.corporateName}</span>
                                                                    {cust.cnpj && (
                                                                        <span className="text-[10px] font-mono text-slate-400">
                                                                            CNPJ: {cust.cnpj}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {isSelected && (
                                                                    <Check size={14} className="text-amber-600 shrink-0" />
                                                                )}
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* CHIPS DOS DEPOSITANTES SELECIONADOS */}
                                {selectedCustomerObjects.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 max-h-28 overflow-y-auto">
                                        {selectedCustomerObjects.map((cust) => (
                                            <Badge
                                                key={cust.id}
                                                className="bg-amber-100 text-amber-950 border-amber-200 text-[11px] font-medium gap-1.5 py-0.5 pr-1.5"
                                            >
                                                <span className="truncate max-w-[220px]">{cust.corporateName}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleCustomerInModal(cust.id)}
                                                    className="hover:text-rose-700 rounded-full p-0.5"
                                                    title="Remover depositante"
                                                >
                                                    <X size={11} />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="border-t pt-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsLinkModalOpen(false)}
                            disabled={isSavingAssignment}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={handleConfirmModalAssignment}
                            disabled={isSavingAssignment || !modalCompanyId || !modalRoleId}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                        >
                            {isSavingAssignment && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                            {editingCompanyId ? 'Salvar Alterações' : 'Confirmar Vínculo'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}