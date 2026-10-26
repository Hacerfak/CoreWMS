import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft, Box, Scissors, Loader2, Plus, Trash2, Layers,
    ChevronRight, ChevronDown, CheckCircle2, ShoppingCart,
    CheckSquare, Square, Search, X, Barcode, Package, MapPin, Calendar, FileText
} from 'lucide-react';
import { toast } from 'sonner';

const formatDatePtBr = (dateValue) => {
    if (!dateValue) return '-';
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch {
        return '-';
    }
};

const translateItemStatus = (status) => {
    switch (status) {
        case 'Pending':
            return <Badge variant="outline" className="text-[10px] font-mono bg-amber-50 text-amber-800 border-amber-200">Pendente</Badge>;
        case 'Allocated':
            return <Badge variant="outline" className="text-[10px] font-mono bg-blue-50 text-blue-800 border-blue-200">Alocado</Badge>;
        case 'Picking':
            return <Badge variant="outline" className="text-[10px] font-mono bg-purple-50 text-purple-800 border-purple-200">Em Separação</Badge>;
        case 'Picked':
            return <Badge variant="outline" className="text-[10px] font-mono bg-teal-50 text-teal-800 border-teal-200">Separado</Badge>;
        case 'Packed':
            return <Badge variant="outline" className="text-[10px] font-mono bg-indigo-50 text-indigo-800 border-indigo-200">Embalado</Badge>;
        case 'Checked':
            return <Badge variant="outline" className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border-emerald-200">Conferido</Badge>;
        default:
            return <Badge variant="outline" className="text-[10px] font-mono">{status || 'Pendente'}</Badge>;
    }
};

