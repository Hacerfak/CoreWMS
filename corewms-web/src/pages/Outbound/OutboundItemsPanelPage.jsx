import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft, Box, Scissors, Loader2, Plus,
    Trash2, Layers, FileText, ChevronRight, ChevronDown, CheckCircle2, ShoppingCart, Sparkles, CheckSquare, Square
} from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundItemsPanelPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    // Estados da Ordem
    const [order, setOrder] = useState(null);
    const [products, setProducts] = useState([]);
    const [isLoadingOrder, setIsLoadingOrder] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Seletor de Modo e Produto
    const [mode, setMode] = useState('CLOSED_VOLUMES');
    const [selectedProductId, setSelectedProductId] = useState('');
    const [availableStockData, setAvailableStockData] = useState(null);
    const [isLoadingStock, setIsLoadingStock] = useState(false);

    // Seleções do Modo 1 e Modo 2
    const [selectedHuIds, setSelectedHuIds] = useState(new Set());
    const [expandedGroupIdx, setExpandedGroupIdx] = useState({});
    const [fractionalQuantity, setFractionalQuantity] = useState('');

    // Reload da Ordem
    const loadOrderData = async () => {
        try {
            const orderData = await customInstance({ url: `/api/outbound/orders/${orderId}`, method: 'GET' });
            setOrder(orderData);

            if (orderData?.customerId && products.length === 0) {
                const productsRes = await customInstance({
                    url: `/api/products?CustomerId=${orderData.customerId}&PageSize=500`,
                    method: 'GET'
                });
                setProducts(productsRes?.items || []);
            }
        } catch {
            toast.error('Erro ao carregar ordem de saída.');
        } finally {
            setIsLoadingOrder(false);
        }
    };

    useEffect(() => {
        if (orderId) loadOrderData();
    }, [orderId]);

    // Reload do Estoque Disponível
    const loadAvailableStock = async () => {
        if (!orderId || !selectedProductId) {
            setAvailableStockData(null);
            setSelectedHuIds(new Set());
            setFractionalQuantity('');
            return;
        }

        try {
            setIsLoadingStock(true);
            const stockData = await customInstance({
                url: `/api/outbound/orders/${orderId}/available-stock/${selectedProductId}`,
                method: 'GET'
            });
            setAvailableStockData(stockData);
            if (stockData?.receiptGroups?.length > 0) {
                setExpandedGroupIdx({ 0: true });
            }
        } catch {
            toast.error('Erro ao consultar estoque livre.');
        } finally {
            setIsLoadingStock(false);
        }
    };

    useEffect(() => {
        loadAvailableStock();
    }, [orderId, selectedProductId]);

    // Adição Síncrona de Volumes Fechados
    const handleReserveClosedVolumes = async () => {
        if (selectedHuIds.size === 0) return toast.warning('Selecione ao menos um volume.');

        try {
            setIsActionLoading(true);
            await customInstance({
                url: `/api/outbound/orders/${orderId}/items/reserve-volumes`,
                method: 'POST',
                data: {
                    productId: selectedProductId,
                    handlingUnitIds: Array.from(selectedHuIds)
                }
            });

            toast.success(`${selectedHuIds.size} volume(s) reservado(s) na ordem!`);
            setSelectedHuIds(new Set());
            await Promise.all([loadOrderData(), loadAvailableStock()]);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao reservar volumes.');
        } finally {
            setIsActionLoading(false);
        }
    };

    // Adição Síncrona Fracionada
    const handleReserveFractional = async () => {
        const qtyNum = parseFloat(fractionalQuantity);
        if (isNaN(qtyNum) || qtyNum <= 0) return toast.warning('Informe uma quantidade válida.');

        try {
            setIsActionLoading(true);
            await customInstance({
                url: `/api/outbound/orders/${orderId}/items/reserve-fractional`,
                method: 'POST',
                data: {
                    productId: selectedProductId,
                    quantity: qtyNum
                }
            });

            toast.success(`Reserva fracionada de ${qtyNum} ${availableStockData?.baseUnit} efetuada!`);
            setFractionalQuantity('');
            await Promise.all([loadOrderData(), loadAvailableStock()]);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao reservar quantidade fracionada.');
        } finally {
            setIsActionLoading(false);
        }
    };

    // Remoção Síncrona do Item
    const handleRemoveOrderItem = async (orderItemId) => {
        try {
            setIsActionLoading(true);
            await customInstance({
                url: `/api/outbound/orders/${orderId}/items/${orderItemId}`,
                method: 'DELETE'
            });

            toast.success('Item e reservas estornados com sucesso.');
            await Promise.all([loadOrderData(), loadAvailableStock()]);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao remover item.');
        } finally {
            setIsActionLoading(false);
        }
    };

    const toggleHuSelection = (huId) => {
        setSelectedHuIds(prev => {
            const next = new Set(prev);
            if (next.has(huId)) next.delete(huId);
            else next.add(huId);
            return next;
        });
    };

    const toggleSelectAllInGroup = (group) => {
        const groupHuIds = group.availableHus.map(h => h.handlingUnitId);
        const allSelected = groupHuIds.every(id => selectedHuIds.has(id));

        setSelectedHuIds(prev => {
            const next = new Set(prev);
            groupHuIds.forEach(id => {
                if (allSelected) next.delete(id);
                else next.add(id);
            });
            return next;
        });
    };

    if (isLoadingOrder) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full py-20 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando dados da ordem de saída...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/60 rounded-xl p-4 shadow-xs shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/outbound')} className="shrink-0 text-slate-500 hover:text-slate-900">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold tracking-tight text-slate-900">Ordem de Saída #{order?.orderNumber}</h1>
                            <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">Montagem de Itens (Síncrona)</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Depositante: <strong className="text-slate-700">{order?.customerName}</strong></p>
                    </div>
                </div>

                <Button onClick={() => navigate('/outbound')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-6">
                    <CheckCircle2 size={16} className="mr-1.5" /> Concluir e Voltar
                </Button>
            </div>

            {/* SELEÇÃO DO MODO */}
            <Card className="border-slate-200/80 shadow-xs bg-white shrink-0">
                <CardContent className="p-4 space-y-3">
                    <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Seleção do Modo de Expedição:</Label>
                    <div className="grid grid-cols-2 gap-3 bg-slate-100 p-1 rounded-xl">
                        <button
                            type="button"
                            onClick={() => { setMode('CLOSED_VOLUMES'); setSelectedProductId(''); }}
                            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${mode === 'CLOSED_VOLUMES' ? 'bg-white text-orange-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                                }`}
                        >
                            <Box size={16} className="text-orange-600" /> 📦 Volumes Fechados (Paletes/Caixas)
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMode('FRACTIONAL'); setSelectedProductId(''); }}
                            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${mode === 'FRACTIONAL' ? 'bg-white text-purple-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                                }`}
                        >
                            <Scissors size={16} className="text-purple-600" /> ✂️ Fracionado (Unidade Base)
                        </button>
                    </div>

                    <div className="space-y-1.5 pt-1">
                        <Label className="text-xs font-bold text-slate-800">Selecionar Produto *</Label>
                        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                            <SelectTrigger className="bg-white text-xs h-10">
                                <SelectValue placeholder="Selecione um SKU no catálogo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {products.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                        <span className="font-mono font-bold text-slate-900">{p.sku}</span> - {p.description}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* PAINEL CENTRAL DE SELEÇÃO */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-0 relative">
                {isLoadingStock ? (
                    <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-2">
                        <Loader2 className="h-6 w-6 animate-spin text-orange-600 mx-auto" />
                        <p className="text-xs text-slate-500 font-medium">Consultando saldo livre em tempo real...</p>
                    </div>
                ) : !selectedProductId ? (
                    <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-xl space-y-2 text-slate-400 text-xs">
                        <Layers size={32} className="mx-auto text-slate-300" />
                        <p>Selecione um produto para carregar as etiquetas e lotes livres no armazém.</p>
                    </div>
                ) : mode === 'CLOSED_VOLUMES' ? (
                    <div className="space-y-3 pb-16">
                        {availableStockData?.receiptGroups?.map((group, gIdx) => {
                            const isExpanded = !!expandedGroupIdx[gIdx];
                            const groupHuIds = group.availableHus.map(h => h.handlingUnitId);
                            const isAllInGroupSelected = groupHuIds.length > 0 && groupHuIds.every(id => selectedHuIds.has(id));

                            return (
                                <div key={gIdx} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs">
                                    <div className="p-3 bg-slate-50 flex items-center justify-between border-b border-slate-100">
                                        <button type="button" onClick={() => setExpandedGroupIdx(prev => ({ ...prev, [gIdx]: !prev[gIdx] }))} className="flex items-center gap-3 text-left flex-1">
                                            {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                            <FileText size={16} className="text-orange-600" />
                                            <div>
                                                <span className="font-bold text-xs text-slate-900 font-mono">Nota / Lote: {group.batch}</span>
                                                <span className="text-[11px] text-slate-500 block">Entrada: {new Date(group.receiptDate).toLocaleDateString('pt-BR')}</span>
                                            </div>
                                        </button>
                                        <Button type="button" variant="outline" size="sm" onClick={() => toggleSelectAllInGroup(group)} className="h-7 text-xs bg-white">
                                            {isAllInGroupSelected ? <CheckSquare size={13} className="mr-1 text-orange-600" /> : <Square size={13} className="mr-1 text-slate-400" />}
                                            {isAllInGroupSelected ? 'Desmarcar NF' : 'Selecionar NF'}
                                        </Button>
                                    </div>

                                    {isExpanded && (
                                        <div className="p-2 bg-white">
                                            <Table>
                                                <TableHeader className="bg-slate-50">
                                                    <TableRow>
                                                        <TableHead className="w-10 text-center"></TableHead>
                                                        <TableHead>LPN</TableHead>
                                                        <TableHead>Tipo Vol.</TableHead>
                                                        <TableHead>Quantidade Disponível</TableHead>
                                                        <TableHead className="text-right">Posição</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {group.availableHus?.map(hu => {
                                                        const isChecked = selectedHuIds.has(hu.handlingUnitId);
                                                        return (
                                                            <TableRow key={hu.handlingUnitId} onClick={() => toggleHuSelection(hu.handlingUnitId)} className={`cursor-pointer ${isChecked ? 'bg-orange-50/70 font-medium' : 'hover:bg-slate-50'}`}>
                                                                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                                    <input type="checkbox" checked={isChecked} onChange={() => toggleHuSelection(hu.handlingUnitId)} className="rounded text-orange-600 h-4 w-4" />
                                                                </TableCell>
                                                                <TableCell className="font-mono font-bold text-xs">{hu.lpn}</TableCell>
                                                                <TableCell><Badge variant="outline" className="text-[10px] font-mono">{hu.packagingTypeCode}</Badge></TableCell>
                                                                <TableCell className="font-mono text-xs">{hu.currentQuantity} {availableStockData.baseUnit}</TableCell>
                                                                <TableCell className="text-right font-mono text-xs text-slate-600">{hu.locationPath}</TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {selectedHuIds.size > 0 && (
                            <div className="sticky bottom-2 z-20 bg-slate-900 text-white p-3 rounded-xl shadow-lg flex items-center justify-between">
                                <span className="text-xs font-semibold"><strong className="text-orange-400">{selectedHuIds.size}</strong> volume(s) marcado(s).</span>
                                <Button onClick={handleReserveClosedVolumes} disabled={isActionLoading} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-8 text-xs">
                                    {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus size={14} className="mr-1" />} Reservar no Banco
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <Card className="border-purple-200 bg-purple-50/30 p-5 space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-purple-900">Informar Quantidade em {availableStockData?.baseUnit} *</Label>
                            <div className="flex gap-3">
                                <Input
                                    type="number"
                                    step="0.0001"
                                    placeholder={`Ex: 1350 ${availableStockData?.baseUnit}`}
                                    value={fractionalQuantity}
                                    onChange={(e) => setFractionalQuantity(e.target.value)}
                                    className="bg-white font-mono text-sm h-10 border-purple-300"
                                />
                                <Button onClick={handleReserveFractional} disabled={isActionLoading || !fractionalQuantity} className="bg-purple-700 hover:bg-purple-800 text-white font-bold h-10 px-6">
                                    {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus size={16} className="mr-1.5" />} Reservar Fracionado
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            {/* CARRINHO DA ORDEM (RESERVAS ATIVAS NO BANCO DE DADOS) */}
            <Card className="border-slate-200/80 shadow-xs bg-white shrink-0">
                <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/50">
                    <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                        <span className="flex items-center gap-2"><ShoppingCart size={18} className="text-orange-600" /> Itens Gravados na Ordem de Saída</span>
                        <Badge variant="secondary" className="font-mono">{order?.items?.length || 0} SKU(s)</Badge>
                    </CardTitle>
                </CardHeader>

                <CardContent className="p-4">
                    {!order?.items || order.items.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs border border-dashed rounded-lg bg-slate-50">
                            Nenhum item reservado para esta ordem de saída ainda.
                        </div>
                    ) : (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>SKU Produto</TableHead>
                                        <TableHead>Quantidade Solicitada</TableHead>
                                        <TableHead>Quantidade Alocada (Reservada)</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-12 text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {order.items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono font-bold text-slate-900 text-xs">{item.skuCode}</TableCell>
                                            <TableCell className="font-mono text-xs text-slate-900">{item.expectedQuantity}</TableCell>
                                            <TableCell className="font-mono text-xs font-bold text-emerald-700">{item.allocatedQuantity}</TableCell>
                                            <TableCell><Badge variant="outline" className="text-[10px]">{item.status}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveOrderItem(item.id)} disabled={isActionLoading} className="text-slate-400 hover:text-rose-600 p-1">
                                                    <Trash2 size={15} />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}