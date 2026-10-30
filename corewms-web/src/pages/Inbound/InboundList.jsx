import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useGetApiInbound, useDeleteApiInboundIdCancel, useDeleteApiInboundId } from '@/api/generated/inbound/inbound';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
    Search, Loader2, ArrowDownToLine, Upload, Eye, Ban,
    PackageCheck, FileCode2, Play, Trash2, Layers, CheckCircle2,
    ShieldAlert, AlertTriangle, FileSearch, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import ImportXmlModal from './ImportXmlModal';

export default function InboundList() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [dateRange, setDateRange] = useState(undefined);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [orderToDelete, setOrderToDelete] = useState(null);

    // Converte a seleção de datas para o dia civil completo em formato UTC
    const formattedStartDate = useMemo(() => {
        if (!dateRange?.from) return undefined;
        const fromDate = new Date(dateRange.from);
        fromDate.setHours(0, 0, 0, 0);
        return fromDate.toISOString();
    }, [dateRange?.from]);

    const formattedEndDate = useMemo(() => {
        if (!dateRange?.from) return undefined;
        const toDate = new Date(dateRange.to || dateRange.from);
        toDate.setHours(23, 59, 59, 999);
        return toDate.toISOString();
    }, [dateRange]);

    const queryParams = {
        Search: search.trim() || undefined,
        Page: page,
        PageSize: PAGE_SIZE,
        ...(statusFilter !== 'ALL' && { Status: statusFilter }),
        ...(formattedStartDate && { StartDate: formattedStartDate }),
        ...(formattedEndDate && { EndDate: formattedEndDate })
    };

    const { data: apiResponse, isLoading, isFetching } = useGetApiInbound(queryParams);
    const inbounds = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const handleClearFilters = () => {
        setSearch('');
        setStatusFilter('ALL');
        setDateRange(undefined);
        setPage(1);
    };

    // Cancelar Ordem
    const { mutate: cancelOrder, isPending: isCanceling } = useDeleteApiInboundIdCancel({
        mutation: {
            onSuccess: () => {
                toast.success('Ordem de Recebimento cancelada.');
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
                setOrderToCancel(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao cancelar a ordem.')
        }
    });

    // Excluir Ordem Cancelada
    const { mutate: deleteOrder, isPending: isDeleting } = useDeleteApiInboundId({
        mutation: {
            onSuccess: () => {
                toast.success('Registo da NF-e removido com sucesso.');
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
                setOrderToDelete(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao excluir o registo.')
        }
    });

    const renderStatusBadge = (order) => {
        if (order.status === 'Canceled') {
            return <Badge className="bg-rose-100 text-rose-800 border-rose-200 font-medium">Cancelado</Badge>;
        }
        if (order.status === 'Completed') {
            return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-medium">Finalizado</Badge>;
        }
        if (order.status === 'Receiving') {
            return <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-medium">Em Recebimento</Badge>;
        }
        if (order.hasPendingReview) {
            return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-medium">Aguardando Revisão</Badge>;
        }
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-medium">Aguardando Recebimento</Badge>;
    };

    const renderSefazManifestBadge = (order) => {
        const type = order.lastSefazManifestType;
        switch (type) {
            case 210200:
                return <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 font-mono text-[10px] gap-1"><CheckCircle2 size={11} /> Confirmada (210200)</Badge>;
            case 210210:
                return <Badge className="bg-blue-50 text-blue-800 border-blue-300 font-mono text-[10px] gap-1"><FileSearch size={11} /> Ciência (210210)</Badge>;
            case 210220:
                return <Badge className="bg-rose-50 text-rose-800 border-rose-300 font-mono text-[10px] gap-1"><ShieldAlert size={11} /> Desconhecida (210220)</Badge>;
            case 210240:
                return <Badge className="bg-amber-50 text-amber-900 border-amber-300 font-mono text-[10px] gap-1"><AlertTriangle size={11} /> Não Realizada (210240)</Badge>;
            default:
                return <span className="text-xs text-slate-400 italic">Sem Manifestação</span>;
        }
    };

    const hasActiveFilters = Boolean(search || statusFilter !== 'ALL' || dateRange);

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inbound (Recebimento)</h1>
                    <p className="text-sm text-slate-500 mt-1">Gestão de entradas, conferência de XML e acompanhamento de descargas.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => navigate('/inbound/revisao')} variant="outline" className="border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100">
                        <FileCode2 className="mr-2 h-4 w-4 text-amber-600" /> Revisar Pendências
                    </Button>
                    <Button onClick={() => setIsImportModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
                        <Upload className="mr-2 h-4 w-4" /> Importar NF-e / SEFAZ
                    </Button>
                </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* BARRA DE FILTROS COM DATE RANGE PICKER INTEGRADO */}
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/50 shrink-0">
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por Chave, Emitente ou CNPJ..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="pl-9 bg-white border-slate-200 h-9 text-xs"
                        />
                    </div>

                    <div className="w-[190px]">
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                            <SelectTrigger className="bg-white h-9 text-xs border-slate-200">
                                <SelectValue placeholder="Filtrar por Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Status</SelectItem>
                                <SelectItem value="Pending">Aguardando Recebimento</SelectItem>
                                <SelectItem value="Receiving">Em Recebimento</SelectItem>
                                <SelectItem value="Completed">Finalizado</SelectItem>
                                <SelectItem value="Canceled">Cancelado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="min-w-[250px]">
                        <DateRangePicker
                            date={dateRange}
                            setDate={(range) => { setDateRange(range); setPage(1); }}
                            className="w-full"
                        />
                    </div>

                    {hasActiveFilters && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClearFilters}
                            title="Limpar Filtros"
                            className="h-9 px-3 bg-white text-slate-500 hover:text-slate-700 border-slate-200 text-xs shrink-0"
                        >
                            <RotateCcw size={14} className="mr-1.5" /> Limpar
                        </Button>
                    )}
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-xs z-10">
                            <TableRow>
                                <TableHead className="w-[260px]">NF-e / Emitente</TableHead>
                                <TableHead>Depositante</TableHead>
                                <TableHead>Data Emissão</TableHead>
                                <TableHead>Manifestação SEFAZ</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading || isFetching ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : inbounds.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">Nenhuma ordem de recebimento encontrada.</TableCell></TableRow>
                            ) : inbounds.map((order) => {
                                const documentNumber = order.accessKey && order.accessKey.length >= 34
                                    ? parseInt(order.accessKey.substring(25, 34), 10)
                                    : 'N/A';

                                return (
                                    <TableRow key={order.id} className="hover:bg-slate-50/50">
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                                    <ArrowDownToLine size={16} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900 font-mono">NF {documentNumber}</span>
                                                    <span className="text-xs text-slate-500 truncate max-w-[180px]" title={order.issuerName}>{order.issuerName || 'Fornecedor N/D'}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-800">{order.customerName || 'Cadastro Automático'}</span>
                                                <span className="text-[10px] font-mono text-slate-400">CNPJ: {order.issuerCnpj}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-600">
                                            {order.issueDate ? new Date(order.issueDate).toLocaleDateString('pt-BR') : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {renderSefazManifestBadge(order)}
                                        </TableCell>
                                        <TableCell>
                                            {renderStatusBadge(order)}
                                        </TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <div className="inline-flex items-center gap-1">
                                                {/* Botão Ver Detalhes - Disponível em qualquer status ativo */}
                                                {order.status !== 'Canceled' && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => navigate(`/inbound/operacao/${order.id}`)}
                                                        className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-xs h-8 text-xs"
                                                    >
                                                        <Eye className="h-3.5 w-3.5 mr-1 text-slate-500" /> Ver Detalhes
                                                    </Button>
                                                )}

                                                {/* 1. Etapa de Revisão de Itens / Pré-cadastro de SKU */}
                                                {order.status === 'Pending' && order.hasPendingReview && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => navigate(`/inbound/revisao/${order.id}`)}
                                                        className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs h-8 text-xs"
                                                    >
                                                        <FileCode2 className="h-3.5 w-3.5 mr-1" /> Revisar NF-e
                                                    </Button>
                                                )}

                                                {/* 2. Aguardando Início do Recebimento */}
                                                {order.status === 'Pending' && !order.hasPendingReview && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => navigate(`/inbound/operacao/${order.id}`)}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs h-8 text-xs"
                                                    >
                                                        <Play className="h-3.5 w-3.5 mr-1" /> Iniciar Recebimento
                                                    </Button>
                                                )}

                                                {/* 3. Recebimento em Andamento */}
                                                {order.status === 'Receiving' && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => navigate(`/inbound/operacao/${order.id}`)}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs h-8 text-xs"
                                                    >
                                                        <PackageCheck className="h-4 w-4 mr-1" /> Conferência
                                                    </Button>
                                                )}

                                                {/* 4. Finalizado: Acesso direto às HUs geradas */}
                                                {order.status === 'Completed' && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        title="Ver HUs Geradas"
                                                        onClick={() => navigate(`/inbound/operacao/${order.id}/hus`)}
                                                        className="border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 shadow-xs h-8 text-xs"
                                                    >
                                                        <Layers className="h-3.5 w-3.5 mr-1" /> HUs
                                                    </Button>
                                                )}

                                                {/* Cancelamento */}
                                                {order.status !== 'Completed' && order.status !== 'Canceled' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setOrderToCancel(order)}
                                                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 h-8 w-8 p-0"
                                                        title="Cancelar Ordem"
                                                    >
                                                        <Ban className="h-4 w-4" />
                                                    </Button>
                                                )}

                                                {/* Exclusão de Canceladas */}
                                                {order.status === 'Canceled' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setOrderToDelete(order)}
                                                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 h-8 w-8 p-0"
                                                        title="Excluir Registro da NF-e"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                {totalCount > 0 && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                        <span className="text-xs text-slate-500 font-medium">
                            Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} ordens
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                        </div>
                    </div>
                )}
            </div>

            <ImportXmlModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />

            {/* Modal Cancelar */}
            <AlertDialog open={!!orderToCancel} onOpenChange={(open) => !open && setOrderToCancel(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar Ordem de Recebimento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja cancelar a entrada desta NF-e? Esta ação é irreversível.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isCanceling}>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => cancelOrder({ id: orderToCancel.id })} disabled={isCanceling} className="bg-rose-600 hover:bg-rose-700 text-white">
                            {isCanceling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Cancelamento'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Modal Excluir */}
            <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Registo da NF-e?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja excluir definitivamente o registo desta nota cancelada? Esta ação não afetará os cadastros de Clientes ou Produtos existentes.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteOrder({ id: orderToDelete.id })} disabled={isDeleting} className="bg-rose-600 hover:bg-rose-700 text-white">
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Exclusão'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}