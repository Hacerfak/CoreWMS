import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
    Search, Loader2, ArrowUpFromLine, Upload, Eye, Ban,
    PackageCheck, Plus, Play, Box, CheckCircle2, Trash2,
    Pencil, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import ImportXmlModal from './ImportXmlModal';

export default function OutboundListPage() {
    const navigate = useNavigate();

    const [search, setSearch] = useState('');
    const [customerFilter, setCustomerFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [dateRange, setDateRange] = useState(undefined);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [orderToDelete, setOrderToDelete] = useState(null);
    const [orderToRevert, setOrderToRevert] = useState(null);

    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        customInstance({ url: '/api/customers/summary', method: 'GET' })
            .then(res => setCustomers(res || []))
            .catch(() => toast.error('Erro ao carregar depositantes.'));
    }, []);

    // Converte as datas selecionadas para o dia civil completo em formato UTC
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

    const loadOrders = async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            params.append('Page', page);
            params.append('PageSize', PAGE_SIZE);
            if (customerFilter !== 'ALL') params.append('CustomerId', customerFilter);
            if (statusFilter !== 'ALL') params.append('Status', statusFilter);
            if (search.trim()) params.append('Search', search.trim());
            if (formattedStartDate) params.append('StartDate', formattedStartDate);
            if (formattedEndDate) params.append('EndDate', formattedEndDate);

            const res = await customInstance({
                url: `/api/outbound/orders?${params.toString()}`,
                method: 'GET'
            });

            const data = res?.data || res;
            setOrders(data?.items || []);
            setTotalCount(data?.totalCount || 0);
        } catch {
            toast.error('Erro ao carregar pedidos de saída.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
    }, [page, customerFilter, statusFilter, dateRange]);

    const handleClearFilters = () => {
        setSearch('');
        setCustomerFilter('ALL');
        setStatusFilter('ALL');
        setDateRange(undefined);
        setPage(1);
    };

    const handleAllocateOrder = async (orderId) => {
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderId}/allocate`,
                method: 'POST'
            });
            toast.success(res?.message || 'Stock alocado com sucesso!');
            loadOrders();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao alocar stock.');
            setIsLoading(false);
        }
    };

    const handleRevertShipment = async () => {
        if (!orderToRevert) return;
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderToRevert.id}/revert-shipment`,
                method: 'POST'
            });
            const data = res?.data || res;
            toast.success(data?.message || 'Expedição estornada com sucesso! O stock foi restaurado.');
            setOrderToRevert(null);
            loadOrders();
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Erro ao estornar expedição.');
            setIsLoading(false);
        }
    };

    const handleCancelOrder = async () => {
        if (!orderToCancel || cancelReason.trim().length < 15) {
            return toast.warning('O motivo do cancelamento deve conter no mínimo 15 caracteres.');
        }
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderToCancel.id}/cancel`,
                method: 'POST',
                data: { reason: cancelReason.trim() }
            });
            const data = res?.data || res;
            toast.success(data?.message || 'Pedido de saída cancelado com sucesso.');
            setOrderToCancel(null);
            setCancelReason('');
            loadOrders();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao cancelar pedido.');
            setIsLoading(false);
        }
    };

    const handleDeleteOrder = async () => {
        if (!orderToDelete) return;
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderToDelete.id}`,
                method: 'DELETE'
            });
            const data = res?.data || res;
            toast.success(data?.message || 'Ordem de saída excluída permanentemente.');
            setOrderToDelete(null);
            loadOrders();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir ordem de saída.');
            setIsLoading(false);
        }
    };

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const renderStatusBadge = (status) => {
        switch (status) {
            case 'Pending':
                return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-medium">Aguardando Alocação</Badge>;
            case 'Allocated':
                return <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-medium">Pronto p/ Separar</Badge>;
            case 'Picking':
                return <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-medium">Em Separação</Badge>;
            case 'Packing':
                return <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-medium">Aguardando Packing</Badge>;
            case 'Checking':
                return <Badge className="bg-teal-100 text-teal-800 border-teal-200 font-medium">Em Conferência</Badge>;
            case 'ReadyToShip':
                return <Badge className="bg-orange-100 text-orange-800 border-orange-200 font-medium">Pronto p/ Expedir</Badge>;
            case 'Shipped':
                return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-medium">Expedido</Badge>;
            case 'Canceled':
                return <Badge className="bg-rose-100 text-rose-800 border-rose-200 font-medium">Cancelado</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const hasActiveFilters = Boolean(search || customerFilter !== 'ALL' || statusFilter !== 'ALL' || dateRange);

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Outbound (Expedição)</h1>
                    <p className="text-sm text-slate-500 mt-1">Gestão de ordens de saída, alocação de stock, separação, conferência e expedição.</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={() => navigate('/outbound/novo')}
                        variant="outline"
                        className="border-orange-200 text-orange-800 bg-orange-50 hover:bg-orange-100 font-medium"
                    >
                        <Plus className="mr-2 h-4 w-4 text-orange-600" /> Nova Ordem Manual
                    </Button>
                    <Button
                        onClick={() => setIsImportModalOpen(true)}
                        className="bg-orange-600 hover:bg-orange-700 text-white shadow-xs font-bold"
                    >
                        <Upload className="mr-2 h-4 w-4" /> Importar XML NF-e
                    </Button>
                </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* BARRA DE FILTROS COM DATE RANGE PICKER INTEGRADO */}
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/50 shrink-0">
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por Pedido, Cliente ou Destinatário..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            onKeyDown={(e) => e.key === 'Enter' && loadOrders()}
                            className="pl-9 bg-white border-slate-200 text-xs h-9"
                        />
                    </div>

                    <div className="w-[190px]">
                        <Select value={customerFilter} onValueChange={(v) => { setCustomerFilter(v); setPage(1); }}>
                            <SelectTrigger className="bg-white text-xs h-9 border-slate-200">
                                <SelectValue placeholder="Depositante" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Depositantes</SelectItem>
                                {customers.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-[170px]">
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                            <SelectTrigger className="bg-white text-xs h-9 border-slate-200">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Status</SelectItem>
                                <SelectItem value="Pending">Aguardando Alocação</SelectItem>
                                <SelectItem value="Allocated">Alocado</SelectItem>
                                <SelectItem value="Picking">Em Separação</SelectItem>
                                <SelectItem value="Packing">Aguardando Packing</SelectItem>
                                <SelectItem value="Checking">Em Conferência</SelectItem>
                                <SelectItem value="ReadyToShip">Pronto p/ Expedir</SelectItem>
                                <SelectItem value="Shipped">Expedido</SelectItem>
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
                                <TableHead className="w-[220px]">Pedido / Emissão</TableHead>
                                <TableHead>Depositante</TableHead>
                                <TableHead>Destinatário Final</TableHead>
                                <TableHead>Solicitante</TableHead>
                                <TableHead>Cidade / UF</TableHead>
                                <TableHead className="text-center">Itens</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={8} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-orange-600 mx-auto" /></TableCell></TableRow>
                            ) : orders.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="h-28 text-center text-slate-500">Nenhum pedido de saída encontrado.</TableCell></TableRow>
                            ) : orders.map((order) => {
                                const canRevert = order.status === 'Shipped' && !order.hasActiveFiscalDocuments;
                                const canCancel = order.status !== 'Shipped' && order.status !== 'Canceled' && !order.hasActiveFiscalDocuments;
                                const canDelete = order.status === 'Canceled' && !order.hasFiscalDocuments;

                                return (
                                    <TableRow key={order.id} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                                                    <ArrowUpFromLine size={16} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900 font-mono">{order.orderNumber}</span>
                                                    <span className="text-xs text-slate-400">
                                                        {order.issueDate ? new Date(order.issueDate).toLocaleDateString('pt-BR') : '-'}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm font-medium text-slate-800">{order.customerName}</span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm font-semibold text-slate-900 truncate max-w-[180px] block" title={order.destinationName}>
                                                {order.destinationName}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-slate-600 truncate max-w-[140px] block" title={order.requestedBy || 'Sistema'}>
                                                {order.requestedBy || 'Sistema'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-600 font-mono">
                                            {order.destinationCity} / {order.destinationState}
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-xs font-bold text-slate-700">
                                            {order.itemsCount}
                                        </TableCell>
                                        <TableCell>
                                            {renderStatusBadge(order.status)}
                                        </TableCell>
                                        <TableCell className="text-right space-x-1">
                                            {/* Edição do cabeçalho */}
                                            {['Pending', 'Allocating', 'Allocated'].includes(order.status) && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => navigate(`/outbound/editar/${order.id}`)}
                                                    className="border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs"
                                                    title="Editar Ordem de Saída"
                                                >
                                                    <Pencil className="h-3.5 w-3.5 text-slate-600" />
                                                </Button>
                                            )}

                                            {order.status === 'Pending' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleAllocateOrder(order.id)}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-2xs font-medium"
                                                >
                                                    <Play className="h-3.5 w-3.5 mr-1" /> Alocar
                                                </Button>
                                            )}

                                            {(order.status === 'Allocated' || order.status === 'Picking') && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => navigate(`/outbound/picking/${order.id}`)}
                                                    className="bg-purple-600 hover:bg-purple-700 text-white shadow-2xs font-medium"
                                                >
                                                    <Box className="h-3.5 w-3.5 mr-1" /> Separar
                                                </Button>
                                            )}

                                            {order.status === 'Packing' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => navigate(`/outbound/packing/${order.id}`)}
                                                    className="bg-orange-600 hover:bg-orange-700 text-white shadow-2xs font-medium"
                                                >
                                                    <PackageCheck className="h-3.5 w-3.5 mr-1" /> Packing
                                                </Button>
                                            )}

                                            {/* Conferência:
                                                - Sempre disponível quando a ordem atinge 'Checking'
                                                - Durante 'Picking', disponível apenas se for 100% volumes fechados (sem fracionamento) */}
                                            {(order.status === 'Checking' || (order.status === 'Picking' && !order.hasFractional)) && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => navigate(`/outbound/conferencia/${order.id}`)}
                                                    className="bg-teal-600 hover:bg-teal-700 text-white shadow-2xs font-medium"
                                                    title="Conferência de Saída"
                                                >
                                                    <PackageCheck className="h-3.5 w-3.5 mr-1" /> Conferir
                                                </Button>
                                            )}

                                            {order.status === 'ReadyToShip' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => navigate(`/outbound/revisao-fiscal/${order.id}`)}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs font-medium"
                                                >
                                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Expedir
                                                </Button>
                                            )}

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => navigate(`/outbound/detalhes/${order.id}`)}
                                                className="border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs"
                                                title="Ver Detalhes"
                                            >
                                                <Eye className="h-3.5 w-3.5 text-slate-500" />
                                            </Button>

                                            {canRevert && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setOrderToRevert(order)}
                                                    className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                                    title="Estornar Expedição (Restaurar stock e Kardex)"
                                                >
                                                    <RotateCcw className="h-4 w-4" />
                                                </Button>
                                            )}

                                            {canCancel && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setOrderToCancel(order)}
                                                    className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                                    title="Cancelar Pedido de Saída"
                                                >
                                                    <Ban className="h-4 w-4" />
                                                </Button>
                                            )}

                                            {canDelete && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setOrderToDelete(order)}
                                                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                                    title="Excluir Ordem Cancelada"
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
                            A mostrar {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} pedidos
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                        </div>
                    </div>
                )}
            </div>

            <ImportXmlModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />

            {/* DIÁLOGO ESTORNO DE EXPEDIÇÃO */}
            <AlertDialog open={!!orderToRevert} onOpenChange={(open) => !open && setOrderToRevert(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Estornar Expedição do Pedido?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja estornar a expedição do pedido <strong className="text-slate-800">#{orderToRevert?.orderNumber}</strong>?
                            <br /><br />
                            Esta ação irá devolver os saldos consumidos para as Unidades Logísticas (HUs), registar a compensação no Kardex e retornar a ordem para <strong>Pronto para Expedir (ReadyToShip)</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRevertShipment} disabled={isLoading} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Estorno'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* DIÁLOGO CANCELAMENTO COM MOTIVO OBRIGATÓRIO */}
            <AlertDialog
                open={!!orderToCancel}
                onOpenChange={(open) => {
                    if (!open && !isLoading) {
                        setOrderToCancel(null);
                        setCancelReason('');
                    }
                }}
            >
                <AlertDialogContent className="bg-white sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-slate-900">
                            <Ban className="h-5 w-5 text-amber-600" /> Cancelar Pedido de Saída?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-500 space-y-2">
                            <span>
                                Deseja cancelar o pedido <strong className="text-slate-800 font-mono">#{orderToCancel?.orderNumber}</strong>? Todas as reservas de estoque e alocações de coletor serão canceladas.
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-1.5 py-2">
                        <label className="text-xs font-bold text-slate-700 uppercase">
                            Motivo do Cancelamento <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                            rows={3}
                            placeholder="Ex: Cancelado a pedido do cliente via chamado #1234 devido a duplicidade..."
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            disabled={isLoading}
                            className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-sans"
                        />
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                            <span>Mínimo 15 caracteres</span>
                            <span className={cancelReason.trim().length >= 15 ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                                {cancelReason.trim().length}/15
                            </span>
                        </div>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel
                            disabled={isLoading}
                            onClick={() => {
                                setOrderToCancel(null);
                                setCancelReason('');
                            }}
                        >
                            Voltar
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleCancelOrder}
                            disabled={isLoading || cancelReason.trim().length < 15}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                            Confirmar Cancelamento
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* DIÁLOGO EXCLUSÃO */}
            <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Ordem de Saída?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem a certeza de que deseja excluir definitivamente a ordem <strong className="text-slate-800">#{orderToDelete?.orderNumber}</strong>? Esta ação removerá o registo do sistema de forma permanente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteOrder} disabled={isLoading} className="bg-rose-600 hover:bg-rose-700 text-white font-bold">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir Definitivamente'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}