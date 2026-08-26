import { useState } from 'react';
import { usePostApiUsersUserIdCompanies } from '@/api/generated/users/users';
import { useGetApiCompanies } from '@/api/generated/companies/companies';
import { useGetApiRoles } from '@/api/generated/roles/roles';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function VincularEmpresaModal({ user, open, onOpenChange }) {
    const [selectedCompanyId, setSelectedCompanyId] = useState('');
    const [selectedRoleId, setSelectedRoleId] = useState('');

    // Busca lista de empresas e perfis
    const { data: companies, isLoading: loadingCompanies } = useGetApiCompanies();
    const { data: roles, isLoading: loadingRoles } = useGetApiRoles();

    // Mutação para atribuir usuário à empresa
    const { mutate: assignUser, isPending } = usePostApiUsersUserIdCompanies({
        mutation: {
            onSuccess: () => {
                toast.success(`Usuário vinculado à empresa com sucesso!`);
                onOpenChange(false);
            },
            onError: (err) => {
                toast.error(err.response?.data?.message || 'Erro ao vincular empresa ao usuário.');
            }
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!selectedCompanyId || !selectedRoleId) {
            return toast.warning('Selecione a empresa e o perfil.');
        }

        assignUser({
            userId: user.id,
            data: {
                companyId: selectedCompanyId,
                roleId: selectedRoleId
            }
        });
    };

    const isLoadingData = loadingCompanies || loadingRoles;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <Building2 className="text-blue-600" size={20} /> Vincular Empresa & Perfil
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Conceda acesso a <strong className="text-slate-800">{user?.name}</strong> selecionando o ambiente e o perfil de permissões.
                    </DialogDescription>
                </DialogHeader>

                {isLoadingData ? (
                    <div className="py-8 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-slate-700">Selecione a Empresa (CNPJ) *</Label>
                            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                                <SelectTrigger className="bg-slate-50">
                                    <SelectValue placeholder="Escolha a empresa" />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies?.map((empresa) => (
                                        <SelectItem key={empresa.id} value={empresa.id}>
                                            {empresa.corporateName} ({empresa.cnpj})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-700">Selecione o Perfil de Permissões *</Label>
                            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                                <SelectTrigger className="bg-slate-50">
                                    <SelectValue placeholder="Escolha o perfil" />
                                </SelectTrigger>
                                <SelectContent>
                                    {roles?.map((role) => (
                                        <SelectItem key={role.id} value={role.id}>
                                            {role.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isPending} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[120px]">
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Vínculo'}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}