// Componente Padronizado: Exibe APENAS a NF-e e a Data de Entrada no Cabeçalho
function InboundReceiptGroupHeader({
    inboundInvoiceNumber,
    receiptDate,
    quantityLabel,
    quantityValue,
    unit,
    action = null
}) {
    return (
        <div className="flex items-center justify-between flex-wrap gap-2.5 w-full">
            <div className="flex items-center gap-2 flex-wrap">
                {/* 1. DESTAQUE NF-E DE ENTRADA */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600 text-white font-mono font-bold text-xs shadow-2xs">
                    <FileText size={13} className="text-blue-100" />
                    NF-e: {inboundInvoiceNumber || 'SEM NF'}
                </span>

                {/* 2. DESTAQUE DATA DE ENTRADA */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-mono font-semibold text-xs border border-slate-200">
                    <Calendar size={13} className="text-slate-500" />
                    Entrada: {formatDatePtBr(receiptDate)}
                </span>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
                {quantityLabel && (
                    <div className="text-right">
                        <span className="text-slate-400 text-[10px] mr-1.5 uppercase">{quantityLabel}:</span>
                        <strong className="text-slate-900 font-bold">{Number(quantityValue).toLocaleString('pt-BR')} {unit}</strong>
                    </div>
                )}
                {action}
            </div>
        </div>
    );
}

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

    // Expansão dos SKUs no carrinho inferior
    const [expandedItemIds, setExpandedItemIds] = useState({});

    // Reload da Ordem
    const loadOrderData = async () => {
        try {
            const orderData = await customInstance({ url: `/api/outbound/orders/${orderId}`, method: 'GET' });
            setOrder(orderData);

            if (orderData?.items) {
                const initialExpanded = {};
                orderData.items.forEach(i => {
                    initialExpanded[i.id] = true;
                });
                setExpandedItemIds(initialExpanded);
            }

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
                const initialExpand = {};
                stockData.receiptGroups.forEach((_, idx) => {
                    initialExpand[idx] = true;
                });
                setExpandedGroupIdx(initialExpand);
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

    const toggleItemExpand = (itemId) => {
        setExpandedItemIds(prev => ({ ...prev, [itemId]: !prev[itemId] }));
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
            return { totalSkus: 0, totalUnits: 0, totalHus: 0, skuBreakdown: [] };
        }

        const totalSkus = order.items.length;
        let totalUnits = 0;
        let totalHus = 0;

        const skuBreakdown = order.items.map(item => {
            const qty = Number(item.allocatedQuantity) || Number(item.expectedQuantity) || 0;
            totalUnits += qty;
            const itemAllocations = item.allocations || [];
            totalHus += itemAllocations.length;

            // Agrupa alocações do SKU por NF-e de Entrada (Número e Data de Entrada)
            const invoiceGroupsMap = new Map();
            itemAllocations.forEach(alloc => {
                const invoiceNumber = alloc.inboundInvoiceNumber?.trim() || 'SEM NF';
                const receiptDate = alloc.inboundReceiptDate || null;
                const groupKey = `${invoiceNumber}_${receiptDate || ''}`;

                if (!invoiceGroupsMap.has(groupKey)) {
                    invoiceGroupsMap.set(groupKey, {
                        inboundInvoiceNumber: invoiceNumber !== 'SEM NF' ? invoiceNumber : null,
                        receiptDate: receiptDate,
                        totalQuantity: 0,
                        allocations: []
                    });
                }
                const invGroup = invoiceGroupsMap.get(groupKey);
                invGroup.totalQuantity += Number(alloc.quantity) || 0;
                invGroup.allocations.push(alloc);
            });

            return {
                id: item.id,
                skuCode: item.skuCode,
                description: item.description,
                unit: item.unit || 'UN',
                quantity: qty,
                status: item.status,
                invoiceGroups: Array.from(invoiceGroupsMap.values())
            };
        });

        return { totalSkus, totalUnits, totalHus, skuBreakdown };
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

            {/* PAINEL CENTRAL DE SELEÇÃO E ESTOQUE */}
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
                            Selecione um produto no campo acima para carregar as etiquetas LPN, NF-e de entrada, posições, lotes e validades disponíveis no armazém.
                        </p>
                    </div>
                ) : mode === 'CLOSED_VOLUMES' ? (
                    <div className="space-y-3 pb-2">
                        {/* BARRA DE FILTRO RÁPIDO DE HU (INCLUINDO POSIÇÃO/ENDEREÇO NO ARMAZÉM) */}
                        <div className="bg-white p-3 border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                            <div className="flex items-center gap-2 flex-1 max-w-md">
                                <Search size={14} className="text-slate-400" />
                                <Input
                                    placeholder="Filtrar por código LPN, lote, NF-e ou posição..."
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
                                return (
                                    h.lpn?.toLowerCase().includes(t) ||
                                    (h.batch && h.batch.toLowerCase().includes(t)) ||
                                    (group.inboundInvoiceNumber && group.inboundInvoiceNumber.toLowerCase().includes(t)) ||
                                    (h.inboundInvoiceNumber && h.inboundInvoiceNumber.toLowerCase().includes(t)) ||
                                    (h.locationPath && h.locationPath.toLowerCase().includes(t)) // <-- Filtro por Posição/Endereço
                                );
                            }) || [];

                            if (filteredHus.length === 0 && huFilterTerm.trim()) return null;

                            const groupHuIds = filteredHus.map(h => h.handlingUnitId);
                            const isAllInGroupSelected = groupHuIds.length > 0 && groupHuIds.every(id => selectedHuIds.has(id));
                            const groupTotalQty = filteredHus.reduce((acc, h) => acc + (Number(h.currentQuantity) || 0), 0);

                            return (
                                <div key={gIdx} className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs">
                                    <div className="p-3 bg-slate-50 flex items-center justify-between border-b border-slate-100 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedGroupIdx(prev => ({ ...prev, [gIdx]: !prev[gIdx] }))}
                                            className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 shrink-0"
                                        >
                                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                        </button>

                                        {/* CABEÇALHO PADRONIZADO: APENAS NOTA E ENTRADA */}
                                        <div className="flex-1">
                                            <InboundReceiptGroupHeader
                                                inboundInvoiceNumber={group.inboundInvoiceNumber || group.receiptNumber}
                                                receiptDate={group.receiptDate}
                                                quantityLabel="Disponível na NF"
                                                quantityValue={groupTotalQty}
                                                unit={availableStockData.baseUnit}
                                                action={
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => toggleSelectAllInGroup(group)}
                                                        className="h-7 text-xs bg-white font-semibold ml-2 shrink-0"
                                                    >
                                                        {isAllInGroupSelected ? <CheckSquare size={13} className="mr-1 text-orange-600" /> : <Square size={13} className="mr-1 text-slate-400" />}
                                                        {isAllInGroupSelected ? 'Desmarcar NF' : 'Selecionar NF'}
                                                    </Button>
                                                }
                                            />
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="p-2 bg-white overflow-x-auto">
                                            <Table>
                                                <TableHeader className="bg-slate-50">
                                                    <TableRow>
                                                        <TableHead className="w-10 text-center"></TableHead>
                                                        <TableHead>LPN / Volume</TableHead>
                                                        <TableHead className="text-center">Tipo Embalagem</TableHead>
                                                        <TableHead className="text-right">Quantidade Disponível</TableHead>
                                                        <TableHead>Lote</TableHead>
                                                        <TableHead className="text-center">Validade</TableHead>
                                                        <TableHead className="text-center">Fabricação</TableHead>
                                                        <TableHead className="text-center">Série</TableHead>
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
                                                                <TableCell className="text-center">
                                                                    <Badge variant="outline" className="font-mono text-[10px] font-bold bg-white text-slate-800 border-slate-300">
                                                                        {hu.packagingTypeCode || 'PLT'}
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell className="font-mono text-xs font-bold text-emerald-700 text-right">
                                                                    {Number(hu.currentQuantity).toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-slate-500">{availableStockData.baseUnit}</span>
                                                                </TableCell>
                                                                <TableCell className="font-mono text-xs text-slate-800 font-bold">{hu.batch || '-'}</TableCell>
                                                                <TableCell className="font-mono text-xs text-slate-600 text-center">{formatDatePtBr(hu.expirationDate)}</TableCell>
                                                                <TableCell className="font-mono text-xs text-slate-500 text-center">{formatDatePtBr(hu.manufactureDate)}</TableCell>
                                                                <TableCell className="font-mono text-xs text-slate-500 text-center">{hu.serialNumber || '-'}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1">
                                                                        <MapPin size={11} className="text-blue-600" /> {hu.locationPath || 'DOCA'}
                                                                    </span>
                                                                </TableCell>
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
                                        ({selectedClosedStats.pieces.toLocaleString('pt-BR')} {availableStockData?.baseUnit} selecionados)
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
                                    Saldo livre em estoque para fracionamento: <strong className="font-mono text-purple-950">{(availableStockData?.receiptGroups?.reduce((acc, g) => acc + (g.availableHus?.reduce((hAcc, h) => hAcc + (Number(h.currentQuantity) || 0), 0) || 0), 0) || 0).toLocaleString('pt-BR')} {availableStockData?.baseUnit}</strong>
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

            {/* CARRINHO DA ORDEM (RESERVAS AGRUPADAS POR NF-E DE ENTRADA / SEM VALORES FINANCEIROS) */}
            <Card className="border-slate-200/80 shadow-xs bg-white">
                <CardHeader className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <ShoppingCart size={18} className="text-orange-600" /> Itens Gravados na Ordem de Saída
                        </CardTitle>
                        <Badge variant="secondary" className="font-mono">{orderItemsSummary.totalSkus} SKU(s)</Badge>
                    </div>

                    {/* MINI CARDS DE TOTAIS OPERACIONAIS */}
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
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Volumes / HUs Reservadas</span>
                                    <span className="font-mono font-bold text-orange-700 text-sm">{orderItemsSummary.totalHus} Volume(s)</span>
                                </div>
                                <Box size={16} className="text-orange-600" />
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

                <CardContent className="p-4 space-y-4">
                    {!order?.items || order.items.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-lg bg-slate-50">
                            Nenhum item reservado para esta ordem de saída ainda. Selecione um produto acima para adicionar.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {orderItemsSummary.skuBreakdown.map((item) => {
                                const isExpanded = !!expandedItemIds[item.id];

                                return (
                                    <div key={item.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                                        {/* CABEÇALHO DO SKU */}
                                        <div
                                            onClick={() => toggleItemExpand(item.id)}
                                            className="p-3 bg-slate-50/80 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors border-b border-slate-100"
                                        >
                                            <div className="flex items-center gap-3">
                                                {isExpanded ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-xs text-slate-900">{item.skuCode}</span>
                                                        <Badge variant="outline" className="text-[10px] font-mono">{item.unit}</Badge>
                                                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                                                            {item.invoiceGroups.length} NF-e(s)
                                                        </Badge>
                                                    </div>
                                                    <span className="text-[11px] text-slate-500 truncate max-w-sm block">{item.description}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="text-right font-mono">
                                                    <span className="text-[10px] text-slate-400 block uppercase">Total Alocado</span>
                                                    <span className="font-bold text-emerald-700 text-xs">
                                                        {item.quantity.toLocaleString('pt-BR')} {item.unit}
                                                    </span>
                                                </div>

                                                {/* STATUS DO ITEM TRADUZIDO */}
                                                {translateItemStatus(item.status)}

                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveOrderItem(item.id);
                                                    }}
                                                    disabled={isActionLoading}
                                                    className="text-slate-400 hover:text-rose-600 p-1 h-7 w-7 shrink-0"
                                                    title="Estornar reservas deste SKU"
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* DETALHAMENTO DAS ALOCAÇÕES AGRUPADAS POR NF-E DE ENTRADA */}
                                        {isExpanded && (
                                            <div className="p-3 bg-slate-50/30 space-y-3">
                                                {item.invoiceGroups.length === 0 ? (
                                                    <p className="text-xs text-slate-400 italic p-2">Nenhuma alocação vinculada encontrada.</p>
                                                ) : (
                                                    item.invoiceGroups.map((invGroup, lIdx) => (
                                                        <div key={lIdx} className="bg-white border border-slate-200/90 rounded-lg p-3 space-y-2">
                                                            {/* CABEÇALHO PADRONIZADO: APENAS NOTA E DATA DE ENTRADA */}
                                                            <div className="border-b border-slate-100 pb-2">
                                                                <InboundReceiptGroupHeader
                                                                    inboundInvoiceNumber={invGroup.inboundInvoiceNumber}
                                                                    receiptDate={invGroup.receiptDate}
                                                                    quantityLabel="Alocado na NF"
                                                                    quantityValue={invGroup.totalQuantity}
                                                                    unit={item.unit}
                                                                />
                                                            </div>

                                                            {/* TABELA DE HUS DA NF-E */}
                                                            <div className="overflow-x-auto">
                                                                <Table>
                                                                    <TableHeader className="bg-slate-50/70">
                                                                        <TableRow>
                                                                            <TableHead className="text-xs">LPN / Volume</TableHead>
                                                                            <TableHead className="text-center text-xs">Tipo Embalagem</TableHead>
                                                                            <TableHead className="text-right text-xs">Quantidade Alocada</TableHead>
                                                                            <TableHead>Lote</TableHead>
                                                                            <TableHead className="text-center text-xs">Validade</TableHead>
                                                                            <TableHead className="text-center text-xs">Fabricação</TableHead>
                                                                            <TableHead className="text-center text-xs">Série</TableHead>
                                                                            <TableHead className="text-center text-xs">Tipo</TableHead>
                                                                            <TableHead className="text-right text-xs">Posição no Armazém</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {invGroup.allocations.map((alloc) => (
                                                                            <TableRow key={alloc.allocationId} className="hover:bg-slate-50/50">
                                                                                <TableCell className="font-mono font-bold text-xs text-slate-900">
                                                                                    {alloc.lpn}
                                                                                </TableCell>
                                                                                <TableCell className="text-center">
                                                                                    <Badge variant="outline" className="font-mono text-[10px] font-bold bg-white text-slate-800 border-slate-300">
                                                                                        {alloc.packagingTypeCode || 'PLT'}
                                                                                    </Badge>
                                                                                </TableCell>
                                                                                <TableCell className="font-mono text-xs font-bold text-emerald-700 text-right">
                                                                                    {Number(alloc.quantity).toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-slate-500">{item.unit}</span>
                                                                                </TableCell>
                                                                                <TableCell className="font-mono text-xs text-slate-800 font-bold">
                                                                                    {alloc.batch || '-'}
                                                                                </TableCell>
                                                                                <TableCell className="font-mono text-xs text-slate-600 text-center">
                                                                                    {formatDatePtBr(alloc.expirationDate)}
                                                                                </TableCell>
                                                                                <TableCell className="font-mono text-xs text-slate-500 text-center">
                                                                                    {formatDatePtBr(alloc.manufactureDate)}
                                                                                </TableCell>
                                                                                <TableCell className="font-mono text-xs text-slate-500 text-center">
                                                                                    {alloc.serialNumber || '-'}
                                                                                </TableCell>
                                                                                <TableCell className="text-center">
                                                                                    {alloc.isFractional ? (
                                                                                        <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200">
                                                                                            Fracionado
                                                                                        </Badge>
                                                                                    ) : (
                                                                                        <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">
                                                                                            Fechado
                                                                                        </Badge>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="text-right">
                                                                                    <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1">
                                                                                        <MapPin size={11} className="text-blue-600" /> {alloc.locationPath || 'DOCA'}
                                                                                    </span>
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* TOTALIZADOR NO RODAPÉ */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between font-mono text-xs">
                                <span className="font-bold text-slate-800">Total Físico Alocado na Ordem de Saída:</span>
                                <span className="font-extrabold text-emerald-700 text-sm">
                                    {orderItemsSummary.totalUnits.toLocaleString('pt-BR')} un
                                </span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}