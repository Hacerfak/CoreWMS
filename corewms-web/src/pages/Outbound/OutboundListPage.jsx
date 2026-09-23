import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import { useGetApiCustomers } from '@/api/generated/customers/customers';

import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
    Truck, UploadCloud, Search, Loader2, Play,
    Box, ArrowUpFromLine, RefreshCw, XCircle, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import ImportXmlModal from './ImportXmlModal';

export default function OutboundListPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [selectedCustomer, setSelectedCustomer] = useState('ALL');
    const [selectedStatus, setSelectedStatus] = useState('ALL');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [orders, setOrders] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const loadOrders = async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            params.append('Page', page);
            params.append('PageSize', PAGE_SIZE);
            if (selectedCustomer !== 'ALL') params.append('CustomerId', selectedCustomer);
            if (selectedStatus !== 'ALL') params.append('Status', selectedStatus);
            if (search.trim()) params.append('Search', search.trim());

            const res = await customInstance({
                url: `/api/outbound/orders?${params.toString()}`,
                method: 'GET'
            });

            setOrders(res?.items || []);
            setTotalCount(res?.totalCount || 0);
        } catch {
            toast.error('Erro ao carregar lista de pedidos de saída.');
        } finally {
            setIsLoading(false);
        }
    };

    useState(() => {
        loadOrders();
    }, [page, selectedCustomer, selectedStatus]);

    // Executar Alocação FEFO/FIFO
    const handleAllocateOrder = async (orderId) => {
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderId}/allocate`,
                method: 'POST'
            });

            toast.success(res?.message || 'Reserva de estoque concluída com sucesso!');
            loadOrders();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao alocar estoque para o pedido.');
            setIsLoading(false);
        }
    };

    // Expedir Definitivo (Ship)
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

    // Cancelar Pedido
    const handleCancelOrder = async (orderId) => {
        try {
            setIsLoading(true);
            await customInstance({
                url: `/api/outbound/orders/${orderId}/cancel`,
                method: 'DELETE'
            });

            toast.success('Pedido cancelado e reservas liberadas.');
            loadOrders();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao cancelar pedido.');
            setIsLoading(false);
        }
    };

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Truck className="text-orange-600" size={26} /> Gestão de Expedição & Saídas (Outbound)
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Importe NF-es de venda, aloque o estoque por FEFO/FIFO, gerencie a separação e finalize o packing.
                    </p>
                </div>

                <Button
                    onClick={() => setIsImportModalOpen(true)}
                    className="bg-orange-600 hover:bg-orange-700 text-white shadow-sm"
                >
                    <UploadCloud className="mr-2 h-4 w-4" /> Importar XML NF-e
                </Button>
            </div>

            {/* FILTROS */}
            <Card className="border-slate-200/80 shadow-sm bg-white">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3 flex-1">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar por Nº Pedido, Cliente ou NF-e..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadOrders()}
                                className="pl-9 bg-slate-50 border-slate-200 h-9 text-xs"
                            />
                        </div>

                        <div className="w-[200px]">
                            <Select value={selectedCustomer} onValueChange={(v) => { setSelectedCustomer(v); setPage(1); }}>
                                <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-xs">
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
                            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(1); }}>
                                <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-xs">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os Status</SelectItem>
                                    <SelectItem value="Pending">⏳ Pendente</SelectItem>
                                    <SelectItem value="Allocated">🔒 Alocado</SelectItem>
                                    <SelectItem value="Picking">📦 Em Separação</SelectItem>
                                    <SelectItem value="ReadyToShip">🚚 Na Doca / Expedir</SelectItem>
                                    <SelectItem value="Shipped">✅ Expedido</SelectItem>
                                    <SelectItem value="Canceled">❌ Cancelado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Button onClick={loadOrders} variant="outline" size="sm" className="bg-white h-9">
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                </CardContent>
            </Card>

            {/* TABELA DE PEDIDOS */}
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/80">
                        <TableRow>
                            <TableHead>Nº Pedido / Emissão</TableHead>
                            <TableHead>Destinatário Final</TableHead>
                            <TableHead>Cidade / UF</TableHead>
                            <TableHead className="text-center">Itens</TableHead>
                            <TableHead>Status Operacional</TableHead>
                            <TableHead className="text-right w-52">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin text-orange-600 mx-auto" /></TableCell></TableRow>
                        ) : orders.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-28 text-center text-slate-500">Nenhum pedido de saída encontrado.</TableCell></TableRow>
                        ) : orders.map((o) => (
                            <TableRow key={o.id} className="hover:bg-slate-50/60">
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-bold font-mono text-slate-900">{o.orderNumber}</span>
                                        <span className="text-[10px] text-slate-400">{new Date(o.issueDate).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="font-semibold text-slate-800 text-xs truncate max-w-[200px]">
                                    {o.destinationName}
                                </TableCell>
                                <TableCell className="text-xs text-slate-600 font-mono">
                                    {o.destinationCity} / {o.destinationState}
                                </TableCell>
                                <TableCell className="text-center font-mono text-xs font-bold text-slate-700">
                                    {o.itemsCount}
                                </TableCell>
                                <TableCell>
                                    <Badge className={`text-[10px] px-2 py-0.5 border ${o.status === 'Pending' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                        o.status === 'Allocated' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                            o.status === 'Picking' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                                                o.status === 'ReadyToShip' ? 'bg-orange-50 text-orange-800 border-orange-200' :
                                                    o.status === 'Shipped' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                                        }`}>
                                        {o.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        {o.status === 'Pending' && (
                                            <Button
                                                onClick={() => handleAllocateOrder(o.id)}
                                                size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                            >
                                                <Play size={13} className="mr-1" /> Aloquar FEFO
                                            </Button>
                                        )}

                                        {(o.status === 'Allocated' || o.status === 'Picking') && (
                                            <Button
                                                onClick={() => navigate(`/outbound/picking/${o.id}`)}
                                                size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                                            >
                                                <Box size={13} className="mr-1" /> Coletor / Separar
                                            </Button>
                                        )}

                                        {o.status === 'Picking' && (
                                            <Button
                                                onClick={() => navigate(`/outbound/packing/${o.id}`)}
                                                size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                                            >
                                                <ArrowUpFromLine size={13} className="mr-1" /> Packing
                                            </Button>
                                        )}

                                        {o.status === 'ReadyToShip' && (
                                            <Button
                                                onClick={() => handleShipOrder(o.id)}
                                                size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                            >
                                                <CheckCircle2 size={13} className="mr-1" /> Expedir
                                            </Button>
                                        )}

                                        {o.status !== 'Shipped' && o.status !== 'Canceled' && (
                                            <Button
                                                onClick={() => handleCancelOrder(o.id)}
                                                variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:bg-rose-50 p-1.5"
                                            >
                                                <XCircle size={15} />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {totalCount > 0 && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                        <span>Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} pedidos</span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                        </div>
                    </div>
                )}
            </div>

            <ImportXmlModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />
        </div>
    );
}