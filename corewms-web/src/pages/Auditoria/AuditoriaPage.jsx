import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useGetApiAuditLogs } from '@/api/generated/audit/audit';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollText, Search, Loader2, FilterX, Eye, ChevronLeft, ChevronRight } from 'lucide-react';

const filterSchema = z.object({
    entityName: z.string().optional(),
    userId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

// Helper para montar data YYYY-MM-DD usando o fuso local do navegador
const getTodayLocal = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function AuditoriaPage() {
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const todayStr = getTodayLocal();

    // Já inicia o estado de filtros aplicados forçando os limites de hoje para a API buscar logo no início
    const [appliedFilters, setAppliedFilters] = useState({
        StartDate: new Date(`${todayStr}T00:00:00`).toISOString(),
        EndDate: new Date(`${todayStr}T23:59:59.999`).toISOString()
    });

    const [selectedLog, setSelectedLog] = useState(null);

    // React Hook Form já inicia visualmente com a data de hoje preenchida
    const { register, handleSubmit, reset } = useForm({
        resolver: zodResolver(filterSchema),
        defaultValues: {
            entityName: '',
            userId: '',
            startDate: todayStr,
            endDate: todayStr
        }
    });

    const { data: apiResponse, isLoading, isFetching } = useGetApiAuditLogs({
        ...appliedFilters,
        Page: page,
        PageSize: pageSize
    });

    const { items: logs = [], totalCount = 0 } = apiResponse || {};
    const totalPages = Math.ceil(totalCount / pageSize);

    const onSubmitFilters = (data) => {
        setPage(1);

        const startDateString = data.startDate ? new Date(`${data.startDate}T00:00:00`).toISOString() : undefined;
        const endDateString = data.endDate ? new Date(`${data.endDate}T23:59:59.999`).toISOString() : undefined;

        setAppliedFilters({
            EntityName: data.entityName,
            UserId: data.userId,
            StartDate: startDateString,
            EndDate: endDateString,
        });
    };

    const handleClearFilters = () => {
        const resetData = { entityName: '', userId: '', startDate: '', endDate: '' };
        reset(resetData);
        setPage(1);
        setAppliedFilters({});
    };

    const getActionBadge = (action) => {
        switch (action) {
            case 'Create': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Criação</Badge>;
            case 'Update': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Edição</Badge>;
            case 'Delete': return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Exclusão</Badge>;
            default: return <Badge variant="outline">{action}</Badge>;
        }
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Auditoria do Sistema</h1>
                    <p className="text-sm text-slate-500 mt-1">Rastreabilidade completa de ações e alterações de registros.</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                {/* BARRA DE FILTROS COM RHF */}
                <form onSubmit={handleSubmit(onSubmitFilters)} className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-end gap-4">
                    <div className="space-y-1.5 flex-1 min-w-[200px]">
                        <label className="text-xs font-semibold text-slate-500">Tabela/Entidade</label>
                        <Input {...register('entityName')} placeholder="Ex: Customer" className="bg-white" />
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-[200px]">
                        <label className="text-xs font-semibold text-slate-500">ID do Usuário</label>
                        <Input {...register('userId')} placeholder="GUID do usuário..." className="bg-white" />
                    </div>
                    <div className="space-y-1.5 w-[150px]">
                        <label className="text-xs font-semibold text-slate-500">Data Inicial</label>
                        <Input type="date" {...register('startDate')} className="bg-white" />
                    </div>
                    <div className="space-y-1.5 w-[150px]">
                        <label className="text-xs font-semibold text-slate-500">Data Final</label>
                        <Input type="date" {...register('endDate')} className="bg-white" />
                    </div>

                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={handleClearFilters} className="bg-white" title="Limpar Filtros">
                            <FilterX className="h-4 w-4" />
                        </Button>
                        <Button type="submit" disabled={isFetching} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[120px]">
                            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="mr-2 h-4 w-4" /> Buscar</>}
                        </Button>
                    </div>
                </form>

                {/* TABELA DE LOGS */}
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-sm z-10">
                            <TableRow>
                                <TableHead>Data/Hora</TableHead>
                                <TableHead>Usuário</TableHead>
                                <TableHead>Ação</TableHead>
                                <TableHead>Entidade</TableHead>
                                <TableHead>Registro Afetado (ID)</TableHead>
                                <TableHead className="text-right">Detalhes</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">Nenhum registro de auditoria encontrado.</TableCell></TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id} className="hover:bg-slate-50/50">
                                        <TableCell className="text-sm font-mono text-slate-600">
                                            {new Date(log.timestamp).toLocaleString('pt-BR')}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-900">{log.userName || 'Sistema'}</span>
                                                <span className="text-[10px] font-mono text-slate-400" title="ID">{log.userId}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{getActionBadge(log.action)}</TableCell>
                                        <TableCell className="font-medium text-slate-900">{log.entityName}</TableCell>
                                        <TableCell className="text-sm font-mono text-slate-500">{log.entityId}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)} className="text-blue-600 hover:bg-blue-50">
                                                <Eye className="h-4 w-4 mr-1" /> Ver Alterações
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* PAGINAÇÃO */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <span className="text-sm text-slate-500">
                        Total: <strong className="text-slate-900">{totalCount}</strong> registros
                    </span>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isFetching}>
                            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                        </Button>
                        <span className="text-sm font-medium text-slate-700 px-4">
                            Página {page} de {totalPages || 1}
                        </span>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isFetching}>
                            Próxima <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* MODAL DE DETALHES (JSON) */}
            <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
                <DialogContent className="sm:max-w-3xl bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <ScrollText className="text-blue-600" size={20} /> Detalhes do Registro
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Propriedades afetadas na entidade <strong className="text-slate-800">{selectedLog?.entityName}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-slate-900 rounded-lg p-4 mt-2 overflow-auto max-h-[500px]">
                        <pre className="text-emerald-400 font-mono text-sm leading-relaxed">
                            {JSON.stringify(selectedLog?.changes || {}, null, 2)}
                        </pre>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}