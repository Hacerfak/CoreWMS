import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    useGetApiInboundId,
    usePostApiInboundReceiveStart,
    usePostApiInboundReceiveOrderItemIdRelease
} from '@/api/generated/inbound/inbound';
import { useGetApiTopologyLocationsDocks } from '@/api/generated/topology/topology';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Loader2, ArrowLeft, Warehouse, Play, PauseCircle, PackageCheck,
    CheckCircle2, Calendar, Clock, Building2, Layers, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

export default function InboundOperacaoPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [selectedDocks, setSelectedDocks] = useState({});
    const [isHusModalOpen, setIsHusModalOpen] = useState(false);

    // Detalhes da Ordem
    const { data: order, isLoading } = useGetApiInboundId(orderId);

    // Lista de Docas da Topologia
    const { data: dockLocations = [], isLoading: isLoadingDocks } = useGetApiTopologyLocationsDocks();

    const { mutate: startReceiving, isPending: isStarting } = usePostApiInboundReceiveStart({
        mutation: {
            onSuccess: (_, variables) => {
                toast.success('Doca atribuída e recebimento do item iniciado!');
                queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
                // Redireciona diretamente para a conferência após dar início/continuidade
                navigate(`/inbound/operacao/${orderId}/item/${variables.data.orderItemId}`);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao iniciar recebimento do item.')
        }
    });

    const { mutate: releaseItem, isPending: isReleasing } = usePostApiInboundReceiveOrderItemIdRelease({
        mutation: {
            onSuccess: () => {
                toast.success('Recebimento pausado e liberado para outros operadores.');
                queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao liberar item.')
        }
    });

    const handleDockSelect = (itemId, dockId) => {
        setSelectedDocks(prev => ({ ...prev, [itemId]: dockId }));
    };

    const handleStartItem = (itemId) => {
        const currentItem = order?.items?.find(i => i.id === itemId);
        const dockId = selectedDocks[itemId] || currentItem?.dockLocationId;

        if (!dockId) {
            toast.warning('Selecione a Doca de descarga para este item antes de iniciar.');
            return;
        }

        startReceiving({
            data: {
                orderItemId: itemId,
                dockLocationId: dockId
            }
        });
    };

    const renderOrderStatusBadge = (status) => {
        switch (status) {
            case 'Pending':
                return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-medium">Aguardando Recebimento</Badge>;
            case 'Receiving':
                return <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-medium">Em Recebimento</Badge>;
            case 'Completed':
                return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-medium">Finalizado</Badge>;
            case 'Canceled':
                return <Badge className="bg-rose-100 text-rose-800 border-rose-200 font-medium">Cancelado</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const renderItemStatusBadge = (item) => {
        if (item.status === 'Pending_Review') {
            return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-medium">Revisão Pendente</Badge>;
        }
        if (item.status === 'Completed') {
            return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-medium">100% Recebido</Badge>;
        }
        // Se o status for Receiving E houver um operador preso nele
        if (item.status === 'Receiving' && item.lockedByUserId) {
            return <Badge className="bg-purple-100 text-purple-800 border-purple-200 animate-pulse font-medium">Em Recebimento</Badge>;
        }
        // Se tiver recebimento parcial e estiver destravado
        if (item.receivedQuantity > 0) {
            return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-medium">Parcial - Aguardando</Badge>;
        }
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-medium">Aguardando Recebimento</Badge>;
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-8 text-center space-y-4">
                <p className="text-slate-500">Ordem de recebimento não encontrada.</p>
                <Button onClick={() => navigate('/inbound')}>Voltar ao Inbound</Button>
            </div>
        );
    }

    const documentNumber = order.accessKey && order.accessKey.length >= 34
        ? parseInt(order.accessKey.substring(25, 34), 10)
        : 'N/A';

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* CABEÇALHO */}
            <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/inbound')} className="shrink-0 text-slate-500 hover:text-slate-900">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-mono">NF {documentNumber}</h1>
                            {renderOrderStatusBadge(order.status)}
                        </div>
                    </div>

                    <Button
                        onClick={() => navigate(`/inbound/operacao/${orderId}/hus`)}
                        variant="outline"
                        className="border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                    >
                        <Layers className="w-4 h-4 mr-2" /> HUs Geradas ({order?.items?.reduce((acc, i) => acc + (i.receivedQuantity > 0 ? 1 : 0), 0) || 0})
                    </Button>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                        <Building2 size={16} className="text-slate-400 shrink-0" />
                        <div>
                            <span className="text-slate-400 block text-[10px] font-semibold uppercase">Depositante</span>
                            <span className="font-bold text-slate-800">{order.customerName || order.issuerName}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-700">
                        <Calendar size={16} className="text-slate-400 shrink-0" />
                        <div>
                            <span className="text-slate-400 block text-[10px] font-semibold uppercase">Data Emissão NF-e</span>
                            <span className="font-medium text-slate-800">
                                {order.issueDate ? new Date(order.issueDate).toLocaleDateString('pt-BR') : '-'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-700">
                        <Clock size={16} className="text-slate-400 shrink-0" />
                        <div>
                            <span className="text-slate-400 block text-[10px] font-semibold uppercase">Entrada no Sistema</span>
                            <span className="font-medium text-slate-800">
                                {order.createdAt ? new Date(order.createdAt).toLocaleString('pt-BR') : '-'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* TABELA DE ITENS DA ORDEM */}
            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                        <Warehouse className="text-blue-600" size={18} /> Itens da Nota Fiscal ({order.items?.length || 0})
                    </h3>
                    <p className="text-xs text-slate-500">
                        Atribua a Doca para cada item e clique em <strong className="text-blue-700">Iniciar Descarga</strong>.
                    </p>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[80px]">Linha</TableHead>
                                <TableHead>SKU / Produto</TableHead>
                                <TableHead>Progresso Descarga</TableHead>
                                <TableHead className="w-[240px]">Doca Alocada</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {order.items?.map((item) => {
                                const isCompleted = item.status === 'Completed';
                                const isPendingReview = item.status === 'Pending_Review';

                                // O item só está em recebimento se estiver no status Receiving E tiver uma trava de operador ativa
                                const isReceiving = item.status === 'Receiving' && Boolean(item.lockedByUserId);
                                // Caso contrário, está pronto para iniciar ou continuar
                                const isReady = !isCompleted && !isPendingReview && !isReceiving;

                                const currentDockValue = selectedDocks[item.id] || item.dockLocationId || '';

                                return (
                                    <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="font-mono font-bold text-slate-500">
                                            #{item.lineNumber}
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900 font-mono">{item.sku || item.rawSkuCode}</span>
                                                <span className="text-xs text-slate-500 truncate max-w-[280px]" title={item.description || item.rawDescription}>
                                                    {item.description || item.rawDescription}
                                                </span>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex flex-col gap-1 w-36">
                                                <div className="flex justify-between text-xs font-semibold text-slate-700">
                                                    <span>{item.receivedQuantity}</span>
                                                    <span className="text-slate-400">/ {item.expectedQuantity} UN</span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className={`h-full ${isCompleted ? 'bg-emerald-500' : 'bg-blue-600'}`}
                                                        style={{ width: `${Math.min(100, (item.receivedQuantity / item.expectedQuantity) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </TableCell>

                                        {/* DOCA */}
                                        <TableCell>
                                            {(isReceiving || isCompleted) ? (
                                                <Badge variant="outline" className="bg-slate-50 text-slate-800 font-mono border-slate-300 flex items-center w-fit gap-1">
                                                    <Warehouse size={12} className="text-blue-600" />
                                                    {item.dockLocationPath || 'Doca Alocada'}
                                                </Badge>
                                            ) : (
                                                <Select
                                                    value={currentDockValue}
                                                    onValueChange={(dockId) => handleDockSelect(item.id, dockId)}
                                                    disabled={isPendingReview || isLoadingDocks}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-white border-slate-200">
                                                        <SelectValue placeholder={isLoadingDocks ? "Carregando..." : "Selecione a Doca..."} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {dockLocations.map(d => (
                                                            <SelectItem key={d.id} value={d.id}>{d.fullPath}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </TableCell>

                                        <TableCell>
                                            {renderItemStatusBadge(item)}
                                        </TableCell>

                                        <TableCell className="text-right space-x-1">
                                            {isPendingReview && (
                                                <Button size="sm" variant="outline" onClick={() => navigate(`/inbound/revisao/${order.id}`)} className="text-amber-700 border-amber-300 bg-amber-50">
                                                    Revisar SKU
                                                </Button>
                                            )}

                                            {/* AGUARDANDO RECEBIMENTO / CONTINUIDADE */}
                                            {isReady && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleStartItem(item.id)}
                                                    disabled={isStarting}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs font-medium"
                                                >
                                                    {isStarting ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : item.receivedQuantity > 0 ? (
                                                        <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Continuar Descarga</>
                                                    ) : (
                                                        <><Play className="h-3.5 w-3.5 mr-1" /> Iniciar Descarga</>
                                                    )}
                                                </Button>
                                            )}

                                            {/* EM RECEBIMENTO ATIVO */}
                                            {isReceiving && (
                                                <div className="inline-flex gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => navigate(`/inbound/operacao/${orderId}/item/${item.id}`)}
                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-medium"
                                                    >
                                                        <PackageCheck className="h-4 w-4 mr-1" /> Conferir Item
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        title="Pausar e liberar para outro operador"
                                                        onClick={() => releaseItem({ orderItemId: item.id })}
                                                        disabled={isReleasing}
                                                        className="border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                                                    >
                                                        {isReleasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><PauseCircle className="h-4 w-4 mr-1" /> Pausar</>}
                                                    </Button>
                                                </div>
                                            )}

                                            {isCompleted && (
                                                <span className="text-xs font-semibold text-emerald-700 flex items-center justify-end gap-1">
                                                    <CheckCircle2 size={16} /> Finalizado
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}