import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import {
    ArrowLeft, Box, Scissors, Loader2, Plus, Trash2, Layers,
    FileText, ChevronRight, ChevronDown, CheckCircle2, ShoppingCart,
    CheckSquare, Square, Search, X, Barcode, Package, DollarSign
} from 'lucide-react';
import { toast } from 'sonner';

// Seletor Pesquisável Moderno de Produtos (SKU, EAN ou Descrição)
function SearchableProductSelect({ value, onChange, products, placeholder = "Pesquise por SKU, EAN/Código de barras ou Descrição..." }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef(null);

    const selectedProduct = products.find(p => p.id === value);

    const filteredProducts = useMemo(() => {
        if (!searchTerm) return products.slice(0, 35);
        const term = searchTerm.toLowerCase();
        const termDigits = searchTerm.replace(/\D/g, '');
        return products.filter(p =>
            p.sku?.toLowerCase().includes(term) ||
            p.description?.toLowerCase().includes(term) ||
            (termDigits && p.baseBarcode?.includes(termDigits))
        ).slice(0, 35);
    }, [products, searchTerm]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative w-full z-40">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full h-11 px-3 text-xs bg-white border rounded-xl flex items-center justify-between text-left transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${value ? 'border-orange-400 font-semibold text-slate-900 shadow-2xs' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
            >
                <div className="flex items-center gap-2 truncate">
                    {selectedProduct ? (
                        <>
                            <span className="font-mono font-bold text-orange-950 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                                {selectedProduct.sku}
                            </span>
                            <span className="truncate text-slate-700">{selectedProduct.description}</span>
                            {selectedProduct.baseBarcode && (
                                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                                    (EAN: {selectedProduct.baseBarcode})
                                </span>
                            )}
                        </>
                    ) : (
                        <span>{placeholder}</span>
                    )}
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                    {value && (
                        <X
                            size={14}
                            className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange('');
                            }}
                        />
                    )}
                    <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-2 space-y-2 animate-in fade-in duration-150">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Digitar código SKU, código de barras EAN ou nome..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-orange-500 font-sans"
                        />
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                        {filteredProducts.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400 italic">
                                Nenhum produto encontrado com o termo informado.
                            </div>
                        ) : (
                            filteredProducts.map(prod => (
                                <div
                                    key={prod.id}
                                    onClick={() => {
                                        onChange(prod.id);
                                        setIsOpen(false);
                                        setSearchTerm('');
                                    }}
                                    className={`px-3 py-2.5 rounded-lg text-xs cursor-pointer flex items-center justify-between transition-colors ${value === prod.id ? 'bg-orange-50 text-orange-950 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                        }`}
                                >
                                    <div className="flex flex-col gap-0.5 truncate pr-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-slate-900">{prod.sku}</span>
                                            <Badge variant="outline" className="text-[10px] font-mono py-0">{prod.baseUnit || 'UN'}</Badge>
                                            {prod.baseBarcode && (
                                                <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5">
                                                    <Barcode size={10} /> {prod.baseBarcode}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[11px] text-slate-500 truncate">{prod.description}</span>
                                    </div>
                                    {value === prod.id && <CheckCircle2 size={15} className="text-orange-600 shrink-0" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

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

    // Filtro rápido de HU na lista aberta
    const [huFilterTerm, setHuFilterTerm] = useState('');

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
            setHuFilterTerm('');
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

    // Cálculo das peças totais selecionadas nas HUs ativas
    const selectedClosedStats = useMemo(() => {
        if (!availableStockData?.receiptGroups || selectedHuIds.size === 0) return { count: 0, pieces: 0 };
        let pieces = 0;
        availableStockData.receiptGroups.forEach(g => {
            g.availableHus?.forEach(h => {
                if (selectedHuIds.has(h.handlingUnitId)) {
                    pieces += Number(h.currentQuantity) || 0;
                }
            });
        });
        return { count: selectedHuIds.size, pieces };
    }, [availableStockData, selectedHuIds]);

    // Resumo Agregado dos Itens Gravados na Ordem de Saída
    const orderItemsSummary = useMemo(() => {
        if (!order?.items || order.items.length === 0) {
            return { totalSkus: 0, totalUnits: 0, totalValue: 0, skuBreakdown: [] };
        }

        const totalSkus = order.items.length;
        let totalUnits = 0;
        let totalValue = 0;

        const skuBreakdown = order.items.map(item => {
            const qty = Number(item.allocatedQuantity) || Number(item.expectedQuantity) || 0;
            const unitVal = Number(item.inboundUnitValue) || Number(item.unitValue) || 0;
            const subtotal = qty * unitVal;

            totalUnits += qty;
            totalValue += subtotal;

            return {
                id: item.id,
                skuCode: item.skuCode,
                description: item.description,
                unit: item.unit || 'UN',
                quantity: qty,
                unitValue: unitVal,
                subtotal: subtotal,
                status: item.status
            };
        });

        return { totalSkus, totalUnits, totalValue, skuBreakdown };
    }, [order?.items]);

    if (isLoadingOrder) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full py-20 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando dados da ordem de saída...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-5 pb-16 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/60 rounded-xl p-4 shadow-xs">
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

                <Button onClick={() => navigate('/outbound')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-6 shadow-xs">
                    <CheckCircle2 size={16} className="mr-1.5" /> Concluir e Voltar
                </Button>
            </div>

            {/* SELEÇÃO DO MODO & PRODUTO PESQUISÁVEL */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3.5 relative z-30 overflow-visible">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                        Modo de Expedição:
                    </Label>
                    <span className="text-[11px] text-slate-400">
                        {mode === 'CLOSED_VOLUMES' ? 'Separação e conferência de paletes/caixas fechadas completas' : 'Separação fracionada com pesagem ou embalagem manual'}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-slate-100 p-1 rounded-xl">
                    <button
                        type="button"
                        onClick={() => { setMode('CLOSED_VOLUMES'); setSelectedProductId(''); }}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${mode === 'CLOSED_VOLUMES' ? 'bg-white text-orange-950 shadow-2xs ring-1 ring-slate-200/60' : 'text-slate-600 hover:text-slate-900'
                            }`}
                    >
                        <Box size={16} className="text-orange-600" /> 📦 Volumes Fechados (Paletes/Caixas)
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode('FRACTIONAL'); setSelectedProductId(''); }}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${mode === 'FRACTIONAL' ? 'bg-white text-purple-950 shadow-2xs ring-1 ring-slate-200/60' : 'text-slate-600 hover:text-slate-900'
                            }`}
                    >
                        <Scissors size={16} className="text-purple-600" /> ✂️ Fracionado (Unidade Base)
                    </button>
                </div>

                <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                        <Label className="text-xs font-bold text-slate-800">Localizar Produto no Catálogo *</Label>
                        <span className="text-[10px] text-slate-400 font-mono">{products.length} SKU(s) cadastrados</span>
                    </div>
                    <SearchableProductSelect
                        value={selectedProductId}
                        onChange={setSelectedProductId}
                        products={products}
                    />
                </div>
            </div>

            {/* PAINEL CENTRAL DE SELEÇÃO E ESTOQUE COM ALTURA DINÂMICA: 520PX P/ FECHADOS, 220PX P/ FRACIONADO E VAZIO */}
            <div className={`overflow-y-auto space-y-3 relative z-10 pr-1 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3 shadow-2xs transition-all duration-200 ${!selectedProductId
                ? 'h-[220px]'
                : mode === 'CLOSED_VOLUMES'
                    ? 'h-[520px]'
                    : 'h-[220px]'
                }`}>
                {isLoadingStock ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                        <Loader2 className="h-7 w-7 animate-spin text-orange-600 mx-auto" />
                        <p className="text-xs text-slate-600 font-medium">Consultando saldo livre em estoque em tempo real...</p>
                    </div>
                ) : !selectedProductId ? (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-white border border-dashed border-slate-300 rounded-xl space-y-2 text-slate-400 text-xs">
                        <Layers size={32} className="mx-auto text-slate-300" />
                        <p className="font-medium text-slate-600">Nenhum produto selecionado no catálogo</p>
                        <p className="text-[11px] text-slate-400 max-w-sm">
                            Selecione um produto no campo acima para carregar as etiquetas LPN, posições e lotes disponíveis no armazém.
                        </p>
                    </div>
                ) : mode === 'CLOSED_VOLUMES' ? (
                    <div className="space-y-3 pb-2">
                        {/* BARRA DE FILTRO RÁPIDO DE HU */}
                        <div className="bg-white p-3 border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                            <div className="flex items-center gap-2 flex-1 max-w-sm">
                                <Search size={14} className="text-slate-400" />
                                <Input
                                    placeholder="Filtrar por código LPN ou lote..."
                                    value={huFilterTerm}
                                    onChange={(e) => setHuFilterTerm(e.target.value)}
                                    className="h-8 text-xs bg-slate-50 border-slate-200 font-mono"
                                />
                            </div>
                            <span className="text-xs font-mono text-slate-500">
                                Estratégia do SKU: <strong className="text-slate-800">{availableStockData?.pickingStrategy || 'FIFO'}</strong>
                            </span>
                        </div>

                        {availableStockData?.receiptGroups?.map((group, gIdx) => {
                            const isExpanded = !!expandedGroupIdx[gIdx];

                            const filteredHus = group.availableHus?.filter(h => {
                                if (!huFilterTerm.trim()) return true;
                                const t = huFilterTerm.trim().toLowerCase();
                                return h.lpn?.toLowerCase().includes(t) || group.batch?.toLowerCase().includes(t);
                            }) || [];

                            if (filteredHus.length === 0 && huFilterTerm.trim()) return null;

                            const groupHuIds = filteredHus.map(h => h.handlingUnitId);
                            const isAllInGroupSelected = groupHuIds.length > 0 && groupHuIds.every(id => selectedHuIds.has(id));

                            return (
                                <div key={gIdx} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs">
                                    <div className="p-3 bg-slate-50 flex items-center justify-between border-b border-slate-100">
                                        <button type="button" onClick={() => setExpandedGroupIdx(prev => ({ ...prev, [gIdx]: !prev[gIdx] }))} className="flex items-center gap-3 text-left flex-1">
                                            {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                            <FileText size={16} className="text-orange-600" />
                                            <div>
                                                <span className="font-bold text-xs text-slate-900 font-mono">Nota / Lote: {group.batch}</span>
                                                <span className="text-[11px] text-slate-500 block">
                                                    Entrada: {new Date(group.receiptDate).toLocaleDateString('pt-BR')}
                                                    {group.expirationDate && ` | Validade: ${new Date(group.expirationDate).toLocaleDateString('pt-BR')}`}
                                                </span>
                                            </div>
                                        </button>
                                        <Button type="button" variant="outline" size="sm" onClick={() => toggleSelectAllInGroup(group)} className="h-7 text-xs bg-white">
                                            {isAllInGroupSelected ? <CheckSquare size={13} className="mr-1 text-orange-600" /> : <Square size={13} className="mr-1 text-slate-400" />}
                                            {isAllInGroupSelected ? 'Desmarcar Lote' : 'Selecionar Lote'}
                                        </Button>
                                    </div>

                                    {isExpanded && (
                                        <div className="p-2 bg-white">
                                            <Table>
                                                <TableHeader className="bg-slate-50">
                                                    <TableRow>
                                                        <TableHead className="w-10 text-center"></TableHead>
                                                        <TableHead>LPN / Volume</TableHead>
                                                        <TableHead>Tipo Embalagem</TableHead>
                                                        <TableHead>Quantidade Disponível</TableHead>
                                                        <TableHead className="text-right">Posição no Armazém</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {filteredHus.map(hu => {
                                                        const isChecked = selectedHuIds.has(hu.handlingUnitId);
                                                        return (
                                                            <TableRow
                                                                key={hu.handlingUnitId}
                                                                onClick={() => toggleHuSelection(hu.handlingUnitId)}
                                                                className={`cursor-pointer transition-colors ${isChecked ? 'bg-orange-50/70 font-medium' : 'hover:bg-slate-50'}`}
                                                            >
                                                                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        onChange={() => toggleHuSelection(hu.handlingUnitId)}
                                                                        className="rounded text-orange-600 h-4 w-4"
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="font-mono font-bold text-xs text-slate-900">{hu.lpn}</TableCell>
                                                                <TableCell><Badge variant="outline" className="text-[10px] font-mono">{hu.packagingTypeCode}</Badge></TableCell>
                                                                <TableCell className="font-mono text-xs font-semibold text-slate-800">
                                                                    {hu.currentQuantity} {availableStockData.baseUnit}
                                                                </TableCell>
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

                        {/* BARRA FIXA FLUTUANTE DE CONFIRMAÇÃO DE VOLUMES */}
                        {selectedHuIds.size > 0 && (
                            <div className="sticky bottom-0 z-20 bg-slate-900/95 backdrop-blur-xs text-white p-3 rounded-xl shadow-xl flex items-center justify-between border border-slate-700 animate-in slide-in-from-bottom-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold">
                                        <strong className="text-orange-400">{selectedClosedStats.count}</strong> volume(s) marcado(s)
                                    </span>
                                    <span className="text-xs text-slate-400 font-mono">
                                        ({selectedClosedStats.pieces} {availableStockData?.baseUnit} selecionados)
                                    </span>
                                </div>
                                <Button onClick={handleReserveClosedVolumes} disabled={isActionLoading} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-8 text-xs shadow-xs">
                                    {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus size={14} className="mr-1" />} Gravar Reserva
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <Card className="h-full border-purple-200 bg-purple-50/40 p-4 flex flex-col justify-center space-y-3 shadow-xs">
                        <div className="max-w-xl mx-auto w-full space-y-2.5">
                            <div className="space-y-1">
                                <Label className="text-xs font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
                                    <Scissors size={14} className="text-purple-600" /> Informar Quantidade Fracionada ({availableStockData?.baseUnit}) *
                                </Label>
                                <p className="text-[11px] text-purple-800/80">
                                    Saldo livre em estoque para fracionamento: <strong className="font-mono text-purple-950">{availableStockData?.receiptGroups?.reduce((acc, g) => acc + (g.availableHus?.reduce((hAcc, h) => hAcc + (Number(h.currentQuantity) || 0), 0) || 0), 0) || 0} {availableStockData?.baseUnit}</strong>
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Input
                                    type="number"
                                    step="0.0001"
                                    placeholder={`Ex: 1350 ${availableStockData?.baseUnit}`}
                                    value={fractionalQuantity}
                                    onChange={(e) => setFractionalQuantity(e.target.value)}
                                    className="bg-white font-mono text-sm h-11 border-purple-300 focus:ring-purple-500"
                                />
                                <Button onClick={handleReserveFractional} disabled={isActionLoading || !fractionalQuantity} className="bg-purple-700 hover:bg-purple-800 text-white font-bold h-11 px-6 shadow-xs shrink-0">
                                    {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus size={16} className="mr-1.5" />} Reservar Fracionado
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            {/* CARRINHO DA ORDEM (CRESCE NATURALMENTE PARA BAIXO) */}
            <Card className="border-slate-200/80 shadow-xs bg-white">
                <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <ShoppingCart size={18} className="text-orange-600" /> Itens Gravados na Ordem de Saída
                        </CardTitle>
                        <Badge variant="secondary" className="font-mono">{orderItemsSummary.totalSkus} SKU(s)</Badge>
                    </div>

                    {/* MINI CARDS DE TOTAIS CONSOLIDADOS */}
                    {orderItemsSummary.totalSkus > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">SKUs Diferentes</span>
                                    <span className="font-mono font-bold text-slate-800 text-sm">{orderItemsSummary.totalSkus} SKU(s)</span>
                                </div>
                                <Package size={16} className="text-slate-400" />
                            </div>

                            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Qtd Total Alocada</span>
                                    <span className="font-mono font-bold text-emerald-700 text-sm">{orderItemsSummary.totalUnits.toLocaleString('pt-BR')} un</span>
                                </div>
                                <Layers size={16} className="text-emerald-600" />
                            </div>

                            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Valor Total Reservado</span>
                                    <span className="font-mono font-bold text-blue-700 text-sm">
                                        {orderItemsSummary.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                </div>
                                <DollarSign size={16} className="text-blue-600" />
                            </div>
                        </div>
                    )}

                    {/* RESUMO RÁPIDO DE CADA SKU (CHIPS COM QUANTIDADE TOTAL) */}
                    {orderItemsSummary.skuBreakdown.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[11px] font-bold text-slate-500 mr-1 uppercase">Resumo por SKU:</span>
                            {orderItemsSummary.skuBreakdown.map(sb => (
                                <Badge key={sb.id} variant="outline" className="bg-slate-50 text-slate-700 font-mono text-[11px] py-1 px-2 border-slate-200 gap-1.5">
                                    <span className="font-bold text-slate-900">{sb.skuCode}:</span>
                                    <strong className="text-emerald-700 font-extrabold">{sb.quantity.toLocaleString('pt-BR')} {sb.unit}</strong>
                                </Badge>
                            ))}
                        </div>
                    )}
                </CardHeader>

                <CardContent className="p-4">
                    {!order?.items || order.items.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-lg bg-slate-50">
                            Nenhum item reservado para esta ordem de saída ainda. Selecione um produto acima para adicionar.
                        </div>
                    ) : (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>SKU Produto</TableHead>
                                        <TableHead>Descrição</TableHead>
                                        <TableHead className="text-right">Qtd Total Alocada</TableHead>
                                        <TableHead className="text-right">Vlr. Unitário Entrada</TableHead>
                                        <TableHead className="text-right">Valor Subtotal</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                        <TableHead className="w-12 text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {order.items.map((item) => {
                                        const qty = item.allocatedQuantity || item.expectedQuantity || 0;
                                        const unitVal = item.inboundUnitValue || item.unitValue || 0;
                                        const subtotal = qty * unitVal;

                                        return (
                                            <TableRow key={item.id} className="hover:bg-slate-50/50">
                                                <TableCell className="font-mono font-bold text-slate-900 text-xs">{item.skuCode}</TableCell>
                                                <TableCell className="text-xs text-slate-600 truncate max-w-xs">{item.description}</TableCell>
                                                <TableCell className="font-mono text-xs font-bold text-emerald-700 text-right">
                                                    {qty.toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-slate-500">{item.unit || 'UN'}</span>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-slate-700 text-right">
                                                    {unitVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs font-bold text-slate-900 text-right">
                                                    {subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="text-[10px] font-mono">{item.status}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveOrderItem(item.id)}
                                                        disabled={isActionLoading}
                                                        className="text-slate-400 hover:text-rose-600 p-1 h-7 w-7"
                                                        title="Remover item da ordem e devolver saldo"
                                                    >
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                                <TableFooter className="bg-slate-50/80 font-mono text-xs">
                                    <TableRow>
                                        <TableCell colSpan={2} className="font-bold text-slate-800">Total da Ordem de Saída:</TableCell>
                                        <TableCell className="text-right font-extrabold text-emerald-700">
                                            {orderItemsSummary.totalUnits.toLocaleString('pt-BR')} un
                                        </TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="text-right font-extrabold text-slate-900">
                                            {orderItemsSummary.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </TableCell>
                                        <TableCell colSpan={2}></TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}