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
    ArrowLeft, Box, Scissors, PackageCheck, Loader2, Plus,
    Trash2, Layers, FileText, ChevronRight, ChevronDown, Save, ShoppingCart, Info, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundItemsPanelPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    // Dados Principais
    const [order, setOrder] = useState(null);
    const [products, setProducts] = useState([]);
    const [isLoadingOrder, setIsLoadingOrder] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Seletor de Modo e Produto
    const [mode, setMode] = useState('CLOSED_VOLUMES'); // 'CLOSED_VOLUMES' | 'FRACTIONAL'
    const [selectedProductId, setSelectedProductId] = useState('');
    const [availableStockData, setAvailableStockData] = useState(null);
    const [isLoadingStock, setIsLoadingStock] = useState(false);

    // Estado Modo 1: Volumes Fechados (LPNs selecionados por Checkbox)
    const [selectedHuIds, setSelectedHuIds] = useState(new Set());
    const [expandedGroupIdx, setExpandedGroupIdx] = useState({});

    // Estado Modo 2: Fracionado
    const [fractionalQuantity, setFractionalQuantity] = useState('');

    // Carrinho da Ordem de Saída
    const [cartItems, setCartItems] = useState([]);

    // 1. Carrega dados da Ordem e lista de Produtos
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
            } catch {
                toast.error('Erro ao carregar dados da ordem de saída.');
            } finally {
                setIsLoadingOrder(false);
            }
        };

        loadOrderAndProducts();
    }, [orderId]);

    // 2. Carrega Estoque Disponível quando o Produto é selecionado
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

    // Cálculo da Simulação de Abate para o Modo Fracionado
    const fractionalSimulation = useMemo(() => {
        if (mode !== 'FRACTIONAL' || !fractionalQuantity || !availableStockData) return null;

        const targetQty = parseFloat(fractionalQuantity);
        if (isNaN(targetQty) || targetQty <= 0) return null;

        let remaining = targetQty;
        let closedHusCount = 0;
        let closedQty = 0;
        let fractionalHu = null;
        let totalWeightKg = 0;

        const allHus = availableStockData.receiptGroups.flatMap(g => g.availableHus);

        for (const hu of allHus) {
            if (remaining <= 0) break;

            if (hu.currentQuantity <= remaining) {
                // Consome a HU inteira como volume fechado
                closedHusCount++;
                closedQty += hu.currentQuantity;
                remaining -= hu.currentQuantity;
                totalWeightKg += hu.grossWeight;
            } else {
                // Fraciona a última HU
                const fracTake = remaining;
                const ratio = fracTake / hu.currentQuantity;
                totalWeightKg += Math.round(hu.grossWeight * ratio * 100) / 100;

                fractionalHu = {
                    lpn: hu.lpn,
                    qty: fracTake
                };
                remaining = 0;
            }
        }

        return {
            targetQty,
            closedHusCount,
            closedQty,
            fractionalHu,
            totalWeightKg,
            isPossible: remaining === 0,
            shortageQty: remaining
        };
    }, [mode, fractionalQuantity, availableStockData]);

    // Alternar Checkbox do LPN no Modo 1
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

    const toggleGroupExpand = (idx) => {
        setExpandedGroupIdx(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    // Adicionar Volumes Fechados ao Carrinho
    const handleAddClosedVolumesToCart = () => {
        if (selectedHuIds.size === 0) return toast.warning('Selecione ao menos um volume.');

        const allHus = availableStockData.receiptGroups.flatMap(g => g.availableHus);
        const selectedHus = allHus.filter(h => selectedHuIds.has(h.handlingUnitId));

        const totalQty = selectedHus.reduce((acc, h) => acc + h.currentQuantity, 0);
        const totalWeight = selectedHus.reduce((acc, h) => acc + h.grossWeight, 0);

        const newItem = {
            id: `ITEM-${Date.now()}`,
            productId: availableStockData.productId,
            sku: availableStockData.sku,
            description: availableStockData.description,
            baseUnit: availableStockData.baseUnit,
            mode: 'CLOSED_VOLUMES',
            totalQuantity: totalQty,
            totalWeightKg: totalWeight,
            summaryText: `${selectedHus.length} Vol. Fechado(s)`,
            selectedHus: selectedHus.map(h => ({ id: h.handlingUnitId, lpn: h.lpn, qty: h.currentQuantity }))
        };

        setCartItems(prev => [...prev, newItem]);
        setSelectedHuIds(new Set());
        setSelectedProductId('');
        toast.success(`${selectedHus.length} volume(s) fechado(s) adicionado(s) ao carrinho.`);
    };

    // Adicionar Fracionado ao Carrinho
    const handleAddFractionalToCart = () => {
        if (!fractionalSimulation || !fractionalSimulation.isPossible) {
            return toast.error('Quantidade excede o estoque livre disponível.');
        }

        let summaryText = '';
        if (fractionalSimulation.closedHusCount > 0 && fractionalSimulation.fractionalHu) {
            summaryText = `${fractionalSimulation.closedHusCount} Vol. Fechado(s) + ${fractionalSimulation.fractionalHu.qty} ${availableStockData.baseUnit} Frac.`;
        } else if (fractionalSimulation.closedHusCount > 0) {
            summaryText = `${fractionalSimulation.closedHusCount} Vol. Fechado(s)`;
        } else {
            summaryText = `${fractionalSimulation.fractionalHu.qty} ${availableStockData.baseUnit} Fracionado`;
        }

        const newItem = {
            id: `ITEM-${Date.now()}`,
            productId: availableStockData.productId,
            sku: availableStockData.sku,
            description: availableStockData.description,
            baseUnit: availableStockData.baseUnit,
            mode: 'FRACTIONAL',
            totalQuantity: fractionalSimulation.targetQty,
            totalWeightKg: fractionalSimulation.totalWeightKg,
            summaryText,
            selectedHus: []
        };

        setCartItems(prev => [...prev, newItem]);
        setFractionalQuantity('');
        setSelectedProductId('');
        toast.success(`Fracionado de ${fractionalSimulation.targetQty} ${availableStockData.baseUnit} adicionado ao carrinho.`);
    };

    const handleRemoveCartItem = (itemId) => {
        setCartItems(prev => prev.filter(i => i.id !== itemId));
    };

    // Salvar Ordem com Itens
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

            toast.success('Pedido montado com sucesso!');
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
                <p className="text-xs text-slate-500 font-medium">Carregando painel da ordem de saída...</p>
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
                            <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">Montagem de Itens</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong className="text-slate-700">{order?.customerName}</strong>
                        </p>
                    </div>
                </div>
            </div>

            {/* SELEÇÃO DO MODO DE EXPEDIÇÃO */}
            <Card className="border-slate-200/80 shadow-xs bg-white shrink-0">
                <CardContent className="p-4 space-y-3">
                    <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                        Seleção do Modo de Expedição:
                    </Label>
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

                    {/* SELETOR DE PRODUTO */}
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

            {/* ÁREA CENTRAL MODO 1 / MODO 2 */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
                {isLoadingStock ? (
                    <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-2">
                        <Loader2 className="h-6 w-6 animate-spin text-orange-600 mx-auto" />
                        <p className="text-xs text-slate-500 font-medium">Buscando notas e lotes em estoque...</p>
                    </div>
                ) : !selectedProductId ? (
                    <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-xl space-y-2 text-slate-400 text-xs">
                        <Layers size={32} className="mx-auto text-slate-300" />
                        <p>Selecione um produto acima para carregar o estoque disponível por Nota/Lote.</p>
                    </div>
                ) : mode === 'CLOSED_VOLUMES' ? (
                    /* === MODO 1: VOLUMES FECHADOS === */
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                                Regra: <Badge variant="outline" className="text-orange-700 bg-orange-50 font-mono text-[11px]">{availableStockData?.pickingStrategy} Prioritário</Badge>
                            </span>
                            <span className="text-xs text-slate-500 font-mono font-semibold">
                                {selectedHuIds.size} volume(s) selecionado(s)
                            </span>
                        </div>

                        {availableStockData?.receiptGroups?.length === 0 ? (
                            <div className="p-8 text-center bg-white border rounded-xl text-xs text-slate-500">
                                Nenhum volume em estoque para este produto.
                            </div>
                        ) : (
                            availableStockData?.receiptGroups?.map((group, gIdx) => {
                                const isExpanded = !!expandedGroupIdx[gIdx];
                                return (
                                    <div key={gIdx} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs">
                                        {/* CABEÇALHO DO GRUPO / NOTA / LOTE */}
                                        <button
                                            type="button"
                                            onClick={() => toggleGroupExpand(gIdx)}
                                            className="w-full p-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left transition-colors border-b border-slate-100"
                                        >
                                            <div className="flex items-center gap-3">
                                                {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                                <FileText size={16} className="text-orange-600" />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-xs text-slate-900 font-mono">Nota / Lote: {group.batch}</span>
                                                        {group.expirationDate && (
                                                            <span className="text-[10px] text-amber-700 font-mono bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                                                Validade: {new Date(group.expirationDate).toLocaleDateString('pt-BR')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[11px] text-slate-500">Data de Entrada: {new Date(group.receiptDate).toLocaleDateString('pt-BR')}</span>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className="text-xs font-mono">
                                                {group.availableHus?.length} Volume(s)
                                            </Badge>
                                        </button>

                                        {/* LISTA DE LPNS COM CHECKBOX */}
                                        {isExpanded && (
                                            <div className="p-2 bg-white">
                                                <Table>
                                                    <TableHeader className="bg-slate-50">
                                                        <TableRow>
                                                            <TableHead className="w-10 text-center"></TableHead>
                                                            <TableHead>LPN</TableHead>
                                                            <TableHead>Tipo Vol.</TableHead>
                                                            <TableHead>Quantidade</TableHead>
                                                            <TableHead>Peso Bruto</TableHead>
                                                            <TableHead className="text-right">Posição</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {group.availableHus?.map(hu => {
                                                            const isChecked = selectedHuIds.has(hu.handlingUnitId);
                                                            return (
                                                                <TableRow
                                                                    key={hu.handlingUnitId}
                                                                    onClick={() => toggleHuSelection(hu)}
                                                                    className={`cursor-pointer transition-colors ${isChecked ? 'bg-orange-50/70 font-medium' : 'hover:bg-slate-50/60'}`}
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
                                <Plus size={16} className="mr-1.5" /> Adicionar {selectedHuIds.size} Volume(s) ao Carrinho
                            </Button>
                        )}
                    </div>
                ) : (
                    /* === MODO 2: FRACIONADO === */
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
                                    className="bg-white font-mono text-sm h-10 border-purple-300 focus-visible:ring-purple-500"
                                />
                                <Button
                                    onClick={handleAddFractionalToCart}
                                    disabled={!fractionalSimulation || !fractionalSimulation.isPossible}
                                    className="bg-purple-700 hover:bg-purple-800 text-white font-bold h-10 px-6 shrink-0"
                                >
                                    <Plus size={16} className="mr-1.5" /> Adicionar Fracionado
                                </Button>
                            </div>
                        </div>

                        {/* CAIXA DE CÁLCULO DE ABATE AUTOMÁTICO */}
                        {fractionalSimulation && (
                            <div className="p-4 bg-white border border-purple-200 rounded-xl space-y-2 text-xs">
                                <p className="font-bold text-purple-900 flex items-center gap-1.5">
                                    <Sparkles size={15} className="text-purple-600" /> Cálculo de Abate Automático ({availableStockData?.pickingStrategy}):
                                </p>
                                {fractionalSimulation.isPossible ? (
                                    <ul className="space-y-1 text-slate-700 pl-5 list-disc font-medium">
                                        {fractionalSimulation.closedHusCount > 0 && (
                                            <li>Consumirá <strong>{fractionalSimulation.closedHusCount} Volume(s) Fechado(s)</strong> ({fractionalSimulation.closedQty} {availableStockData.baseUnit})</li>
                                        )}
                                        {fractionalSimulation.fractionalHu && (
                                            <li>Fracionará <strong>1 Volume</strong> ({fractionalSimulation.fractionalHu.qty} {availableStockData.baseUnit} retiradas do LPN: <strong>{fractionalSimulation.fractionalHu.lpn}</strong>)</li>
                                        )}
                                        <li className="text-purple-800 font-bold pt-1">Peso Estimado Total: {fractionalSimulation.totalWeightKg} KG</li>
                                    </ul>
                                ) : (
                                    <p className="text-rose-600 font-semibold">
                                        Estoque insuficiente. Faltam {fractionalSimulation.shortageQty} {availableStockData.baseUnit}.
                                    </p>
                                )}
                            </div>
                        )}
                    </Card>
                )}
            </div>

            {/* CARRINHO DA ORDEM DE SAÍDA (INFERIOR) */}
            <Card className="border-slate-200/80 shadow-xs bg-white shrink-0">
                <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/50">
                    <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                        <span className="flex items-center gap-2"><ShoppingCart size={18} className="text-orange-600" /> Carrinho da Ordem de Saída (Itens Selecionados)</span>
                        <Badge variant="secondary" className="font-mono">{cartItems.length} Item(ns)</Badge>
                    </CardTitle>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                    {cartItems.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-xs border border-dashed rounded-lg bg-slate-50">
                            Nenhum item adicionado ao carrinho ainda.
                        </div>
                    ) : (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>SKU / Descrição</TableHead>
                                        <TableHead>Quantidade</TableHead>
                                        <TableHead>Composição de Volumes</TableHead>
                                        <TableHead>Peso Total</TableHead>
                                        <TableHead className="w-12 text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {cartItems.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-mono font-bold text-slate-900 text-xs">{item.sku}</span>
                                                    <span className="text-[11px] text-slate-500 truncate max-w-[280px]">{item.description}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono font-bold text-xs text-slate-900">
                                                {item.totalQuantity} {item.baseUnit}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={item.mode === 'CLOSED_VOLUMES' ? 'bg-orange-100 text-orange-800 border-orange-200 text-[11px]' : 'bg-purple-100 text-purple-800 border-purple-200 text-[11px]'}>
                                                    {item.summaryText}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-slate-700">
                                                {item.totalWeightKg} KG
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    type="button" variant="ghost" size="sm"
                                                    onClick={() => handleRemoveCartItem(item.id)}
                                                    className="text-slate-400 hover:text-rose-600 p-1"
                                                >
                                                    <Trash2 size={15} />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <Button
                            onClick={handleConfirmOrderItems}
                            disabled={isSaving || cartItems.length === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-8 shadow-xs"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Confirmar Pedido 🚀
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}