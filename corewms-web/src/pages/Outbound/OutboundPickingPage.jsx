import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    ArrowLeft, Box, MapPin, Barcode, CheckCircle2, Loader2, ArrowRight,
    Check, Calendar, Tag, ChevronDown, ChevronRight
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

export default function OutboundPickingPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    const [orderData, setOrderData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedItemId, setSelectedItemId] = useState(null);

    // Bipagem Rápida
    const [scannedLpn, setScannedLpn] = useState('');
    const [pickedQuantity, setPickedQuantity] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // SKUs concluídos expandidos
    const [expandedCompletedIds, setExpandedCompletedIds] = useState([]);

    const lpnInputRef = useRef(null);

    const loadTasks = async (maintainSelection = true) => {
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/picking/${orderId}/tasks`,
                method: 'GET'
            });

            setOrderData(res);

            // Seleção inteligente do SKU: prioriza o atual se ainda pendente, ou seleciona o primeiro pendente
            if (res?.items?.length > 0) {
                const currentItem = res.items.find(i => i.orderItemId === selectedItemId);
                const isCurrentComplete = currentItem && currentItem.pickedQuantity >= currentItem.expectedQuantity;

                if (!selectedItemId || (maintainSelection && isCurrentComplete)) {
                    const firstPending = res.items.find(i => i.pickedQuantity < i.expectedQuantity);
                    setSelectedItemId(firstPending ? firstPending.orderItemId : res.items[0].orderItemId);
                }
            }
        } catch {
            toast.error('Erro ao carregar mapa de separação.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) loadTasks(false);
    }, [orderId]);

    // Separação de SKUs pendentes vs finalizados
    const pendingItems = useMemo(() => {
        return orderData?.items?.filter(i => i.pickedQuantity < i.expectedQuantity) || [];
    }, [orderData]);

    const completedItems = useMemo(() => {
        return orderData?.items?.filter(i => i.pickedQuantity >= i.expectedQuantity) || [];
    }, [orderData]);

    // SKU ativo em trabalho
    const activeItem = useMemo(() => {
        if (!orderData?.items) return null;
        return orderData.items.find(i => i.orderItemId === selectedItemId) || pendingItems[0] || orderData.items[0];
    }, [orderData, selectedItemId, pendingItems]);

    // Sugestões de HUs pendentes do SKU ativo
    const suggestedHus = useMemo(() => {
        if (!activeItem?.allocations) return [];
        return activeItem.allocations.filter(a => !a.isPicked);
    }, [activeItem]);

    // Atualiza campo de quantidade sugerida ao trocar de SKU
    useEffect(() => {
        if (activeItem) {
            const pendingQty = activeItem.expectedQuantity - activeItem.pickedQuantity;
            if (suggestedHus.length > 0) {
                const nextHu = suggestedHus[0];
                setPickedQuantity(Math.min(nextHu.quantity, pendingQty).toString());
            } else {
                setPickedQuantity(pendingQty > 0 ? pendingQty.toString() : '');
            }
            setScannedLpn('');
            if (lpnInputRef.current) {
                lpnInputRef.current.focus();
            }
        }
    }, [activeItem?.orderItemId, suggestedHus.length]);

    // Atalho para pré-preencher com a HU clicada
    const handleQuickSelectHu = (hu) => {
        setScannedLpn(hu.lpn);
        const pendingQty = activeItem.expectedQuantity - activeItem.pickedQuantity;
        setPickedQuantity(Math.min(hu.quantity, pendingQty).toString());
        if (lpnInputRef.current) {
            lpnInputRef.current.focus();
        }
    };

    // Submissão da bipagem
    const handleExecuteScan = async (e) => {
        e?.preventDefault();
        if (!scannedLpn.trim() || !pickedQuantity) {
            return toast.warning('Informe a etiqueta LPN e a quantidade.');
        }

        const qtyNum = parseFloat(pickedQuantity);
        if (isNaN(qtyNum) || qtyNum <= 0) {
            return toast.warning('Informe uma quantidade válida maior que zero.');
        }

        try {
            setIsSubmitting(true);
            const payload = {
                orderId,
                orderItemId: activeItem?.orderItemId || null,
                scannedLpn: scannedLpn.trim().toUpperCase(),
                pickedQuantity: qtyNum
            };

            const res = await customInstance({
                url: '/api/outbound/picking/scan',
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || 'Coleta confirmada!');
            setScannedLpn('');
            await loadTasks(true);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao processar leitura do LPN.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleCompletedExpand = (orderItemId) => {
        setExpandedCompletedIds(prev =>
            prev.includes(orderItemId) ? prev.filter(id => id !== orderItemId) : [...prev, orderItemId]
        );
    };

    const isOrderComplete = orderData?.items?.length > 0 && pendingItems.length === 0;

    if (isLoading && !orderData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando mapa de separação...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/outbound')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Box className="text-purple-600" size={22} /> Coletor de Separação (Picking Dinâmico)
                            </h1>
                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs font-mono">
                                Pedido #{orderData?.orderNumber}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong>{orderData?.customerName}</strong> {orderData?.destinationName && `| Destino: ${orderData.destinationName}`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right font-mono text-xs hidden sm:block">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Progresso dos SKUs</span>
                        <strong className="text-slate-800">{completedItems.length}</strong> de <strong className="text-slate-800">{orderData?.items?.length || 0}</strong> concluídos
                    </div>

                    <Button
                        onClick={() => navigate('/outbound')}
                        className={isOrderComplete ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-5 shadow-xs" : "bg-white text-slate-700 border-slate-200 h-10 text-xs font-semibold"}
                        variant={isOrderComplete ? "default" : "outline"}
                    >
                        {isOrderComplete ? (
                            <><CheckCircle2 size={16} className="mr-2" /> Concluir e Voltar</>
                        ) : (
                            'Salvar e Sair'
                        )}
                    </Button>
                </div>
            </div>

            {/* BANNER DE SEPARAÇÃO 100% CONCLUÍDA (SEM DIRECIONAR PARA O PACKING) */}
            {isOrderComplete && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-3 shadow-2xs">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                        <CheckCircle2 size={28} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">Todos os SKUs deste pedido foram 100% separados!</h2>
                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                        Todas as HUs e produtos foram coletados com sucesso no armazém.
                    </p>
                    <div className="pt-2">
                        <Button
                            onClick={() => navigate('/outbound')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-6 shadow-xs"
                        >
                            <ArrowLeft size={16} className="mr-2" /> Voltar para a Listagem de Pedidos
                        </Button>
                    </div>
                </div>
            )}

            {/* ÁREA DE TRABALHO: SKU ATIVO + NAVEGAÇÃO */}
            {!isOrderComplete && activeItem && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                    {/* COLUNA ESQUERDA: LISTA RÁPIDA DE SELEÇÃO DE SKUs */}
                    <div className="lg:col-span-4 space-y-3">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-3 border-b bg-slate-50/70 flex flex-row items-center justify-between">
                                <CardTitle className="text-xs font-bold uppercase text-slate-700">
                                    Fila de SKUs Pendentes ({pendingItems.length})
                                </CardTitle>
                                <span className="text-[10px] text-slate-400 font-mono">Clique para focar</span>
                            </CardHeader>
                            <CardContent className="p-2 space-y-1.5 max-h-[560px] overflow-y-auto">
                                {pendingItems.map((item) => {
                                    const isSelected = item.orderItemId === activeItem.orderItemId;
                                    const pendingQty = item.expectedQuantity - item.pickedQuantity;
                                    const percent = Math.min(100, (item.pickedQuantity / item.expectedQuantity) * 100);

                                    return (
                                        <div
                                            key={item.orderItemId}
                                            onClick={() => setSelectedItemId(item.orderItemId)}
                                            className={`p-3 rounded-xl border transition-all cursor-pointer ${isSelected
                                                ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-500/20 shadow-xs'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono font-bold text-xs text-slate-900">{item.skuCode}</span>
                                                <Badge variant="outline" className="text-[10px] font-mono">
                                                    Faltam {pendingQty} {item.baseUnit}
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.description}</p>

                                            <div className="mt-2 space-y-1">
                                                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                                    <span>Progresso</span>
                                                    <span>{item.pickedQuantity} / {item.expectedQuantity} {item.baseUnit}</span>
                                                </div>
                                                <Progress value={percent} className="h-1.5" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    </div>

                    {/* COLUNA DIREITA: FOCO NO SKU ATIVO (BIPAGEM + RASTREABILIDADE DAS HUS) */}
                    <div className="lg:col-span-8 space-y-4">

                        {/* CARD PRINCIPAL DO SKU ATIVO */}
                        <Card className="border-purple-200 bg-purple-50/20 shadow-xs overflow-hidden">
                            <CardHeader className="p-4 bg-purple-100/50 border-b border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Badge className="bg-purple-600 text-white font-mono text-xs">SKU ATIVO</Badge>
                                        <h2 className="text-base font-bold font-mono text-slate-900">{activeItem.skuCode}</h2>
                                        <Badge variant="outline" className="text-xs font-mono bg-white">{activeItem.baseUnit}</Badge>
                                    </div>
                                    <p className="text-xs text-slate-600 mt-1">{activeItem.description}</p>
                                </div>

                                <div className="flex items-center gap-4 bg-white px-3 py-2 rounded-xl border border-purple-200/80 font-mono text-xs">
                                    <div className="text-center">
                                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Esperado</span>
                                        <strong className="text-slate-800">{activeItem.expectedQuantity}</strong>
                                    </div>
                                    <div className="h-6 w-px bg-slate-200" />
                                    <div className="text-center">
                                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Separado</span>
                                        <strong className="text-emerald-600">{activeItem.pickedQuantity}</strong>
                                    </div>
                                    <div className="h-6 w-px bg-slate-200" />
                                    <div className="text-center">
                                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Pendente</span>
                                        <strong className="text-purple-700">{activeItem.expectedQuantity - activeItem.pickedQuantity}</strong>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="p-4 space-y-4">
                                {/* FORMULÁRIO DE BIPAGEM DIRETA */}
                                <form onSubmit={handleExecuteScan} className="bg-white p-4 rounded-xl border border-purple-200 shadow-2xs space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <Barcode className="text-purple-600" size={16} /> Leitura da Etiqueta no Armazém
                                        </span>
                                        <span className="text-[10px] text-slate-400">Pressione Enter para confirmar</span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                                        <div className="sm:col-span-7 space-y-1">
                                            <Label className="text-xs font-semibold text-slate-700">Código LPN da HU *</Label>
                                            <Input
                                                ref={lpnInputRef}
                                                placeholder="Bipe ou digite o código da HU..."
                                                value={scannedLpn}
                                                onChange={(e) => setScannedLpn(e.target.value)}
                                                autoFocus
                                                className="bg-white font-mono text-sm h-11 border-purple-300 focus-visible:ring-purple-600"
                                            />
                                        </div>

                                        <div className="sm:col-span-3 space-y-1">
                                            <Label className="text-xs font-semibold text-slate-700">Qtd ({activeItem.baseUnit}) *</Label>
                                            <Input
                                                type="number"
                                                step="0.0001"
                                                value={pickedQuantity}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setPickedQuantity(e.target.value)}
                                                className="bg-white font-mono text-sm h-11 text-center border-purple-300"
                                            />
                                        </div>

                                        <div className="sm:col-span-2 flex items-end">
                                            <Button
                                                type="submit"
                                                disabled={isSubmitting || !scannedLpn.trim() || !pickedQuantity}
                                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-11 shadow-xs"
                                            >
                                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar'}
                                            </Button>
                                        </div>
                                    </div>
                                </form>

                                {/* LISTA DE HUS SUGERIDAS (ONDE BUSCAR NO ARMAZÉM) */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <MapPin className="text-blue-600" size={15} /> Posições e HUs Sugeridas no Armazém ({suggestedHus.length})
                                        </Label>
                                        <span className="text-[10px] text-slate-400">Ordenadas por estratégia de rota</span>
                                    </div>

                                    {suggestedHus.length === 0 ? (
                                        <div className="p-4 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-400 italic">
                                            Nenhuma outra HU sugerida pendente para este SKU.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2.5">
                                            {suggestedHus.map((hu) => (
                                                <div
                                                    key={hu.allocationId}
                                                    className="bg-white border border-slate-200/90 hover:border-purple-300 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors shadow-2xs"
                                                >
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Badge className="bg-blue-600 text-white font-mono text-xs flex items-center gap-1">
                                                                <MapPin size={11} /> {hu.locationPath || 'SEM ENDEREÇO'}
                                                            </Badge>
                                                            <span className="font-mono font-bold text-sm text-slate-900">{hu.lpn}</span>
                                                            <Badge variant="outline" className="text-[10px] font-mono">{hu.packagingCode || 'PLT'}</Badge>
                                                        </div>

                                                        {/* RASTREABILIDADE: LOTE, VALIDADE, FABRICAÇÃO E SÉRIE */}
                                                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600 flex-wrap pt-0.5">
                                                            {hu.batch && (
                                                                <span className="flex items-center gap-1">
                                                                    <Tag size={11} className="text-slate-400" /> Lote: <strong>{hu.batch}</strong>
                                                                </span>
                                                            )}
                                                            {hu.expirationDate && (
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar size={11} className="text-amber-600" /> Val: <strong>{formatDatePtBr(hu.expirationDate)}</strong>
                                                                </span>
                                                            )}
                                                            {hu.manufactureDate && (
                                                                <span className="flex items-center gap-1 text-slate-500">
                                                                    Fab: {formatDatePtBr(hu.manufactureDate)}
                                                                </span>
                                                            )}
                                                            {hu.serialNumber && (
                                                                <span className="text-slate-500">
                                                                    Série: {hu.serialNumber}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                                                        <div className="text-right font-mono">
                                                            <span className="text-[10px] text-slate-400 block uppercase">Disponível</span>
                                                            <strong className="text-sm text-slate-900">{hu.quantity} {activeItem.baseUnit}</strong>
                                                        </div>

                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() => handleQuickSelectHu(hu)}
                                                            variant="outline"
                                                            className="h-9 px-3 text-xs font-semibold border-purple-200 text-purple-700 hover:bg-purple-50"
                                                        >
                                                            <Barcode size={13} className="mr-1.5" /> Bipar esta HU
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}

            {/* SEÇÃO DE SKUS CONCLUÍDOS (AGRUPADOS COM EXPANSÃO PARA AUDITORIA) */}
            {completedItems.length > 0 && (
                <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                            <CheckCircle2 size={15} className="text-emerald-600" /> SKUs Totalmente Separados ({completedItems.length})
                        </h3>
                        <span className="text-[11px] text-slate-400 font-mono">Expanda para auditar as HUs coletadas</span>
                    </div>

                    <div className="space-y-2">
                        {completedItems.map((item) => {
                            const isExpanded = expandedCompletedIds.includes(item.orderItemId);
                            const itemPickedHus = item.allocations?.filter(a => a.isPicked) || [];

                            return (
                                <Card key={item.orderItemId} className="border-emerald-200 bg-emerald-50/20 overflow-hidden shadow-2xs">
                                    <div
                                        onClick={() => toggleCompletedExpand(item.orderItemId)}
                                        className="p-3.5 bg-white flex items-center justify-between cursor-pointer hover:bg-emerald-50/30 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                                <Check size={12} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-xs text-slate-900">{item.skuCode}</span>
                                                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-mono">100% OK</Badge>
                                                </div>
                                                <p className="text-[11px] text-slate-500 truncate max-w-md">{item.description}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="text-right font-mono text-xs">
                                                <span className="font-bold text-emerald-700">{item.pickedQuantity} {item.baseUnit}</span>
                                                <span className="block text-[10px] text-slate-400">{itemPickedHus.length} HU(s) coletada(s)</span>
                                            </div>

                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400">
                                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* DETALHAMENTO EXPANDIDO DAS HUS DESTE SKU */}
                                    {isExpanded && (
                                        <CardContent className="p-3 bg-slate-50/60 border-t border-emerald-100">
                                            <Table>
                                                <TableHeader className="bg-white">
                                                    <TableRow>
                                                        <TableHead className="text-xs">LPN Coletado</TableHead>
                                                        <TableHead className="text-xs">Origem (Endereço)</TableHead>
                                                        <TableHead className="text-xs">Lote</TableHead>
                                                        <TableHead className="text-xs">Validade</TableHead>
                                                        <TableHead className="text-xs">Embalagem</TableHead>
                                                        <TableHead className="text-right text-xs">Quantidade</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {itemPickedHus.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={6} className="text-center text-xs text-slate-400 italic">
                                                                Sem registro de HUs vinculadas.
                                                            </TableCell>
                                                        </TableRow>
                                                    ) : (
                                                        itemPickedHus.map((hu) => (
                                                            <TableRow key={hu.allocationId} className="font-mono text-xs bg-white">
                                                                <TableCell className="font-bold text-purple-700">{hu.lpn}</TableCell>
                                                                <TableCell className="text-slate-700">
                                                                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                                                                        {hu.locationPath || 'DOCA'}
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell className="text-slate-800">{hu.batch || '-'}</TableCell>
                                                                <TableCell className="text-slate-600">{formatDatePtBr(hu.expirationDate)}</TableCell>
                                                                <TableCell className="text-slate-600">{hu.packagingCode || 'PLT'}</TableCell>
                                                                <TableCell className="text-right font-bold text-emerald-700">
                                                                    {hu.quantity} {item.baseUnit}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}