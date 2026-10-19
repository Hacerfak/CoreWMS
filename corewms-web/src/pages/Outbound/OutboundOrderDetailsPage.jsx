import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
    ArrowLeft, Box, CheckCircle2, Loader2, PackageCheck, MapPin, Truck, FileText, UserCheck, ChevronDown, ChevronRight, Layers, FileCode, Download, Pencil, ShoppingCart, Ban, FileSignature, RefreshCw, RotateCcw, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import CancelNfeModal from '@/pages/Outbound/CancelNfeModal';
import CorrectionLetterModal from '@/pages/Outbound/CorrectionLetterModal';

export default function OutboundOrderDetailsPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [downloadingDocId, setDownloadingDocId] = useState(null);
    const [expandedItemIds, setExpandedItemIds] = useState({});

    // Ações do cabeçalho
    const [isRevertingShipment, setIsRevertingShipment] = useState(false);
    const [isCancelingOrder, setIsCancelingOrder] = useState(false);
    const [isDeletingOrder, setIsDeletingOrder] = useState(false);
    const [isCancelOrderDialogOpen, setIsCancelOrderDialogOpen] = useState(false);
    const [isDeleteOrderDialogOpen, setIsDeleteOrderDialogOpen] = useState(false);

    // Modais Fiscais
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [selectedDocForCancel, setSelectedDocForCancel] = useState(null);

    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
    const [selectedDocForCorrection, setSelectedDocForCorrection] = useState(null);

    const loadOrderDetails = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderId}`,
                method: 'GET'
            });
            const data = res?.data || res;
            setOrder(data);
            if (data?.items) {
                const initialExpanded = {};
                data.items.forEach(i => {
                    if (i.allocations && i.allocations.length > 0) {
                        initialExpanded[i.id] = true;
                    }
                });
                setExpandedItemIds(initialExpanded);
            }
        } catch {
            toast.error('Erro ao carregar detalhes da ordem de saída.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) loadOrderDetails();
    }, [orderId]);

    const toggleExpandItem = (itemId) => {
        setExpandedItemIds(prev => ({ ...prev, [itemId]: !prev[itemId] }));
    };

    const handleDownloadPdf = async (doc) => {
        try {
            setDownloadingDocId(doc.id);
            const response = await customInstance({
                url: `/api/fiscal/nfe/${doc.id}/pdf`,
                method: 'GET',
                responseType: 'blob'
            });

            const blob = new Blob([response], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${doc.accessKey || doc.id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Download do PDF iniciado!');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao baixar o PDF.');
        } finally {
            setDownloadingDocId(null);
        }
    };

    const handleDownloadXml = async (doc) => {
        try {
            toast.success('Preparando download do XML...');
            const response = await customInstance({
                url: `/api/fiscal/nfe/${doc.id}/xml`,
                method: 'GET',
                responseType: 'blob'
            });

            const blob = new Blob([response], { type: 'application/xml' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${doc.accessKey || doc.id}.xml`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error('Erro ao baixar o arquivo XML.');
        }
    };

    // Exclusão de Nota Fiscal Pendente ou Rejeitada
    const handleDeletePendingDoc = async (doc) => {
        if (!confirm(`Deseja realmente excluir esta nota fiscal pendente/rejeitada #${doc.id}?`)) return;
        try {
            await customInstance({
                url: `/api/fiscal/documents/${doc.id}`,
                method: 'DELETE'
            });
            toast.success('Documento fiscal pendente removido com sucesso!');
            loadOrderDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir documento fiscal.');
        }
    };

    // Estorno da Expedição
    const handleRevertShipment = async () => {
        const confirmMsg = `Deseja realmente estornar a expedição da Ordem #${order?.orderNumber}?\n\nEsta ação irá:\n1. Devolver o saldo para as Unidades Logísticas (HUs).\n2. Restaurar o saldo alocado no estoque.\n3. Registrar a movimentação de estorno no Kardex.\n4. Retornar a ordem para 'Pronto para Expedir' (ReadyToShip), permitindo reemitir a nota fiscal ou cancelar o pedido.`;

        if (!confirm(confirmMsg)) return;

        try {
            setIsRevertingShipment(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderId}/revert-shipment`,
                method: 'POST'
            });

            const data = res?.data || res;
            toast.success(data?.message || 'Expedição estornada com sucesso!');
            loadOrderDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Erro ao estornar expedição.');
        } finally {
            setIsRevertingShipment(false);
        }
    };

    // Cancelamento do Pedido
    const handleCancelOrder = async () => {
        try {
            setIsCancelingOrder(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderId}/cancel`,
                method: 'DELETE'
            });
            const data = res?.data || res;
            toast.success(data?.message || 'Pedido de saída cancelado com sucesso.');
            setIsCancelOrderDialogOpen(false);
            loadOrderDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Erro ao cancelar pedido.');
        } finally {
            setIsCancelingOrder(false);
        }
    };

    // Exclusão Permanente da Ordem
    const handleDeleteOrder = async () => {
        try {
            setIsDeletingOrder(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderId}`,
                method: 'DELETE'
            });
            const data = res?.data || res;
            toast.success(data?.message || 'Ordem de saída excluída com sucesso.');
            setIsDeleteOrderDialogOpen(false);
            navigate('/outbound');
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Erro ao excluir ordem.');
        } finally {
            setIsDeletingOrder(false);
        }
    };

    const handleOpenCancelModal = (doc) => {
        setSelectedDocForCancel(doc);
        setIsCancelModalOpen(true);
    };

    const handleOpenCorrectionModal = (doc) => {
        setSelectedDocForCorrection(doc);
        setIsCorrectionModalOpen(true);
    };

    const renderStatusBadge = (status) => {
        switch (status) {
            case 'Pending':
                return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Aguardando Alocação</Badge>;
            case 'Allocated':
                return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Pronto p/ Separar</Badge>;
            case 'Picking':
                return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Em Separação</Badge>;
            case 'Packing':
                return <Badge className="bg-amber-100 text-amber-900 border-amber-300">Aguardando Packing</Badge>;
            case 'ReadyToShip':
                return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Pronto p/ Expedir</Badge>;
            case 'Shipped':
                return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Expedido</Badge>;
            case 'Canceled':
                return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Cancelado</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const canEdit = ['Pending', 'Allocating', 'Allocated'].includes(order?.status);

    const nfeOriginalDocs = order?.fiscalDocuments?.filter(doc => {
        const typeNum = Number(doc.type);
        return (typeNum >= 1 && typeNum <= 6) ||
            ['Normal', 'Complementar', 'Ajuste', 'Devolucao', 'NotaCredito', 'NotaDebito'].includes(doc.type);
    }) || [];

    const hasActiveNfe = nfeOriginalDocs.some(d => {
        const s = String(d.status || '').toLowerCase();
        return s === 'authorized' || s === '2' || s === 'pending' || s === '1';
    });

    const canManageShippedOrder = order?.status === 'Shipped' && !hasActiveNfe;
    const canCancelOrder = order?.status !== 'Shipped' && order?.status !== 'Canceled' && !hasActiveNfe;
    const canDeleteOrder = order?.status === 'Canceled' && (!order?.fiscalDocuments || order.fiscalDocuments.length === 0);

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/outbound')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900">Ordem de Saída #{order?.orderNumber}</h1>
                            {renderStatusBadge(order?.status)}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong className="text-slate-700">{order?.customerName}</strong>
                            {order?.invoiceNumber && ` | NF-e: ${order.invoiceNumber}/${order.invoiceSerie || '1'}`}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {canEdit && (
                        <>
                            <Button variant="outline" onClick={() => navigate(`/outbound/editar/${order.id}`)} className="border-slate-300 text-slate-700 bg-white font-medium h-9">
                                <Pencil size={15} className="mr-1.5 text-slate-500" /> Editar Cabeçalho
                            </Button>
                            <Button variant="outline" onClick={() => navigate(`/outbound/ordem/${order.id}/itens`)} className="border-orange-200 text-orange-800 bg-orange-50 hover:bg-orange-100 font-medium h-9">
                                <ShoppingCart size={15} className="mr-1.5 text-orange-600" /> Gerenciar Itens
                            </Button>
                        </>
                    )}

                    {(order?.status === 'Allocated' || order?.status === 'Picking') && (
                        <Button onClick={() => navigate(`/outbound/picking/${order.id}`)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-9">
                            <Box size={15} className="mr-1.5" /> Ir para Coletor
                        </Button>
                    )}
                    {order?.status === 'Packing' && (
                        <Button onClick={() => navigate(`/outbound/packing/${order.id}`)} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9">
                            <PackageCheck size={15} className="mr-1.5" /> Ir para Packing
                        </Button>
                    )}
                    {order?.status === 'ReadyToShip' && (
                        <Button onClick={() => navigate(`/outbound/revisao-fiscal/${order.id}`)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9">
                            <CheckCircle2 size={15} className="mr-1.5" /> Revisar e Expedir
                        </Button>
                    )}

                    {canManageShippedOrder && (
                        <>
                            <Button
                                onClick={handleRevertShipment}
                                disabled={isRevertingShipment}
                                variant="outline"
                                className="border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 font-bold h-9"
                                title="Restaura os saldos às HUs, Kardex e retorna a ordem para Pronto para Expedir"
                            >
                                {isRevertingShipment ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                ) : (
                                    <RotateCcw className="h-4 w-4 mr-1.5 text-amber-600" />
                                )}
                                Estornar Expedição
                            </Button>

                            <Button onClick={() => navigate(`/outbound/revisao-fiscal/${order.id}`)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9">
                                <RefreshCw size={15} className="mr-1.5" /> {nfeOriginalDocs.length > 0 ? 'Emitir Nova NF-e' : 'Emitir NF-e'}
                            </Button>
                        </>
                    )}

                    {canCancelOrder && (
                        <Button
                            variant="outline"
                            onClick={() => setIsCancelOrderDialogOpen(true)}
                            className="border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 font-medium h-9"
                            title="Cancelar o pedido de saída e liberar as reservas de estoque"
                        >
                            <Ban size={15} className="mr-1.5 text-rose-600" /> Cancelar Pedido
                        </Button>
                    )}

                    {canDeleteOrder && (
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteOrderDialogOpen(true)}
                            className="border-rose-300 text-rose-800 bg-rose-100 hover:bg-rose-200 font-bold h-9"
                            title="Excluir definitivamente o registro da ordem cancelada"
                        >
                            <Trash2 size={15} className="mr-1.5 text-rose-700" /> Excluir Ordem
                        </Button>
                    )}
                </div>
            </div>

            {/* CONTEÚDO PRINCIPAL */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* ITENS E HUS */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-2"><Layers size={16} className="text-orange-600" /> Itens do Pedido & Origem das HUs</span>
                                <Badge variant="secondary" className="font-mono">{order?.items?.length || 0} SKU(s)</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            {order?.items?.map((item) => {
                                const percent = item.expectedQuantity > 0 ? Math.min(100, (item.pickedQuantity / item.expectedQuantity) * 100) : 0;
                                const isExpanded = !!expandedItemIds[item.id];
                                const pickedAllocations = item.allocations?.filter(a => a.isPicked) || [];
                                const unpickedAllocations = item.allocations?.filter(a => !a.isPicked) || [];

                                return (
                                    <div key={item.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
                                        <div
                                            onClick={() => toggleExpandItem(item.id)}
                                            className="p-3 bg-white flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100"
                                        >
                                            <div className="flex items-center gap-3">
                                                {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-xs text-slate-900">{item.skuCode}</span>
                                                        <Badge variant="outline" className="text-[10px] font-mono">{item.unit}</Badge>
                                                    </div>
                                                    <span className="text-[11px] text-slate-500">{item.description}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs font-mono">
                                                <div>
                                                    <span className="text-slate-400 text-[10px] block">PREVISTO / SEPARADO</span>
                                                    <span className="font-bold text-slate-900">{item.expectedQuantity} {item.unit}</span>
                                                    <span className="text-purple-700 font-bold ml-1">({item.pickedQuantity} SEPARADO)</span>
                                                </div>
                                                <Badge className={item.pickedQuantity >= item.expectedQuantity ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                                                    {item.status}
                                                </Badge>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="p-3 bg-slate-50 space-y-3 text-xs">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
                                                        <span>Progresso de Separação</span>
                                                        <span>{percent.toFixed(0)}%</span>
                                                    </div>
                                                    <Progress value={percent} className="h-1.5" />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                                                        <span className="font-bold text-slate-800 text-[10px] uppercase block tracking-wider text-emerald-700">
                                                            ✓ HUs Separadas ({pickedAllocations.length})
                                                        </span>
                                                        {pickedAllocations.length === 0 ? (
                                                            <span className="text-[11px] text-slate-400 italic">Nenhum LPN coletado.</span>
                                                        ) : (
                                                            pickedAllocations.map(a => (
                                                                <div key={a.allocationId} className="flex justify-between items-center text-[11px] font-mono bg-slate-50 p-1.5 rounded border">
                                                                    <span>LPN: <strong>{a.lpn}</strong> ({a.locationPath})</span>
                                                                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{a.quantity} {item.unit}</Badge>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>

                                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                                                        <span className="font-bold text-slate-800 text-[10px] uppercase block tracking-wider text-blue-700">
                                                            ⏳ Reservadas / Sugeridas ({unpickedAllocations.length})
                                                        </span>
                                                        {unpickedAllocations.length === 0 ? (
                                                            <span className="text-[11px] text-slate-400 italic">Sem reservas pendentes.</span>
                                                        ) : (
                                                            unpickedAllocations.map(a => (
                                                                <div key={a.allocationId} className="flex justify-between items-center text-[11px] font-mono bg-slate-50 p-1.5 rounded border">
                                                                    <span>LPN: <strong>{a.lpn}</strong> ({a.locationPath})</span>
                                                                    <span className="text-slate-600">{a.quantity} {item.unit}</span>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    {/* VOLUMES PACKING */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-2"><Box size={16} className="text-orange-600" /> Volumes Finais Gerados (Packing)</span>
                                <Badge variant="secondary" className="font-mono">{order?.volumes?.length || 0} Volume(s)</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            {!order?.volumes || order.volumes.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">Nenhum volume gerado na conferência ainda.</p>
                            ) : (
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead>Volume LPN</TableHead>
                                                <TableHead>Tipo Embalagem</TableHead>
                                                <TableHead>Filme Stretch</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {order.volumes.map(vol => (
                                                <TableRow key={vol.id}>
                                                    <TableCell className="font-mono font-bold text-xs text-slate-900">{vol.volumeLpn}</TableCell>
                                                    <TableCell className="text-xs font-mono">
                                                        <Badge variant="outline" className="text-[10px] mr-1.5">{vol.packagingTypeCode}</Badge>
                                                        {vol.packagingTypeDescription}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={vol.usedStretchFilm ? 'bg-blue-100 text-blue-800 text-[10px]' : 'bg-slate-100 text-slate-600 text-[10px]'}>
                                                            {vol.usedStretchFilm ? 'Sim (Aplicado)' : 'Não'}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* HISTÓRICO FISCAL */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-2"><FileCode size={16} className="text-orange-600" /> Documentos Fiscais & Eventos SEFAZ</span>
                                <Badge variant="secondary" className="font-mono">{order?.fiscalDocuments?.length || 0} Registro(s)</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            {!order?.fiscalDocuments || order.fiscalDocuments.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">Nenhum documento fiscal emitido para esta ordem de saída ainda.</p>
                            ) : (
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead>Data</TableHead>
                                                <TableHead>Finalidade / Tipo</TableHead>
                                                <TableHead>Chave de Acesso</TableHead>
                                                <TableHead>Protocolo SEFAZ</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="w-32 text-right"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {order.fiscalDocuments.map(doc => {
                                                const typeNum = Number(doc.type);
                                                const isNfeOriginal = (typeNum >= 1 && typeNum <= 6) ||
                                                    ['Normal', 'Complementar', 'Ajuste', 'Devolucao', 'NotaCredito', 'NotaDebito'].includes(doc.type);

                                                const statusStr = String(doc.status || '').toLowerCase();
                                                const isAuthorized = statusStr === 'authorized' || statusStr === '2';
                                                const isPendingOrRejected = statusStr === 'pending' || statusStr === '1' || statusStr === 'rejected' || statusStr === '3';

                                                return (
                                                    <TableRow key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <TableCell className="text-xs font-mono">{new Date(doc.createdAt).toLocaleString('pt-BR')}</TableCell>
                                                        <TableCell className="text-xs font-semibold text-slate-800">
                                                            {doc.type === 'Normal' || doc.type === 1 ? '1 - NF-e Normal' :
                                                                doc.type === 'Complementar' || doc.type === 2 ? '2 - NF-e Complementar' :
                                                                    doc.type === 'Ajuste' || doc.type === 3 ? '3 - NF-e Ajuste' :
                                                                        doc.type === 'Devolucao' || doc.type === 4 ? '4 - Devolução / Retorno' :
                                                                            doc.type === 'NotaCredito' || doc.type === 5 ? '5 - Nota Crédito (RT)' :
                                                                                doc.type === 'NotaDebito' || doc.type === 6 ? '6 - Nota Débito (RT)' :
                                                                                    doc.type === 'Cancelamento' || doc.type === 7 ? 'Cancelamento' :
                                                                                        doc.type === 'CartaCorrecao' || doc.type === 8 ? 'Carta de Correção (CC-e)' : doc.type}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs font-semibold text-slate-900">
                                                            {doc.accessKey ? `${doc.accessKey.substring(0, 10)}...${doc.accessKey.substring(34)}` : '-'}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-xs text-slate-700">{doc.protocol || '-'}</TableCell>
                                                        <TableCell>
                                                            <div className="space-y-0.5">
                                                                <Badge className={
                                                                    isAuthorized ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                                                        statusStr === 'rejected' || statusStr === '3' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                                                                            statusStr === 'canceled' || statusStr === '4' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                                                                'bg-amber-100 text-amber-800 border-amber-200'
                                                                }>
                                                                    {isAuthorized ? 'Autorizada' :
                                                                        statusStr === 'rejected' || statusStr === '3' ? 'Rejeitada' :
                                                                            statusStr === 'canceled' || statusStr === '4' ? 'Cancelada' : 'Pendente'}
                                                                </Badge>
                                                                {doc.returnMessage && (
                                                                    <span className="block text-[10px] text-slate-500 font-mono max-w-[200px] truncate" title={doc.returnMessage}>
                                                                        {doc.returnMessage}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-1">
                                                                {/* AÇÕES DE NOTA AUTORIZADA */}
                                                                {isAuthorized && (
                                                                    <>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() => handleDownloadXml(doc)}
                                                                            className="h-8 text-xs bg-white text-blue-700 border-blue-200 hover:bg-blue-50 font-medium px-2"
                                                                            title="Baixar XML"
                                                                        >
                                                                            <FileCode size={13} className="mr-1 text-blue-600" /> XML
                                                                        </Button>

                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() => handleDownloadPdf(doc)}
                                                                            disabled={downloadingDocId === doc.id}
                                                                            className={`h-8 text-xs bg-white font-medium px-2 ${isNfeOriginal ? 'text-orange-700 border-orange-200 hover:bg-orange-50' :
                                                                                doc.type === 'Cancelamento' || doc.type === 7 ? 'text-rose-700 border-rose-200 hover:bg-rose-50' :
                                                                                    'text-purple-700 border-purple-200 hover:bg-purple-50'
                                                                                }`}
                                                                            title="Baixar PDF Oficial"
                                                                        >
                                                                            {downloadingDocId === doc.id ? (
                                                                                <Loader2 size={13} className="animate-spin" />
                                                                            ) : (
                                                                                <>
                                                                                    <Download size={13} className="mr-1" />
                                                                                    {isNfeOriginal ? 'DANFE' : doc.type === 'Cancelamento' || doc.type === 7 ? 'Canc.' : 'CC-e'}
                                                                                </>
                                                                            )}
                                                                        </Button>

                                                                        {isNfeOriginal && (
                                                                            <>
                                                                                <Button
                                                                                    size="sm"
                                                                                    variant="outline"
                                                                                    onClick={() => handleOpenCorrectionModal(doc)}
                                                                                    className="h-8 text-xs bg-white text-purple-700 border-purple-200 hover:bg-purple-50 font-medium px-2"
                                                                                    title="Emitir Carta de Correção (CC-e)"
                                                                                >
                                                                                    <FileSignature size={13} className="mr-1 text-purple-600" /> CC-e
                                                                                </Button>

                                                                                <Button
                                                                                    size="sm"
                                                                                    variant="outline"
                                                                                    onClick={() => handleOpenCancelModal(doc)}
                                                                                    className="h-8 text-xs bg-white text-rose-700 border-rose-200 hover:bg-rose-50 font-medium px-2"
                                                                                    title="Cancelar NF-e na SEFAZ"
                                                                                >
                                                                                    <Ban size={13} className="mr-1 text-rose-600" /> Cancelar
                                                                                </Button>
                                                                            </>
                                                                        )}
                                                                    </>
                                                                )}

                                                                {/* BOTÃO EXCLUIR NOTA PENDENTE / REJEITADA */}
                                                                {isPendingOrRejected && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => handleDeletePendingDoc(doc)}
                                                                        className="h-8 text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 font-medium px-2"
                                                                        title="Excluir nota pendente/rejeitada para destravar o pedido"
                                                                    >
                                                                        <Trash2 size={13} className="mr-1 text-rose-600" /> Excluir
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
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* COLUNA DIREITA */}
                <div className="space-y-6">
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <UserCheck size={16} className="text-orange-600" /> Destinatário Final & Entrega
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2 text-xs">
                            <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Razão Social / Nome</span>
                                <span className="font-bold text-slate-900 block">{order?.destinationName || 'Próprio Depositante'}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">CNPJ / CPF</span>
                                    <span className="font-mono font-semibold text-slate-800">{order?.destinationCnpjCpf || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Inscrição Estadual</span>
                                    <span className="font-mono font-semibold text-slate-800">{order?.destinationStateRegistration || 'ISENTO'}</span>
                                </div>
                            </div>

                            <div className="pt-1 border-t border-slate-100 space-y-1">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold flex items-center gap-1">
                                    <MapPin size={12} className="text-orange-600" /> Endereço de Entrega
                                </span>
                                <p className="text-slate-700">
                                    {order?.destinationStreet ? `${order.destinationStreet}, ${order.destinationNumber || 'S/N'} ${order.destinationComplement || ''}` : 'Endereço cadastrado no Depositante'}
                                </p>
                                <p className="text-slate-600 font-mono">
                                    {order?.destinationNeighborhood ? `${order.destinationNeighborhood} - ` : ''}
                                    {order?.destinationCity} / {order?.destinationState} - CEP: {order?.destinationZipCode || '-'}
                                </p>
                                {order?.destinationCityCode > 0 && (
                                    <span className="text-[10px] text-slate-400 font-mono block">Cód. IBGE: {order.destinationCityCode}</span>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <Truck size={16} className="text-orange-600" /> Transportadora & Logística
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2 text-xs">
                            <div className="pt-1">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Transportadora</span>
                                <span className="font-bold text-slate-900 block">{order?.carrierName || 'Não Informada'}</span>
                                {order?.carrierCnpjCpf && <span className="font-mono text-slate-600 block">{order.carrierCnpjCpf}</span>}
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Placa Veículo</span>
                                    <span className="font-mono font-bold text-slate-800">{order?.vehiclePlate || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">UF Placa</span>
                                    <span className="font-mono font-bold text-slate-800">{order?.vehiclePlateState || '-'}</span>
                                </div>
                            </div>

                            <div className="pt-1 border-t border-slate-100 flex justify-between items-center">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Modalidade do Frete</span>
                                <span className="font-semibold text-slate-800 text-xs">
                                    {order?.freightModality === 0 && '0 - Remetente (CIF)'}
                                    {order?.freightModality === 1 && '1 - Destinatário (FOB)'}
                                    {order?.freightModality === 2 && '2 - Terceiros'}
                                    {order?.freightModality === 3 && '3 - Próprio Remetente'}
                                    {order?.freightModality === 4 && '4 - Próprio Destinatário'}
                                    {(order?.freightModality === 9 || order?.freightModality === undefined || order?.freightModality === null) && '9 - Sem Frete'}
                                </span>
                            </div>

                            <div className="pt-1 border-t border-slate-100">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Doca de Embarque</span>
                                <span className="font-mono font-bold text-slate-900">{order?.dockLocationName || 'Aguardando Packing'}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {order?.additionalNotes && (
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-3 border-b bg-slate-50/60">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-1.5">
                                    <FileText size={15} className="text-orange-600" /> Observações Fiscais (infCpl)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 text-xs text-slate-700 font-mono">
                                {order.additionalNotes}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* MODAL DE CONFIRMAÇÃO DE CANCELAMENTO DO PEDIDO */}
            <AlertDialog open={isCancelOrderDialogOpen} onOpenChange={setIsCancelOrderDialogOpen}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar Pedido de Saída?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja cancelar o pedido <strong className="text-slate-800">#{order?.orderNumber}</strong>?
                            <br /><br />
                            Todas as reservas de estoque, alocações de coletor e volumes gerados serão cancelados e liberados de volta ao armazém.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isCancelingOrder}>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancelOrder} disabled={isCancelingOrder} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                            {isCancelingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Cancelamento'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DA ORDEM */}
            <AlertDialog open={isDeleteOrderDialogOpen} onOpenChange={setIsDeleteOrderDialogOpen}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Ordem de Saída?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir definitivamente a ordem cancelada <strong className="text-slate-800">#{order?.orderNumber}</strong>?
                            <br /><br />
                            Esta ação removerá permanentemente o registro e seus itens do sistema.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingOrder}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteOrder} disabled={isDeletingOrder} className="bg-rose-600 hover:bg-rose-700 text-white font-bold">
                            {isDeletingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir Definitivamente'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* MODAL DE CANCELAMENTO DE NF-E (SEFAZ) */}
            <CancelNfeModal
                open={isCancelModalOpen}
                onOpenChange={setIsCancelModalOpen}
                orderId={orderId}
                orderNumber={order?.orderNumber}
                accessKey={selectedDocForCancel?.accessKey}
                onSuccess={loadOrderDetails}
            />

            {/* MODAL DE CARTA DE CORREÇÃO (CC-e) */}
            <CorrectionLetterModal
                open={isCorrectionModalOpen}
                onOpenChange={setIsCorrectionModalOpen}
                orderId={orderId}
                orderNumber={order?.orderNumber}
                accessKey={selectedDocForCorrection?.accessKey}
                onSuccess={loadOrderDetails}
            />
        </div>
    );
}