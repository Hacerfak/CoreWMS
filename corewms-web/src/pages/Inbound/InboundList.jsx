import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useGetApiInbound, useDeleteApiInboundIdCancel, useDeleteApiInboundId } from '@/api/generated/inbound/inbound';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, Loader2, ArrowDownToLine, Upload, Eye, Ban, PackageCheck, FileCode2, Play, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import ImportXmlModal from './ImportXmlModal';

export default function InboundList() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [orderToDelete, setOrderToDelete] = useState(null);

    const queryParams = {
        Search: search,
        Page: page,
        PageSize: PAGE_SIZE,
        ...(statusFilter !== 'ALL' && { Status: statusFilter })
    };

    const { data: apiResponse, isLoading, isFetching } = useGetApiInbound(queryParams);
    const inbounds = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

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
                toast.success('Registro da NF-e removido com sucesso.');
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
                setOrderToDelete(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao excluir o registro.')
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
                    <Button onClick={() => setIsImportModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                        <Upload className="mr-2 h-4 w-4" /> Importar XML
                    </Button>
                </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50 shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por Chave, Emitente ou CNPJ..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="pl-9 bg-white border-slate-200"
                        />
                    </div>
                    <div className="w-[220px]">
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                            <SelectTrigger className="bg-white">
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
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-sm z-10">
                            <TableRow>
                                <TableHead className="w-[280px]">NF-e / Emitente</TableHead>
                                <TableHead>Depositante</TableHead>
                                <TableHead>Data Emissão</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading || isFetching ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : inbounds.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">Nenhuma ordem de recebimento encontrada.</TableCell></TableRow>
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
                                                    <span className="text-xs text-slate-500 truncate max-w-[200px]" title={order.issuerName}>{order.issuerName || 'Fornecedor N/D'}</span>
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
                                            {renderStatusBadge(order)}
                                        </TableCell>
                                        <TableCell className="text-right space-x-1">
                                            {/* 1. Ordem em estado de REVISÃO (Itens pendentes) */}
                                            {order.status === 'Pending' && order.hasPendingReview && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => navigate(`/inbound/revisao/${order.id}`)}
                                                    className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                                                >
                                                    <Eye className="h-3.5 w-3.5 mr-1" /> Revisar NF-e
                                                </Button>
                                            )}

                                            {/* 2. Ordem REVISADA -> Pronta para Iniciar Recebimento nas Docas */}
                                            {order.status === 'Pending' && !order.hasPendingReview && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => navigate(`/inbound/operacao/${order.id}`)}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                                                >
                                                    <Play className="h-3.5 w-3.5 mr-1" /> Iniciar Recebimento
                                                </Button>
                                            )}

                                            {/* 3. Ordem EM RECEBIMENTO (Conferência em andamento) */}
                                            {order.status === 'Receiving' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => navigate(`/inbound/operacao/${order.id}`)}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                                                >
                                                    <PackageCheck className="h-4 w-4 mr-1" /> Conferência
                                                </Button>
                                            )}

                                            {/* 4. Ordem FINALIZADA -> Detalhes e HUs Geradas */}
                                            {order.status === 'Completed' && (
                                                <div className="inline-flex gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => navigate(`/inbound/operacao/${order.id}`)}
                                                        className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-xs"
                                                    >
                                                        <Eye className="h-3.5 w-3.5 mr-1 text-slate-500" /> Ver Detalhes
                                                    </Button>

                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        title="Ver HUs Geradas"
                                                        onClick={() => navigate(`/inbound/operacao/${order.id}/hus`)}
                                                        className="border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 shadow-xs"
                                                    >
                                                        <Layers className="h-3.5 w-3.5 mr-1" /> HUs
                                                    </Button>
                                                </div>
                                            )}

                                            {/* Botão Cancelar para ordens ativas */}
                                            {order.status !== 'Completed' && order.status !== 'Canceled' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setOrderToCancel(order)}
                                                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                                    title="Cancelar Ordem"
                                                >
                                                    <Ban className="h-4 w-4" />
                                                </Button>
                                            )}

                                            {/* Botão Excluir Registro para ordens Canceladas */}
                                            {order.status === 'Canceled' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setOrderToDelete(order)}
                                                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                                    title="Excluir Registro da NF-e"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
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

            {/* Modal de Confirmação de Cancelamento */}
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

            {/* Modal de Confirmação de Exclusão Definitiva */}
            <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Registro da NF-e?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja excluir definitivamente o registro desta nota cancelada? Esta ação não afetará os cadastros de Clientes ou Produtos existentes.
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