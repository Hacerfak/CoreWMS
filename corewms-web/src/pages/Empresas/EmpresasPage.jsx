import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiCompanies } from '@/api/generated/companies/companies';
import { customInstance } from '@/api/orval-mutator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit, Building2, ShieldAlert, ShieldCheck, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import EmpresaFormModal from './EmpresaFormModal';

export default function EmpresasPage() {
    const queryClient = useQueryClient();
    const { data: empresasData, isLoading } = useGetApiCompanies();
    const empresas = Array.isArray(empresasData) ? empresasData : (empresasData?.items || []);

    const [modalOpen, setModalOpen] = useState(false);
    const [empresaSelecionada, setEmpresaSelecionada] = useState(null);

    const handleEdit = (empresa) => {
        setEmpresaSelecionada(empresa);
        setModalOpen(true);
    };

    const handleToggleActive = async (id) => {
        try {
            const res = await customInstance({
                url: `/api/companies/${id}/toggle-active`,
                method: 'PATCH'
            });
            toast.success(res?.message || 'Status alterado!');
            queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao alterar status da empresa.');
        }
    };

    const handleDelete = async (id) => {
        try {
            await customInstance({
                url: `/api/companies/${id}`,
                method: 'DELETE'
            });
            toast.success('Empresa excluída com sucesso.');
            queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir empresa.');
        }
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Empresas & Filiais</h1>
                    <p className="text-sm text-slate-500 mt-1">Gestão das empresas e filiais operacionais</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0">
                            <TableRow>
                                <TableHead>Razão Social</TableHead>
                                <TableHead>CNPJ</TableHead>
                                <TableHead>Ambiente SEFAZ</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Validade Certificado</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : empresas.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">Nenhuma empresa encontrada.</TableCell></TableRow>
                            ) : (
                                empresas.map((empresa) => {
                                    const isProd = empresa.environment === 1;
                                    const hasCert = Boolean(empresa.certificateExpiration);
                                    const isCertExpired = hasCert && new Date(empresa.certificateExpiration) < new Date();

                                    return (
                                        <TableRow key={empresa.id} className="hover:bg-slate-50/50">
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                        <Building2 size={18} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-900 text-xs">{empresa.corporateName}</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-900 text-xs">{empresa.cnpj}</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`text-[10px] px-2 py-0.5 border ${isProd ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                                                    }`}>
                                                    {isProd ? '🟢 Produção' : '🟠 Homologação'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`text-[10px] px-2 py-0.5 border ${empresa.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                                                    }`}>
                                                    {empresa.isActive ? 'Ativa' : 'Inativa'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs font-mono">
                                                {!hasCert ? (
                                                    <span className="text-rose-500 flex items-center gap-1 font-semibold">
                                                        <ShieldAlert size={14} /> Ausente
                                                    </span>
                                                ) : isCertExpired ? (
                                                    <span className="text-rose-600 flex items-center gap-1 font-bold">
                                                        <ShieldAlert size={14} /> Expirado
                                                    </span>
                                                ) : (
                                                    <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                                                        <ShieldCheck size={14} /> Até {new Date(empresa.certificateExpiration).toLocaleDateString('pt-BR')}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(empresa)}>
                                                        <Edit className="h-4 w-4 mr-1 text-slate-500" /> Editar
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleToggleActive(empresa.id)}
                                                        className={empresa.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}
                                                    >
                                                        <Power className="h-4 w-4 mr-1" /> {empresa.isActive ? 'Inativar' : 'Ativar'}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(empresa.id)}
                                                        className="text-rose-500 hover:bg-rose-50 p-1.5"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <EmpresaFormModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                empresaToEdit={empresaSelecionada}
            />
        </div>
    );
}