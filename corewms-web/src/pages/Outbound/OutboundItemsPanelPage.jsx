import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft, Box, Scissors, PackageCheck, Scale, Loader2, Plus,
    Trash2, CheckCircle2, AlertTriangle, Layers, Calendar, FileText, ChevronRight, ChevronDown, Save
} from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundItemsPanelPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    // Estados da Ordem
    const [order, setOrder] = useState(null);
    const [products, setProducts] = useState([]);
    const [isLoadingOrder, setIsLoadingOrder] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Seletor de Modo e Produto
    const [mode, setMode] = useState('CLOSED_VOLUMES'); // 'CLOSED_VOLUMES' | 'FRACTIONAL'
    const [selectedProductId, setSelectedProductId] = useState('');
    const [availableStockData, setAvailableStockData] = useState(null);
    const [isLoadingStock, setIsLoadingStock] = useState(false);

    // Estado do Modo 1: Volumes Fechados (LPNs selecionados)
    const [selectedHuIds, setSelectedHuIds] = useState(new Set());
    const [expandedGroupIdx, setExpandedGroupIdx] = useState({});

    // Estado do Modo 2: Fracionado
    const [fractionalQuantity, setFractionalQuantity] = useState('');

    // Carrinho da Ordem de Saída (Itens Adicionados)
    const [cartItems, setCartItems] = useState([]);

    // 1. Carrega o Cabeçalho da Ordem e o Catálogo do Depositante
    useEffect(() => {
        if (!orderId) return;

        const loadOrderAndProducts = async () => {
            try {
                setIsLoadingOrder(true);
                const orderData = await customInstance({ url: `/api/outbound/orders/${orderId}`, method: 'GET' });
                setOrder(orderData);

                if (orderData?.customerId) {
                    const productsRes = await customInstance({
                        url: `/api/products?CustomerId=${orderData.customerId}&PageSize=500`,
                        method: 'GET'
                    });
                    setProducts(productsRes?.items || []);
                }
            } catch (err) {
                toast.error('Erro ao carregar informações da ordem de saída.');
            } finally {
                setIsLoadingOrder(false);
            }
        };

        loadOrderAndProducts();
    }, [orderId]);

    // 2. Carrega o estoque disponível por Nota/Lote quando um produto é selecionado
    useEffect(() => {
        if (!orderId || !selectedProductId) {
            setAvailableStockData(null);
            setSelectedHuIds(new Set());
            setFractionalQuantity('');
            return;
        }

        const loadAvailableStock = async () => {
            try {
                setIsLoadingStock(true);
                const stockData = await customInstance({
                    url: `/api/outbound/orders/${orderId}/available-stock/${selectedProductId}`,
                    method: 'GET'
                });
                setAvailableStockData(stockData);

                // Expande o primeiro grupo por padrão
                if (stockData?.receiptGroups?.length > 0) {
                    setExpandedGroupIdx({ 0: true });
                }
            } catch {
                toast.error('Erro ao consultar estoque disponível do produto.');
            } finally {
                setIsLoadingStock(false);
            }
        };

        loadAvailableStock();
    }, [orderId, selectedProductId]);

    // 3. Cálculos de Capacidade em Tempo Real (Peso + Limite de Tipos de Volume)
    const capacityMetrics = useMemo(() => {
        const totalGrossWeight = cartItems.reduce((acc, item) => acc + (item.totalWeightKg || 0), 0);

        // Agrupamento por tipo de volume (PAL, CX, SAC, etc.)
        const volumeCountsByType = {};
        cartItems.forEach(item => {
            if (item.packagingsCount) {
                Object.entries(item.packagingsCount).forEach(([type, count]) => {
                    volumeCountsByType[type] = (volumeCountsByType[type] || 0) + count;
                });
            }
        });

        const limits = availableStockData?.limits || order?.customerLimits || { maxWeightKg: 13000, packagingTypeLimits: {} };
        const maxWeight = limits.maxWeightKg || 13000;
        const weightPercent = Math.min(100, (totalGrossWeight / maxWeight) * 100);

        return {
            totalGrossWeight,
            maxWeight,
            weightPercent,
            volumeCountsByType,
            packagingTypeLimits: limits.packagingTypeLimits || {}
        };
    }, [cartItems, availableStockData, order]);

    // Alternar seleção de HU no Modo 1 (Volumes Fechados)
    const toggleHuSelection = (hu) => {
        setSelectedHuIds(prev => {
            const next = new Set(prev);
            if (next.has(hu.handlingUnitId)) {
                next.delete(hu.handlingUnitId);
            } else {
                next.add(hu.handlingUnitId);
            }
            return next;
        });
    };

    // Alternar colapso dos grupos de Notas/Lotes
    const toggleGroupExpand = (idx) => {
        setExpandedGroupIdx(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    // Adicionar Volumes Fechados ao Carrinho
    const handleAddClosedVolumesToCart = () => {
        if (selectedHuIds.size === 0) return toast.warning('Selecione ao menos um volume/palete.');

        // Coleta todos os HUs selecionados nos grupos de estoque
        const allHus = availableStockData.receiptGroups.flatMap(g => g.availableHus);
        const selectedHus = allHus.filter(h => selectedHuIds.has(h.handlingUnitId));

        const totalQty = selectedHus.reduce((acc, h) => acc + h.currentQuantity, 0);
        const totalWeight = selectedHus.reduce((acc, h) => acc + h.grossWeight, 0);

        // Contagem de embalagens selecionadas
        const packCounts = {};
        selectedHus.forEach(h => {
            const type = h.packagingTypeCode || 'VOL';
            packCounts[type] = (packCounts[type] || 0) + 1;
        });

        const newItem = {
            id: `ITEM-${Date.now()}`,
            productId: availableStockData.productId,
            sku: availableStockData.sku,
            description: availableStockData.description,
            baseUnit: availableStockData.baseUnit,
            mode: 'CLOSED_VOLUMES',
            totalQuantity: totalQty,
            totalWeightKg: totalWeight,
            packagingsCount: packCounts,
            selectedHus: selectedHus.map(h => ({ id: h.handlingUnitId, lpn: h.Lpn, qty: h.currentQuantity }))
        };

        setCartItems(prev => [...prev, newItem]);
        setSelectedHuIds(new Set());
        setSelectedProductId('');
        toast.success(`${selectedHus.length} volume(s) fechado(s) adicionado(s) ao pedido.`);
    };

    // Adicionar Fracionado ao Carrinho (Simulação com Abate FIFO/FEFO)
    const handleAddFractionalToCart = () => {
        const qtyNum = parseFloat(fractionalQuantity);
        if (isNaN(qtyNum) || qtyNum <= 0) return toast.warning('Informe uma quantidade válida.');

        // Peso estimado proporcional
        const allHus = availableStockData.receiptGroups.flatMap(g => g.availableHus);
        const totalAvailableQty = allHus.reduce((acc, h) => acc + h.currentQuantity, 0);

        if (qtyNum > totalAvailableQty) {
            return toast.error(`Quantidade informada (${qtyNum} ${availableStockData.baseUnit}) excede o estoque livre disponível (${totalAvailableQty}).`);
        }

        const avgUnitWeight = allHus.length > 0 ? (allHus.reduce((acc, h) => acc + h.grossWeight, 0) / totalAvailableQty) : 0.5;
        const estimatedWeight = Math.round(qtyNum * avgUnitWeight * 100) / 100;

        const newItem = {
            id: `ITEM-${Date.now()}`,
            productId: availableStockData.productId,
            sku: availableStockData.sku,
            description: availableStockData.description,
            baseUnit: availableStockData.baseUnit,
            mode: 'FRACTIONAL',
            totalQuantity: qtyNum,
            totalWeightKg: estimatedWeight,
            packagingsCount: { FRAC: 1 },
            selectedHus: []
        };

        setCartItems(prev => [...prev, newItem]);
        setFractionalQuantity('');
        setSelectedProductId('');
        toast.success(`Quantidade fracionada de ${qtyNum} ${availableStockData.baseUnit} adicionada ao pedido.`);
    };

    const handleRemoveCartItem = (itemId) => {
        setCartItems(prev => prev.filter(i => i.id !== itemId));
    };

    // Submissão Final do Pedido de Saída com Itens
    const handleConfirmOrderItems = async () => {
        if (cartItems.length === 0) return toast.warning('Adicione ao menos um item ao pedido antes de salvar.');

        try {
            setIsSaving(true);
            const payloadItems = cartItems.map((item, idx) => ({
                productId: item.productId,
                lineNumber: idx + 1,
                quantity: item.totalQuantity,
                unitValue: 0
            }));

            await customInstance({
                url: `/api/outbound/orders/${orderId}/items/batch`,
                method: 'POST',
                data: { items: payloadItems }
            });

            toast.success('Itens da ordem de saída salvos com sucesso!');
            navigate('/outbound');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar itens do pedido.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoadingOrder) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full py-20 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando painel de itens do pedido...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/outbound')} className="shrink-0 text-slate-500 hover:text-slate-900">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ordem #{order?.orderNumber}</h1>
                            <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">Montagem de Saída</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong>{order?.customerName}</strong> | Destino: <strong>{order?.destinationName || 'Retorno Depositante'}</strong>
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/outbound')} disabled={isSaving}>Cancelar</Button>
                    <Button
                        onClick={handleConfirmOrderItems}
                        disabled={isSaving || cartItems.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold min-w-[160px]"
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Confirmar Pedido
                    </Button>
                </div>
            </div>

            {/* PROGRESSÔMETRO DE CAPACIDADE DO VEÍCULO */}
            <Card className="border-slate-200/80 shadow-xs bg-white shrink-0">
                <CardHeader className="pb-2 pt-4 px-5 border-b border-slate-100 bg-slate-50/50">
                    <CardTitle className="text-xs uppercase font-bold text-slate-700 flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Scale className="text-orange-600" size={16} /> Balizador de Capacidade do Transporte</span>
                        <span className="font-mono text-slate-600 text-[11px]">{capacityMetrics.totalGrossWeight.toLocaleString('pt-BR')} / {capacityMetrics.maxWeight.toLocaleString('pt-BR')} KG</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-600">Ocupação de Peso Bruto</span>
                            <span className={capacityMetrics.weightPercent > 100 ? "text-rose-600 font-bold" : "text-emerald-700 font-bold"}>
                                {capacityMetrics.weightPercent.toFixed(1)}% {capacityMetrics.weightPercent > 100 && '(Excesso de Carga!)'}
                            </span>
                        </div>
                        <Progress value={capacityMetrics.weightPercent} className="h-2" />
                    </div>

                    {/* LIMITES POR TIPO DE VOLUME */}
                    <div className="flex flex-wrap gap-4 pt-1">
                        {Object.entries(capacityMetrics.packagingTypeLimits).map(([type, maxLimit]) => {
                            const current = capacityMetrics.volumeCountsByType[type] || 0;
                            const isOver = current > maxLimit;
                            return (
                                <div key={type} className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${isOver ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                    <Box size={14} className={isOver ? 'text-rose-600' : 'text-slate-400'} />
                                    <span className="font-bold">{type}:</span>
                                    <span className="font-mono">{current} / {maxLimit} Vol.</span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* SELEÇÃO DE MODO E SELEÇÃO DE PRODUTO */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* COLUNA ESQUERDA/CENTRAL: MONTADOR DE ITENS */}
                <div className="lg:col-span-2 flex flex-col space-y-4 min-h-0">
                    <Card className="border-slate-200/80 shadow-xs bg-white shrink-0">
                        <CardContent className="p-4 space-y-4">
                            {/* CHAVE DE MODO */}
                            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setMode('CLOSED_VOLUMES')}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${mode === 'CLOSED_VOLUMES' ? 'bg-white text-orange-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                    <Box size={15} className="text-orange-600" /> Volumes Fechados (Paletes/Caixas)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('FRACTIONAL')}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${mode === 'FRACTIONAL' ? 'bg-white text-purple-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                >
                                    <Scissors size={15} className="text-purple-600" /> Fracionado (Unidade Base)
                                </button>
                            </div>

                            {/* SELETOR DE PRODUTO DO DEPOSITANTE */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-800">Selecione o Produto *</Label>
                                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                                    <SelectTrigger className="bg-white text-xs">
                                        <SelectValue placeholder="Escolha um SKU para consultar o estoque..." />
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

                    {/* CONTEÚDO DO MODO SELECIONADO */}
                    <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
                        {isLoadingStock ? (
                            <div className="p-12 text-center bg-white border rounded-xl space-y-2">
                                <Loader2 className="h-6 w-6 animate-spin text-orange-600 mx-auto" />
                                <p className="text-xs text-slate-500 font-medium">Buscando notas e lotes em estoque...</p>
                            </div>
                        ) : !selectedProductId ? (
                            <div className="p-12 text-center bg-white border border-dashed rounded-xl space-y-2 text-slate-400 text-xs">
                                <Layers size={32} className="mx-auto text-slate-300" />
                                <p>Selecione um produto acima para consultar as notas de entrada e lotes disponíveis.</p>
                            </div>
                        ) : mode === 'CLOSED_VOLUMES' ? (
                            /* VISÃO MODO 1: VOLUMES FECHADOS POR NOTA / LOTE */
                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                                        Estratégia: <Badge variant="outline" className="text-orange-700 bg-orange-50 font-mono">{availableStockData?.pickingStrategy}</Badge>
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono">
                                        {selectedHuIds.size} volume(s) selecionado(s)
                                    </span>
                                </div>

                                {availableStockData?.receiptGroups?.length === 0 ? (
                                    <div className="p-8 text-center bg-white border rounded-xl text-xs text-slate-500">
                                        Nenhum estoque disponível/liberado para este produto.
                                    </div>
                                ) : (
                                    availableStockData?.receiptGroups?.map((group, gIdx) => {
                                        const isExpanded = !!expandedGroupIdx[gIdx];
                                        return (
                                            <div key={gIdx} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs">
                                                {/* CABEÇALHO DO GRUPO (NOTA / LOTE) */}
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroupExpand(gIdx)}
                                                    className="w-full p-3 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors border-b border-slate-100"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                                        <FileText size={16} className="text-orange-600" />
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-xs text-slate-900 font-mono">Lote: {group.batch}</span>
                                                                {group.expirationDate && (
                                                                    <span className="text-[10px] text-amber-700 font-mono bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                                                        Val: {new Date(group.expirationDate).toLocaleDateString('pt-BR')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[11px] text-slate-500">Entrada: {new Date(group.receiptDate).toLocaleDateString('pt-BR')}</span>
                                                        </div>
                                                    </div>
                                                    <Badge variant="secondary" className="text-xs font-mono">
                                                        {group.availableHus?.length} Volume(s)
                                                    </Badge>
                                                </button>

                                                {/* TABELA DE LPNS / VOLUMES */}
                                                {isExpanded && (
                                                    <div className="p-2 bg-white">
                                                        <Table>
                                                            <TableHeader className="bg-slate-50">
                                                                <TableRow>
                                                                    <TableHead className="w-10 text-center"></TableHead>
                                                                    <TableHead>LPN / Código</TableHead>
                                                                    <TableHead>Tipo Vol.</TableHead>
                                                                    <TableHead>Qtd Unidades</TableHead>
                                                                    <TableHead>Peso Bruto</TableHead>
                                                                    <TableHead className="text-right">Localização</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {group.availableHus?.map(hu => {
                                                                    const isChecked = selectedHuIds.has(hu.handlingUnitId);
                                                                    return (
                                                                        <TableRow
                                                                            key={hu.handlingUnitId}
                                                                            onClick={() => toggleHuSelection(hu)}
                                                                            className={`cursor-pointer transition-colors ${isChecked ? 'bg-orange-50/60' : 'hover:bg-slate-50/50'}`}
                                                                        >
                                                                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isChecked}
                                                                                    onChange={() => toggleHuSelection(hu)}
                                                                                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4 w-4 cursor-pointer"
                                                                                />
                                                                            </TableCell>
                                                                            <TableCell className="font-mono font-bold text-xs text-slate-900">{hu.lpn}</TableCell>
                                                                            <TableCell><Badge variant="outline" className="text-[10px] font-mono">{hu.packagingTypeCode}</Badge></TableCell>
                                                                            <TableCell className="font-mono text-xs">{hu.currentQuantity} {availableStockData.baseUnit}</TableCell>
                                                                            <TableCell className="font-mono text-xs">{hu.grossWeight} KG</TableCell>
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
                                    })
                                )}

                                {selectedHuIds.size > 0 && (
                                    <Button
                                        onClick={handleAddClosedVolumesToCart}
                                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-10 shadow-2xs"
                                    >
                                        <Plus size={16} className="mr-1.5" /> Adicionar {selectedHuIds.size} Volume(s) Fechado(s) ao Pedido
                                    </Button>
                                )}
                            </div>
                        ) : (
                            /* VISÃO MODO 2: FRACIONADO */
                            <Card className="border-purple-200 bg-purple-50/30 p-5 space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-purple-900">Quantidade Desejada na Unidade Base ({availableStockData?.baseUnit}) *</Label>
                                    <div className="flex gap-3">
                                        <Input
                                            type="number"
                                            step="0.0001"
                                            placeholder={`Ex: 1350 ${availableStockData?.baseUnit}`}
                                            value={fractionalQuantity}
                                            onChange={(e) => setFractionalQuantity(e.target.value)}
                                            className="bg-white font-mono text-sm h-10 border-purple-300 focus-visible:ring-purple-500"
                                        />
                                        <Button
                                            onClick={handleAddFractionalToCart}
                                            disabled={!fractionalQuantity || parseFloat(fractionalQuantity) <= 0}
                                            className="bg-purple-700 hover:bg-purple-800 text-white font-bold h-10 px-6 shrink-0"
                                        >
                                            <Plus size={16} className="mr-1.5" /> Adicionar Fracionado
                                        </Button>
                                    </div>
                                </div>

                                <div className="p-3 bg-white border border-purple-200 rounded-lg text-xs space-y-1 text-slate-600">
                                    <p className="font-bold text-purple-900 flex items-center gap-1.5">
                                        <Scissors size={14} className="text-purple-600" /> Regra Automática de Abate (FIFO/FEFO):
                                    </p>
                                    <p>O WMS alocará primeiro os paletes/caixas fechadas necessárias e gerará a quebra automática do saldo restante na mesa de separação.</p>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>

                {/* COLUNA DIREITA: CARRINHO DA ORDEM DE SAÍDA */}
                <Card className="border-slate-200/80 shadow-xs bg-white flex flex-col min-h-0">
                    <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                        <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                            <span className="flex items-center gap-2"><PackageCheck size={18} className="text-emerald-600" /> Carrinho do Pedido</span>
                            <Badge variant="secondary" className="font-mono">{cartItems.length} Item(ns)</Badge>
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="p-4 flex-1 overflow-y-auto space-y-3 min-h-0">
                        {cartItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                                <Box size={36} className="text-slate-300" />
                                <p className="text-xs">Nenhum item adicionado ao pedido ainda.</p>
                            </div>
                        ) : (
                            cartItems.map((item) => (
                                <div key={item.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50/60 space-y-2 relative">
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveCartItem(item.id)}
                                        className="absolute top-2 right-2 text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>

                                    <div className="pr-6">
                                        <span className="font-mono font-bold text-xs text-slate-900 block">{item.sku}</span>
                                        <span className="text-[11px] text-slate-500 truncate block">{item.description}</span>
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                                        <Badge className={item.mode === 'CLOSED_VOLUMES' ? 'bg-orange-100 text-orange-800 border-orange-200 text-[10px]' : 'bg-purple-100 text-purple-800 border-purple-200 text-[10px]'}>
                                            {item.mode === 'CLOSED_VOLUMES' ? 'Fechado' : 'Fracionado'}
                                        </Badge>
                                        <div className="text-right font-mono">
                                            <span className="font-bold text-slate-800 block">{item.totalQuantity} {item.baseUnit}</span>
                                            <span className="text-[10px] text-slate-500">{item.totalWeightKg} KG</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}