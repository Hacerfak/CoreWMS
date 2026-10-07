import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, Loader2, ArrowUpFromLine, Upload, Eye, Ban, PackageCheck, Plus, Play, Box, CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ImportXmlModal from './ImportXmlModal';

export default function OutboundListPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState('');
    const [customerFilter, setCustomerFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [orderToDelete, setOrderToDelete] = useState(null);

    const [orders, setOrders] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        customInstance({ url: '/api/customers/summary', method: 'GET' })
            .then(res => setCustomers(res || []))
            .catch(() => toast.error('Erro ao carregar depositantes.'));
    }, []);

    const loadOrders = async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            params.append('Page', page);
            params.append('PageSize', PAGE_SIZE);
            if (customerFilter !== 'ALL') params.append('CustomerId', customerFilter);
            if (statusFilter !== 'ALL') params.append('Status', statusFilter);
            if (search.trim()) params.append('Search', search.trim());

            const res = await customInstance({
                url: `/api/outbound/orders?${params.toString()}`,
                method: 'GET'
            });

            setOrders(res?.items || []);
            setTotalCount(res?.totalCount || 0);
        } catch {
            toast.error('Erro ao carregar pedidos de saída.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
    }, [page, customerFilter, statusFilter]);

    const handleAllocateOrder = async (orderId) => {
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderId}/allocate`,
                method: 'POST'
            });
            toast.success(res?.message || 'Estoque alocado com sucesso!');
            loadOrders();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao alocar estoque.');
            setIsLoading(false);
        }
    };

    const handleShipOrder = async (orderId) => {
        try {
            setIsLoading(true);
            await customInstance({
                url: `/api/outbound/orders/${orderId}/ship`,
                method: 'POST'
            });
            toast.success('Pedido expedido com sucesso! Saldo baixado do estoque.');
            loadOrders();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao expedir pedido.');
            setIsLoading(false);
        }
    };

    const handleCancelOrder = async () => {
        if (!orderToCancel) return;
        try {
            setIsLoading(true);
            await customInstance({
                url: `/api/outbound/orders/${orderToCancel.id}/cancel`,
                method: 'DELETE'
            });
            toast.success('Pedido de saída cancelado com sucesso.');
            setOrderToCancel(null);
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
            await customInstance({
                url: `/api/outbound/orders/${orderToDelete.id}`,
                method: 'DELETE'
            });
            toast.success('Ordem de saída excluída permanentemente.');
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

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Outbound (Expedição)</h1>
                    <p className="text-sm text-slate-500 mt-1">Gestão de ordens de saída, alocação de estoque, separação e expedição.</p>
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
                <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50 shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por Pedido, Cliente ou Destinatário..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            onKeyDown={(e) => e.key === 'Enter' && loadOrders()}
                            className="pl-9 bg-white border-slate-200 text-xs"
                        />
                    </div>

                    <div className="w-[200px]">
                        <Select value={customerFilter} onValueChange={(v) => { setCustomerFilter(v); setPage(1); }}>
                            <SelectTrigger className="bg-white text-xs">
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

                    <div className="w-[180px]">
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                            <SelectTrigger className="bg-white text-xs">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Status</SelectItem>
                                <SelectItem value="Pending">Aguardando Alocação</SelectItem>
                                <SelectItem value="Allocated">Alocado</SelectItem>
                                <SelectItem value="Picking">Em Separação</SelectItem>
                                <SelectItem value="Packing">Aguardando Packing</SelectItem>
                                <SelectItem value="ReadyToShip">Pronto p/ Expedir</SelectItem>
                                <SelectItem value="Shipped">Expedido</SelectItem>
                                <SelectItem value="Canceled">Cancelado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-xs z-10">
                            <TableRow>
                                <TableHead className="w-[220px]">Pedido / Emissão</TableHead>
                                <TableHead>Depositante</TableHead>
                                <TableHead>Destinatário Final</TableHead>
                                <TableHead>Cidade / UF</TableHead>
                                <TableHead className="text-center">Itens</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-orange-600 mx-auto" /></TableCell></TableRow>
                            ) : orders.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="h-28 text-center text-slate-500">Nenhum pedido de saída encontrado.</TableCell></TableRow>
                            ) : orders.map((order) => (
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
                                        {/* Ação 1: Alocar Estoque quando o pedido entra zerado/pendente */}
                                        {order.status === 'Pending' && (
                                            <Button
                                                size="sm"
                                                onClick={() => handleAllocateOrder(order.id)}
                                                className="bg-blue-600 hover:bg-blue-700 text-white shadow-2xs font-medium"
                                            >
                                                <Play className="h-3.5 w-3.5 mr-1" /> Alocar
                                            </Button>
                                        )}

                                        {/* Ação 2: Bipagem/Coletor de Separação */}
                                        {(order.status === 'Allocated' || order.status === 'Picking') && (
                                            <Button
                                                size="sm"
                                                onClick={() => navigate(`/outbound/picking/${order.id}`)}
                                                className="bg-purple-600 hover:bg-purple-700 text-white shadow-2xs font-medium"
                                            >
                                                <Box className="h-3.5 w-3.5 mr-1" /> Separar
                                            </Button>
                                        )}

                                        {/* Ação 3: Iniciar Conferência & Packing */}
                                        {order.status === 'Packing' && (
                                            <Button
                                                size="sm"
                                                onClick={() => navigate(`/outbound/packing/${order.id}`)}
                                                className="bg-orange-600 hover:bg-orange-700 text-white shadow-2xs font-medium"
                                            >
                                                <PackageCheck className="h-3.5 w-3.5 mr-1" /> Packing
                                            </Button>
                                        )}

                                        {/* Ação 4: Expedição Final na Doca */}
                                        {order.status === 'ReadyToShip' && (
                                            <Button
                                                size="sm"
                                                onClick={() => handleShipOrder(order.id)}
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
                                        >
                                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                                        </Button>

                                        {/* Botão Cancelar (Apenas se não faturado ou cancelado) */}
                                        {order.status !== 'Shipped' && order.status !== 'Canceled' && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setOrderToCancel(order)}
                                                className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                                title="Cancelar Pedido"
                                            >
                                                <Ban className="h-4 w-4" />
                                            </Button>
                                        )}

                                        {/* Botão Excluir (Apenas se já estiver Cancelado) */}
                                        {order.status === 'Canceled' && (
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
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {totalCount > 0 && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                        <span className="text-xs text-slate-500 font-medium">
                            Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} pedidos
                        </span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                        </div>
                    </div>
                )}
            </div>

            <ImportXmlModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />

            {/* Modal de Cancelamento */}
            <AlertDialog open={!!orderToCancel} onOpenChange={(open) => !open && setOrderToCancel(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar Pedido de Saída?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja cancelar a saída do pedido <strong className="text-slate-800">{orderToCancel?.orderNumber}</strong>? Todas as reservas de estoque e alocações serão estornadas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancelOrder} disabled={isLoading} className="bg-amber-600 hover:bg-amber-700 text-white">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Cancelamento'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Modal de Exclusão Definitiva */}
            <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Ordem de Saída?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir definitivamente a ordem cancelada <strong className="text-slate-800">{orderToDelete?.orderNumber}</strong>? Esta ação removerá o registro do sistema e não poderá ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteOrder} disabled={isLoading} className="bg-rose-600 hover:bg-rose-700 text-white">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir Definitivamente'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}