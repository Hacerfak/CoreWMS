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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2, Trash2, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';

const assignSchema = z.object({
    companyId: z.string().min(1, 'Selecione a empresa.'),
    roleId: z.string().min(1, 'Selecione o perfil.')
});

export default function VincularEmpresaModal({ user, open, onOpenChange }) {
    const queryClient = useQueryClient();
    const { data: companies, isLoading: loadingCompanies } = useGetApiCompanies();
    const { data: roles, isLoading: loadingRoles } = useGetApiRoles();

    const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(assignSchema),
        defaultValues: { companyId: '', roleId: '' }
    });

    const watchCompanyId = watch('companyId');
    const watchRoleId = watch('roleId');

    useEffect(() => {
        if (open) reset();
    }, [open, reset]);

    // Mutação para Adicionar Vínculo
    const { mutate: assignUser, isPending: isAssigning } = usePostApiUsersUserIdCompanies({
        mutation: {
            onSuccess: () => {
                toast.success(`Vínculo adicionado com sucesso!`);
                queryClient.invalidateQueries({ queryKey: ['/api/users'] });
                reset(); // Limpa o form após sucesso
            },
            onError: (err) => {
                toast.error(err.response?.data?.detail || err.response?.data?.message || 'Erro ao vincular empresa.');
            }
        }
    });

    // Mutação para Remover Vínculo
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
                roleId: data.roleId
            }
        });
    };

    const handleRemove = (companyId) => {
        removeAssignment({ userId: user.id, companyId });
    };

    const isLoadingData = loadingCompanies || loadingRoles;
    const assignments = user?.assignments || [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg bg-white p-0 overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-6 pb-4 border-b border-slate-100">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Building2 className="text-blue-600" size={20} /> Acessos de {user?.name}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Gerencie em quais ambientes este usuário pode operar e com qual perfil.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                {isLoadingData ? (
                    <div className="py-12 flex justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">

                        {/* Seção 1: Vínculos Atuais */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-slate-900">Vínculos Ativos</h4>

                            {assignments.length === 0 ? (
                                <p className="text-sm text-slate-500 italic bg-slate-50 p-4 rounded-lg border border-slate-100 text-center">
                                    Nenhum acesso configurado para este usuário.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {assignments.map(a => (
                                        <div key={a.companyId} className="flex items-center justify-between bg-white border border-slate-200 px-4 py-3 rounded-lg shadow-sm hover:border-blue-200 transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-slate-900 leading-tight">{a.companyName}</span>
                                                <span className="text-xs text-blue-600 font-mono mt-0.5">{a.roleName}</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-rose-500 hover:bg-rose-50 hover:text-rose-700 h-8 w-8 p-0 shrink-0 ml-4"
                                                onClick={() => handleRemove(a.companyId)}
                                                disabled={isRemoving || isAssigning}
                                                title="Revogar Acesso"
                                            >
                                                {isRemoving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Divisória visual */}
                        <div className="h-px bg-slate-100 w-full"></div>

                        {/* Seção 2: Adicionar Novo Vínculo */}
                        <form onSubmit={handleSubmit(onSubmit)} className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 space-y-4">
                            <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 mb-1">
                                <PlusCircle size={16} className="text-slate-400" /> Adicionar Novo Vínculo
                            </h4>

                            <div className="space-y-1.5">
                                <Label className="text-slate-700 text-xs">Empresa (CNPJ) *</Label>
                                <Select value={watchCompanyId} onValueChange={(val) => setValue('companyId', val, { shouldValidate: true })}>
                                    <SelectTrigger className={`bg-white h-9 ${errors.companyId ? 'border-rose-500' : ''}`}>
                                        <SelectValue placeholder="Escolha a empresa..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {companies?.map((empresa) => (
                                            <SelectItem key={empresa.id} value={empresa.id}>
                                                {empresa.corporateName} ({empresa.cnpj})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {errors.companyId && <p className="text-[10px] text-rose-500">{errors.companyId.message}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-slate-700 text-xs">Perfil de Permissões *</Label>
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

                            <div className="pt-2 flex justify-end">
                                <Button type="submit" disabled={isAssigning || isRemoving} className="bg-slate-900 hover:bg-slate-800 text-white text-xs h-8">
                                    {isAssigning ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null} Conceder Acesso
                                </Button>
                            </div>
                        </form>

                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}