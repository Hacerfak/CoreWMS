import { useState } from 'react';
import { useGetApiCompanies } from '@/api/generated/companies/companies';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit, Building2 } from 'lucide-react';
import EmpresaFormModal from './EmpresaFormModal';

export default function EmpresasPage() {
    const { data: empresas = [], isLoading } = useGetApiCompanies();
    const [modalOpen, setModalOpen] = useState(false);
    const [empresaSelecionada, setEmpresaSelecionada] = useState(null);

    const handleEdit = (empresa) => {
        setEmpresaSelecionada(empresa);
        setModalOpen(true);
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Empresas</h1>
                    <p className="text-sm text-slate-500 mt-1">Gestão das empresas (Multi-Tenant) cadastradas no sistema.</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0">
                            <TableRow>
                                <TableHead>Razão Social</TableHead>
                                <TableHead>CNPJ</TableHead>
                                <TableHead>UF</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : empresas.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">Nenhuma empresa encontrada.</TableCell></TableRow>
                            ) : (
                                empresas.map((empresa) => (
                                    <TableRow key={empresa.id} className="hover:bg-slate-50/50">
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
                                                    <Building2 size={16} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-slate-900">{empresa.corporateName}</span>
                                                    <span className="text-xs text-slate-500 font-mono">{empresa.id}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-slate-600">{empresa.cnpj}</TableCell>
                                        <TableCell>{empresa.state}</TableCell>
                                        <TableCell><Badge variant="outline" className="bg-emerald-50 text-emerald-700">Ativa</Badge></TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => handleEdit(empresa)}>
                                                <Edit className="h-4 w-4 mr-1 text-slate-500" /> Editar
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
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