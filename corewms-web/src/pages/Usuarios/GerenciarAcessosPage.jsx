import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';

import {
    useGetApiUsers,
    usePostApiUsersUserIdCompanies,
    useDeleteApiUsersUserIdCompaniesCompanyId
} from '@/api/generated/users/users';
import { useGetApiCompanies } from '@/api/generated/companies/companies';
import { useGetApiRoles } from '@/api/generated/roles/roles';
import { useGetApiCustomers } from '@/api/generated/customers/customers';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, Building2, Shield, Users, UserCheck, Trash2,
    PlusCircle, Search, Loader2, KeyRound, CheckCircle2, Filter
} from 'lucide-react';
import { toast } from 'sonner';

const assignSchema = z.object({
    companyId: z.string().min(1, 'Selecione a empresa.'),
    roleId: z.string().min(1, 'Selecione o perfil.'),
    allowedCustomerIds: z.array(z.string()).optional()
});

export default function GerenciarAcessosPage() {
    const { id: userId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [customerSearch, setCustomerSearch] = useState('');

    // 1. Busca Usuário Atual
    const { data: usersData, isLoading: loadingUsers } = useGetApiUsers();
    const users = usersData?.items || (Array.isArray(usersData) ? usersData : []);
    const currentUser = users.find(u => u.id === userId);

    // 2. Busca Listas de Apoio
    const { data: companiesData, isLoading: loadingCompanies } = useGetApiCompanies();
    const companies = Array.isArray(companiesData) ? companiesData : (companiesData?.items || []);

    const { data: rolesData, isLoading: loadingRoles } = useGetApiRoles();
    const roles = Array.isArray(rolesData) ? rolesData : (rolesData?.items || []);

    const { data: customersData, isLoading: loadingCustomers } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const allCustomers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(assignSchema),
        defaultValues: { companyId: '', roleId: '', allowedCustomerIds: [] }
    });

    const watchCompanyId = watch('companyId');
    const watchRoleId = watch('roleId');
    const watchAllowedCustomerIds = watch('allowedCustomerIds') || [];

    // Filtra depositantes pertencentes à empresa selecionada no formulário
    const availableCustomers = allCustomers.filter(c => !watchCompanyId || c.companyId === watchCompanyId);

    // Filtra os depositantes visíveis no campo de busca
    const filteredCustomers = availableCustomers.filter(c =>
        c.corporateName?.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.cnpj?.includes(customerSearch)
    );

    const { mutate: assignUser, isPending: isAssigning } = usePostApiUsersUserIdCompanies({
        mutation: {
            onSuccess: () => {
                toast.success('Vínculo de acesso salvo com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                reset({ companyId: '', roleId: '', allowedCustomerIds: [] });
            },
            onError: (err) => toast.error(err.response?.data?.detail || err.response?.data?.message || 'Erro ao vincular empresa.')
        }
    });

    const { mutate: removeAssignment, isPending: isRemoving } = useDeleteApiUsersUserIdCompaniesCompanyId({
        mutation: {
            onSuccess: () => {
                toast.success('Acesso revogado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
            },
            onError: (err) => toast.error(err.response?.data?.detail || err.response?.data?.message || 'Erro ao remover vínculo.')
        }
    });

    const onSubmit = (data) => {
        assignUser({
            userId,
            data: {
                companyId: data.companyId,
                roleId: data.roleId,
                allowedCustomerIds: data.allowedCustomerIds.length > 0 ? data.allowedCustomerIds : null
            }
        });
    };

    const handleEditAssignment = (assignment) => {
        setValue('companyId', assignment.companyId, { shouldValidate: true });
        setValue('roleId', assignment.roleId, { shouldValidate: true });
        setValue('allowedCustomerIds', assignment.allowedCustomerIds || [], { shouldValidate: true });
        toast.info(`Editando acesso para ${assignment.companyName}`);
    };

    const handleRemove = (companyId) => {
        removeAssignment({ userId, companyId });
    };

    const toggleCustomer = (customerId, checked) => {
        const current = watchAllowedCustomerIds;
        const updated = checked
            ? [...current, customerId]
            : current.filter(id => id !== customerId);
        setValue('allowedCustomerIds', updated, { shouldValidate: true });
    };

    const selectAllCustomers = () => {
        setValue('allowedCustomerIds', availableCustomers.map(c => c.id), { shouldValidate: true });
    };

    const clearCustomerSelection = () => {
        setValue('allowedCustomerIds', [], { shouldValidate: true });
    };

    const isLoadingData = loadingUsers || loadingCompanies || loadingRoles || loadingCustomers;
    const assignments = currentUser?.assignments || [];

    if (isLoadingData) {
        return (
            <div className="flex items-center justify-center min-h-[400px] animate-in fade-in duration-300">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO DA PÁGINA */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/usuarios')}
                        className="bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                                Gestão de Acessos & Viseira B2B
                            </h1>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {currentUser?.name}
                            </Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Configuração de matriz de permissões por Empresa e isolamento de Depositantes para {currentUser?.email}.
                        </p>
                    </div>
                </div>
            </div>

            {/* CONTEÚDO PRINCIPAL EM 2 COLUNAS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* COLUNA ESQUERDA: VÍNCULOS ATIVOS (5 Colunas) */}
                <div className="lg:col-span-5 space-y-4">
                    <Card className="border-slate-200/80 shadow-sm bg-white">
                        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                            <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <KeyRound className="text-blue-600" size={18} /> Vínculos Configurados
                                </span>
                                <Badge className="bg-slate-200 text-slate-800 hover:bg-slate-200">
                                    {assignments.length} {assignments.length === 1 ? 'Ambiente' : 'Ambientes'}
                                </Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            {assignments.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6">
                                    <Shield className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                                    <p className="font-semibold text-slate-700">Nenhum acesso concedido</p>
                                    <p className="text-xs text-slate-400 mt-1">Utilize o formulário ao lado para liberar uma empresa para este usuário.</p>
                                </div>
                            ) : (
                                assignments.map((a) => (
                                    <div
                                        key={a.companyId}
                                        className="group p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-md transition-all space-y-3"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                    <Building2 size={20} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 text-sm leading-tight">{a.companyName}</h3>
                                                    <span className="inline-flex items-center gap-1 text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded mt-1 font-semibold">
                                                        <Shield size={12} /> {a.roleName}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEditAssignment(a)}
                                                    className="text-blue-600 hover:bg-blue-50 h-8 text-xs px-2"
                                                >
                                                    Editar
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemove(a.companyId)}
                                                    disabled={isRemoving || isAssigning}
                                                    title="Revogar Acesso"
                                                    className="text-rose-500 hover:bg-rose-50 hover:text-rose-700 h-8 w-8 p-0"
                                                >
                                                    {isRemoving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                                            <span className="text-slate-500 font-medium">Modo de Acesso:</span>
                                            {a.allowedCustomerIds && a.allowedCustomerIds.length > 0 ? (
                                                <Badge className="bg-amber-50 text-amber-800 border-amber-200 gap-1">
                                                    <Users size={12} /> Restrito a {a.allowedCustomerIds.length} Depositante(s)
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 gap-1">
                                                    <UserCheck size={12} /> Interno (Acesso Total)
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* COLUNA DIREITA: FORMULÁRIO DE CONCESSÃO/EDIÇÃO DE ACESSO (7 Colunas) */}
                <div className="lg:col-span-7 space-y-4">
                    <Card className="border-slate-200/80 shadow-sm bg-white">
                        <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
                            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <PlusCircle className="text-blue-600" size={18} /> Conceder ou Atualizar Permissão
                            </CardTitle>
                            <CardDescription className="text-slate-500 text-xs">
                                Selecione a operação, o perfil de acesso e defina as restrições B2B para o parceiro.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-6">
                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

                                {/* SELEÇÃO DE EMPRESA E ROLE */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-slate-800 font-semibold text-xs">Empresa (Operação) *</Label>
                                        <Select
                                            value={watchCompanyId}
                                            onValueChange={(val) => {
                                                setValue('companyId', val, { shouldValidate: true });
                                                setValue('allowedCustomerIds', []);
                                            }}
                                        >
                                            <SelectTrigger className={`bg-white h-10 ${errors.companyId ? 'border-rose-500' : 'border-slate-200'}`}>
                                                <SelectValue placeholder="Escolha a empresa..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {companies.map((empresa) => (
                                                    <SelectItem key={empresa.id} value={empresa.id}>
                                                        {empresa.corporateName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {errors.companyId && <p className="text-xs text-rose-500">{errors.companyId.message}</p>}
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-slate-800 font-semibold text-xs">Perfil de Acesso (Role) *</Label>
                                        <Select
                                            value={watchRoleId}
                                            onValueChange={(val) => setValue('roleId', val, { shouldValidate: true })}
                                        >
                                            <SelectTrigger className={`bg-white h-10 ${errors.roleId ? 'border-rose-500' : 'border-slate-200'}`}>
                                                <SelectValue placeholder="Escolha o perfil..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {roles.map((role) => (
                                                    <SelectItem key={role.id} value={role.id}>
                                                        {role.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {errors.roleId && <p className="text-xs text-rose-500">{errors.roleId.message}</p>}
                                    </div>
                                </div>

                                {/* SEÇÃO VISEIRA B2B (MÚLTIPLOS DEPOSITANTES) */}
                                <div className="space-y-3 pt-2 border-t border-slate-100">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <Label className="text-slate-900 font-bold text-sm flex items-center gap-2">
                                                <Filter size={16} className="text-amber-600" /> Viseira B2B (Restrição de Depositantes)
                                            </Label>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                Marque os clientes visíveis. <strong className="text-emerald-700">Deixe todos desmarcados para conceder acesso interno total.</strong>
                                            </p>
                                        </div>

                                        <div className="flex gap-2 shrink-0">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={selectAllCustomers}
                                                disabled={!watchCompanyId || availableCustomers.length === 0}
                                                className="h-7 text-xs bg-white"
                                            >
                                                Marcar Todos
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={clearCustomerSelection}
                                                disabled={watchAllowedCustomerIds.length === 0}
                                                className="h-7 text-xs bg-white text-rose-600 border-rose-200 hover:bg-rose-50"
                                            >
                                                Limpar
                                            </Button>
                                        </div>
                                    </div>

                                    {/* CAMPO DE BUSCA DE DEPOSITANTES */}
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder="Buscar depositante por razão social ou CNPJ..."
                                            value={customerSearch}
                                            onChange={(e) => setCustomerSearch(e.target.value)}
                                            disabled={!watchCompanyId}
                                            className="pl-9 bg-slate-50 border-slate-200 h-9 text-xs"
                                        />
                                    </div>

                                    {/* GRID DE CHECKBOXES DE DEPOSITANTES */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto p-3 bg-slate-50/50 border border-slate-200 rounded-xl shadow-inner">
                                        {!watchCompanyId ? (
                                            <p className="text-xs text-slate-400 col-span-2 text-center py-6">
                                                Selecione uma empresa acima para carregar a lista de depositantes.
                                            </p>
                                        ) : filteredCustomers.length === 0 ? (
                                            <p className="text-xs text-slate-400 col-span-2 text-center py-6">
                                                Nenhum depositante encontrado para esta empresa.
                                            </p>
                                        ) : (
                                            filteredCustomers.map(c => {
                                                const isChecked = watchAllowedCustomerIds.includes(c.id);
                                                return (
                                                    <label
                                                        key={c.id}
                                                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${isChecked
                                                            ? 'bg-amber-50/80 border-amber-300 shadow-xs'
                                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                                            }`}
                                                    >
                                                        <Checkbox
                                                            className="mt-0.5 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => toggleCustomer(c.id, checked)}
                                                        />
                                                        <div className="flex flex-col min-w-0">
                                                            <span className={`text-xs font-semibold ${isChecked ? 'text-amber-950' : 'text-slate-800'} truncate`}>
                                                                {c.corporateName}
                                                            </span>
                                                            <span className="text-[10px] font-mono text-slate-400">
                                                                CNPJ: {c.cnpj}
                                                            </span>
                                                        </div>
                                                    </label>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* INDICADOR DE MODO SELECIONADO */}
                                    <div className="p-3 rounded-lg border text-xs flex items-center gap-2 bg-slate-50 border-slate-200 text-slate-600">
                                        {watchAllowedCustomerIds.length > 0 ? (
                                            <>
                                                <Users className="text-amber-600 shrink-0" size={16} />
                                                <span>
                                                    Modo **Parceiro B2B**: O usuário visualiza apenas **{watchAllowedCustomerIds.length} depositante(s)** nesta empresa.
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <UserCheck className="text-emerald-600 shrink-0" size={16} />
                                                <span>
                                                    Modo **Equipe Interna**: Acesso total a todos os depositantes cadastrados nesta empresa.
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-2 flex justify-end">
                                    <Button
                                        type="submit"
                                        disabled={isAssigning || isRemoving}
                                        className="bg-slate-900 hover:bg-slate-800 text-white min-w-[180px] h-10 font-medium"
                                    >
                                        {isAssigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                        Salvar Permissões
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    );
}