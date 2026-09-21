import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
    usePostApiUsersUserIdCompanies,
    useDeleteApiUsersUserIdCompaniesCompanyId
} from '@/api/generated/users/users';
import { useGetApiCompanies } from '@/api/generated/companies/companies';
import { useGetApiRoles } from '@/api/generated/roles/roles';
import { useGetApiCustomers } from '@/api/generated/customers/customers';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Building2, Trash2, PlusCircle, Users, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

// Validamos o allowedCustomerIds como um array de strings opcional
const assignSchema = z.object({
    companyId: z.string().min(1, 'Selecione a empresa.'),
    roleId: z.string().min(1, 'Selecione o perfil.'),
    allowedCustomerIds: z.array(z.string()).optional()
});

export default function VincularEmpresaModal({ user, open, onOpenChange }) {
    const queryClient = useQueryClient();

    const { data: companies, isLoading: loadingCompanies } = useGetApiCompanies();
    const { data: roles, isLoading: loadingRoles } = useGetApiRoles();

    // Busca depositantes. Usa o X-Company-Id global, mas idealmente filtraria pela companyId selecionada no formulário
    const { data: customers, isLoading: loadingCustomers } = useGetApiCustomers(
        { OnlyActive: true, PageSize: 500 },
        { query: { enabled: open } }
    );

    const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(assignSchema),
        defaultValues: { companyId: '', roleId: '', allowedCustomerIds: [] }
    });

    const watchCompanyId = watch('companyId');
    const watchRoleId = watch('roleId');
    const watchAllowedCustomerIds = watch('allowedCustomerIds') || [];

    useEffect(() => {
        if (open) reset();
    }, [open, reset]);

    const { mutate: assignUser, isPending: isAssigning } = usePostApiUsersUserIdCompanies({
        mutation: {
            onSuccess: () => {
                toast.success(`Vínculo adicionado com sucesso!`);
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                reset();
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
            userId: user.id,
            data: {
                companyId: data.companyId,
                roleId: data.roleId,
                // Se array vazio, envia null = Usuário Interno Global
                allowedCustomerIds: data.allowedCustomerIds.length > 0 ? data.allowedCustomerIds : null
            }
        });
    };

    const handleRemove = (companyId) => {
        removeAssignment({ userId: user.id, companyId });
    };

    // Função para marcar/desmarcar um depositante na lista
    const toggleCustomer = (customerId, checked) => {
        const current = watchAllowedCustomerIds;
        const updated = checked
            ? [...current, customerId]
            : current.filter(id => id !== customerId);
        setValue('allowedCustomerIds', updated, { shouldValidate: true });
    };

    const selectAllCustomers = () => {
        setValue('allowedCustomerIds', customers?.map(c => c.id) || [], { shouldValidate: true });
    };

    const clearCustomerSelection = () => {
        setValue('allowedCustomerIds', [], { shouldValidate: true });
    };

    const isLoadingData = loadingCompanies || loadingRoles || loadingCustomers;
    const assignments = user?.assignments || [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl bg-white p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Building2 className="text-blue-600" size={20} /> Acessos de {user?.name}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Gerencie os ambientes e a Viseira B2B (restrição por Depositantes) deste usuário.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                {isLoadingData ? (
                    <div className="py-16 flex justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-6 space-y-8">
                        {/* VÍNCULOS ATUAIS */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-slate-900 border-b pb-2">Vínculos Ativos</h4>
                            {assignments.length === 0 ? (
                                <p className="text-sm text-slate-500 italic bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
                                    Nenhum acesso configurado para este usuário.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {assignments.map(a => (
                                        <div key={a.companyId} className="flex flex-col bg-white border border-slate-200 px-4 py-3 rounded-lg shadow-sm hover:border-blue-200 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-slate-900 leading-tight">{a.companyName}</span>
                                                    <span className="text-xs text-blue-600 font-mono mt-0.5">{a.roleName}</span>
                                                </div>
                                                <Button
                                                    variant="ghost" size="sm" onClick={() => handleRemove(a.companyId)}
                                                    disabled={isRemoving || isAssigning} title="Revogar Acesso"
                                                    className="text-rose-500 hover:bg-rose-50 hover:text-rose-700 h-8 w-8 p-0 shrink-0 ml-4"
                                                >
                                                    {isRemoving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                </Button>
                                            </div>

                                            <div className="mt-2 pt-2 border-t border-slate-100">
                                                {a.allowedCustomerIds && a.allowedCustomerIds.length > 0 ? (
                                                    <span className="text-[10px] uppercase font-bold text-amber-600 flex items-center gap-1 w-fit bg-amber-50 px-1.5 py-0.5 rounded">
                                                        <Users size={12} /> Acesso B2B Restrito ({a.allowedCustomerIds.length} Depositantes)
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] uppercase font-bold text-emerald-600 flex items-center gap-1 w-fit bg-emerald-50 px-1.5 py-0.5 rounded">
                                                        <UserCheck size={12} /> Equipe Interna (Acesso Total)
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* NOVO VÍNCULO */}
                        <form onSubmit={handleSubmit(onSubmit)} className="bg-slate-50 p-5 rounded-xl border border-slate-200/80 space-y-5 shadow-inner">
                            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 border-b pb-2">
                                <PlusCircle size={16} className="text-slate-400" /> Conceder Novo Acesso
                            </h4>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-slate-700 text-xs font-semibold">Empresa (Operação) *</Label>
                                    <Select value={watchCompanyId} onValueChange={(val) => setValue('companyId', val, { shouldValidate: true })}>
                                        <SelectTrigger className={`bg-white h-9 ${errors.companyId ? 'border-rose-500' : ''}`}>
                                            <SelectValue placeholder="Escolha a empresa..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {companies?.map((empresa) => (
                                                <SelectItem key={empresa.id} value={empresa.id}>
                                                    {empresa.corporateName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.companyId && <p className="text-[10px] text-rose-500">{errors.companyId.message}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-slate-700 text-xs font-semibold">Perfil de Permissões *</Label>
                                    <Select value={watchRoleId} onValueChange={(val) => setValue('roleId', val, { shouldValidate: true })}>
                                        <SelectTrigger className={`bg-white h-9 ${errors.roleId ? 'border-rose-500' : ''}`}>
                                            <SelectValue placeholder="Escolha o perfil..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {roles?.map((role) => (
                                                <SelectItem key={role.id} value={role.id}>
                                                    {role.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.roleId && <p className="text-[10px] text-rose-500">{errors.roleId.message}</p>}
                                </div>
                            </div>

                            {/* VISEIRA B2B (MÚLTIPLOS DEPOSITANTES) */}
                            <div className="pt-2">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <Label className="text-slate-700 text-xs font-semibold flex items-center gap-1">
                                            Viseira B2B (Restrição de Depositantes)
                                        </Label>
                                        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                                            Para restringir a visão, selecione os clientes. <strong className="text-emerald-700">Deixe vazio para dar acesso interno total.</strong>
                                        </p>
                                    </div>
                                    <div className="space-x-2">
                                        <Button type="button" variant="outline" size="sm" onClick={selectAllCustomers} className="h-6 text-[10px] px-2 bg-white">
                                            Todos
                                        </Button>
                                        <Button type="button" variant="outline" size="sm" onClick={clearCustomerSelection} className="h-6 text-[10px] px-2 bg-white text-rose-600 border-rose-200">
                                            Limpar
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                    {!customers || customers.length === 0 ? (
                                        <p className="text-xs text-slate-400 col-span-2 text-center py-2">Nenhum cliente cadastrado.</p>
                                    ) : (
                                        customers.map(c => {
                                            const isChecked = watchAllowedCustomerIds.includes(c.id);
                                            return (
                                                <label
                                                    key={c.id}
                                                    className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${isChecked ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                                                >
                                                    <Checkbox
                                                        className="mt-0.5 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                                                        checked={isChecked}
                                                        onCheckedChange={(checked) => toggleCustomer(c.id, checked)}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className={`text-xs font-medium ${isChecked ? 'text-amber-900' : 'text-slate-700'} line-clamp-1`}>{c.corporateName}</span>
                                                        <span className="text-[9px] font-mono text-slate-400">{c.cnpj}</span>
                                                    </div>
                                                </label>
                                            )
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end border-t border-slate-200/60 mt-4">
                                <Button type="submit" disabled={isAssigning || isRemoving} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[150px]">
                                    {isAssigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlusCircle className="h-4 w-4 mr-2" />}
                                    Gravar Vínculo
                                </Button>
                            </div>
                        </form>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}