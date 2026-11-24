import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { useHasPermission } from '@/hooks/useHasPermission';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    ArrowLeft, Box, MapPin, Barcode, CheckCircle2, Loader2,
    Check, Calendar, Tag, ChevronDown, ChevronRight, Receipt,
    RotateCcw, Undo2
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

    const canPickOutbound = useHasPermission('outbound:pick');
    const canManageOutbound = useHasPermission('outbound:manage');
    const canCheckOutbound = useHasPermission('outbound:check');
    const canPackOutbound = useHasPermission('packing:manage');
    const canViewBillingServices = useHasPermission(['billing:manage', 'billing:view']);

    const [orderData, setOrderData] = useState(null);
    const [billingServices, setBillingServices] = useState([]);
    const [selectedHandlingServiceId, setSelectedHandlingServiceId] = useState('');
    const [isLoading, setIsLoading] = useState(Boolean(orderId && canPickOutbound));
    const [selectedItemId, setSelectedItemId] = useState(null);

    // Bipagem Rápida
    const [scannedLpn, setScannedLpn] = useState('');
    const [customPickedQuantity, setCustomPickedQuantity] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);

    // Modais de Confirmação
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
    const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
    const [huToUndo, setHuToUndo] = useState(null);
    const [isUndoingHu, setIsUndoingHu] = useState(false);

    // SKUs concluídos expandidos
    const [expandedCompletedIds, setExpandedCompletedIds] = useState([]);

    const lpnInputRef = useRef(null);

    const reloadTasks = async (maintainSelection = true) => {
        if (!orderId || !canPickOutbound) return;

        try {
            const tasksRes = await customInstance({
                url: `/api/outbound/picking/${orderId}/tasks`,
                method: 'GET'
            });

            setOrderData(tasksRes);

            if (tasksRes?.items?.length > 0) {
                setSelectedItemId(prevSelectedId => {
                    const currentItem = tasksRes.items.find(i => i.orderItemId === prevSelectedId);
                    const isCurrentComplete = currentItem && currentItem.pickedQuantity >= currentItem.expectedQuantity;

                    if (!prevSelectedId || (maintainSelection && isCurrentComplete)) {
                        const firstPending = tasksRes.items.find(i => i.pickedQuantity < i.expectedQuantity);
                        return firstPending ? firstPending.orderItemId : tasksRes.items[0].orderItemId;
                    }
                    return prevSelectedId;
                });
            }
        } catch {
            toast.error('Erro ao atualizar mapa de separação.');
        }
    };

    useEffect(() => {
        if (!orderId || !canPickOutbound) return;

        let isMounted = true;

        Promise.all([
            customInstance({ url: `/api/outbound/picking/${orderId}/tasks`, method: 'GET' }),
            canViewBillingServices
                ? customInstance({ url: '/api/billing/services', method: 'GET' }).catch(() => [])
                : Promise.resolve([])
        ])
            .then(([tasksRes, servicesRes]) => {
                if (!isMounted) return;
                setOrderData(tasksRes);

                const servicesList = Array.isArray(servicesRes) ? servicesRes : (servicesRes?.items || []);
                setBillingServices(servicesList);

                if (servicesList.length > 0) {
                    setSelectedHandlingServiceId(prev => {
                        if (prev) return prev;
                        const defaultHandling = servicesList.find(s =>
                            s.name?.toLowerCase().includes('expedição') ||
                            s.name?.toLowerCase().includes('handling out') ||
                            s.name?.toLowerCase().includes('separação') ||
                            s.name?.toLowerCase().includes('saída')
                        );
                        return defaultHandling ? defaultHandling.id : '';
                    });
                }

                if (tasksRes?.items?.length > 0) {
                    setSelectedItemId(prevSelectedId => {
                        if (!prevSelectedId) {
                            const firstPending = tasksRes.items.find(i => i.pickedQuantity < i.expectedQuantity);
                            return firstPending ? firstPending.orderItemId : tasksRes.items[0].orderItemId;
                        }
                        return prevSelectedId;
                    });
                }
            })
            .catch(() => {
                if (isMounted) toast.error('Erro ao carregar mapa de separação.');
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [orderId, canPickOutbound, canViewBillingServices]);

    const pendingItems = useMemo(() => {
        return orderData?.items?.filter(i => i.pickedQuantity < i.expectedQuantity) || [];
    }, [orderData]);

    const completedItems = useMemo(() => {
        return orderData?.items?.filter(i => i.pickedQuantity >= i.expectedQuantity) || [];
    }, [orderData]);

    const activeItem = useMemo(() => {
        if (!orderData?.items) return null;
        return orderData.items.find(i => i.orderItemId === selectedItemId) || pendingItems[0] || orderData.items[0];
    }, [orderData, selectedItemId, pendingItems]);

    const suggestedHus = useMemo(() => {
        if (!activeItem?.allocations) return [];
        return activeItem.allocations.filter(a => !a.isPicked);
    }, [activeItem]);

    const defaultPickedQuantity = useMemo(() => {
        if (!activeItem) return '';
        const pendingQty = activeItem.expectedQuantity - activeItem.pickedQuantity;
        if (pendingQty <= 0) return '';
        if (suggestedHus.length > 0) {
            return Math.min(suggestedHus[0].quantity, pendingQty).toString();
        }
        return pendingQty.toString();
    }, [activeItem, suggestedHus]);

    const effectivePickedQuantity = customPickedQuantity !== null ? customPickedQuantity : defaultPickedQuantity;

    const isOrderComplete = orderData?.items?.length > 0 && pendingItems.length === 0;

    const handleSelectPendingItem = (orderItemId) => {
        setSelectedItemId(orderItemId);
        setCustomPickedQuantity(null);
        setScannedLpn('');
        lpnInputRef.current?.focus();
    };

    const handleQuickSelectHu = (hu) => {
        setScannedLpn(hu.lpn);
        const pendingQty = activeItem.expectedQuantity - activeItem.pickedQuantity;
        setCustomPickedQuantity(Math.min(hu.quantity, pendingQty).toString());
        lpnInputRef.current?.focus();
    };

    const handleExecuteScan = async (e) => {
        e?.preventDefault();
        if (!canPickOutbound) return;

        if (!scannedLpn.trim() || !effectivePickedQuantity) {
            return toast.warning('Informe a etiqueta LPN e a quantidade.');
        }

        const qtyNum = parseFloat(effectivePickedQuantity);
        if (isNaN(qtyNum) || qtyNum <= 0) {
            return toast.warning('Informe uma quantidade válida maior que zero.');
        }

        try {
            setIsSubmitting(true);
            const payload = {
                orderId,
                orderItemId: activeItem?.orderItemId || null,
                scannedLpn: scannedLpn.trim().toUpperCase(),
                pickedQuantity: qtyNum,
                handlingServiceId: selectedHandlingServiceId && selectedHandlingServiceId !== 'none' ? selectedHandlingServiceId : null
            };

            const res = await customInstance({
                url: '/api/outbound/picking/scan',
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || 'Coleta confirmada!');
            setScannedLpn('');
            setCustomPickedQuantity(null);
            await reloadTasks(true);
            lpnInputRef.current?.focus();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao processar leitura do LPN.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // FINALIZAÇÃO EXPLÍCITA DA SEPARAÇÃO
    const handleConfirmFinalize = async () => {
        if (!canPickOutbound) return;

        try {
            setIsFinalizing(true);
            const res = await customInstance({
                url: `/api/outbound/picking/orders/${orderId}/finalize`,
                method: 'POST',
                data: {
                    orderId,
                    handlingServiceId: selectedHandlingServiceId && selectedHandlingServiceId !== 'none' ? selectedHandlingServiceId : null
                }
            });

            toast.success(res?.message || 'Separação finalizada com sucesso!');
            setIsFinalizeDialogOpen(false);

            if (res?.skippedPacking && canCheckOutbound) {
                navigate(`/outbound/conferencia/${orderId}`);
            } else if (res?.orderStatus === 'Packing' && canPackOutbound) {
                navigate(`/outbound/packing/${orderId}`);
            } else {
                navigate('/outbound');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao finalizar separação.');
        } finally {
            setIsFinalizing(false);
        }
    };

    // ESTORNO DE HU INDIVIDUAL (SUPERVISÃO)
    const handleConfirmUndoHu = async () => {
        if (!huToUndo || !canManageOutbound) return;

        try {
            setIsUndoingHu(true);
            await customInstance({
                url: `/api/outbound/picking/orders/${orderId}/undo/${huToUndo.allocationId}`,
                method: 'POST'
            });
            toast.success(`HU ${huToUndo.lpn} estornada com sucesso!`);
            setHuToUndo(null);
            setScannedLpn('');
            setCustomPickedQuantity(null);
            await reloadTasks(true);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao estornar HU.');
        } finally {
            setIsUndoingHu(false);
        }
    };

    // RESET COMPLETO DA SEPARAÇÃO (SUPERVISÃO)
    const handleConfirmReset = async () => {
        if (!canManageOutbound) return;

        try {
            setIsSubmitting(true);
            await customInstance({
                url: `/api/outbound/picking/orders/${orderId}/reset`,
                method: 'POST'
            });
            toast.success('Separação reiniciada com sucesso! Todas as HUs foram liberadas.');
            setIsResetDialogOpen(false);
            setScannedLpn('');
            setCustomPickedQuantity(null);
            await reloadTasks(false);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao reiniciar separação.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleCompletedExpand = (orderItemId) => {
        setExpandedCompletedIds(prev =>
            prev.includes(orderItemId) ? prev.filter(id => id !== orderItemId) : [...prev, orderItemId]
        );
    };

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

                <div className="flex items-center gap-3 flex-wrap">
                    {billingServices.length > 0 && (
                        <div className="flex flex-col space-y-1">
                            <Label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                                <Receipt className="text-purple-600" size={13} /> Serviço de Separação (Handling Out)
                            </Label>
                            <Select value={selectedHandlingServiceId} onValueChange={setSelectedHandlingServiceId}>
                                <SelectTrigger className="bg-slate-50 h-9 text-xs w-[240px] border-slate-200">
                                    <SelectValue placeholder="Selecione o serviço..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {billingServices.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                    <SelectItem value="none">Isento de Tarifa</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className={`${billingServices.length > 0 ? 'pt-4' : ''} flex items-center gap-2`}>
                        {canManageOutbound && (
                            <Button
                                variant="outline"
                                onClick={() => setIsResetDialogOpen(true)}
                                className="border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 h-9 text-xs font-semibold"
                                title="Reiniciar Separação"
                            >
                                <RotateCcw size={14} className="mr-1.5 text-slate-400" /> Reiniciar
                            </Button>
                        )}

                        {canPickOutbound && (
                            <Button
                                onClick={() => isOrderComplete ? setIsFinalizeDialogOpen(true) : navigate('/outbound')}
                                className={isOrderComplete ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 px-5 shadow-xs' : 'bg-white text-slate-700 border-slate-200 h-9 text-xs font-semibold'}
                                variant={isOrderComplete ? 'default' : 'outline'}
                            >
                                {isOrderComplete ? (
                                    <><CheckCircle2 size={16} className="mr-2" /> Finalizar Separação</>
                                ) : (
                                    'Salvar e Sair'
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* BANNER DE SEPARAÇÃO 100% CONCLUÍDA COM AÇÃO EXPLÍCITA */}
            {isOrderComplete && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-3 shadow-2xs">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                        <CheckCircle2 size={28} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">Todos os SKUs deste pedido foram 100% separados!</h2>
                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                        Revise os itens e HUs recolhidas abaixo. Para carimbar o término da separação e avançar para a próxima fase, clique no botão de finalização.
                    </p>
                    {canPickOutbound && (
                        <div className="pt-2 flex justify-center gap-3">
                            <Button
                                onClick={() => setIsFinalizeDialogOpen(true)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-6 shadow-xs"
                            >
                                <CheckCircle2 size={16} className="mr-2" /> Finalizar Separação do Pedido
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* ÁREA DE TRABALHO: SKU ATIVO */}
            {!isOrderComplete && activeItem && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
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
                                            onClick={() => handleSelectPendingItem(item.orderItemId)}
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

                    <div className="lg:col-span-8 space-y-4">
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
                                {canPickOutbound && (
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
                                                    value={effectivePickedQuantity}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => setCustomPickedQuantity(e.target.value)}
                                                    className="bg-white font-mono text-sm h-11 text-center border-purple-300"
                                                />
                                            </div>

                                            <div className="sm:col-span-2 flex items-end">
                                                <Button
                                                    type="submit"
                                                    disabled={isSubmitting || !scannedLpn.trim() || !effectivePickedQuantity}
                                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-11 shadow-xs"
                                                >
                                                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar'}
                                                </Button>
                                            </div>
                                        </div>
                                    </form>
                                )}

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

                                                        {canPickOutbound && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                onClick={() => handleQuickSelectHu(hu)}
                                                                variant="outline"
                                                                className="h-9 px-3 text-xs font-semibold border-purple-200 text-purple-700 hover:bg-purple-50"
                                                            >
                                                                <Barcode size={13} className="mr-1.5" /> Bipar esta HU
                                                            </Button>
                                                        )}
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

            {/* SEÇÃO DE SKUS TOTALMENTE SEPARADOS COM OPÇÃO DE ESTORNO */}
            {completedItems.length > 0 && (
                <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                            <CheckCircle2 size={15} className="text-emerald-600" /> SKUs Totalmente Separados ({completedItems.length})
                        </h3>
                        <span className="text-[11px] text-slate-400 font-mono">
                            {canManageOutbound ? 'Expanda para auditar ou estornar HUs' : 'Expanda para auditar HUs coletadas'}
                        </span>
                    </div>

                    <div className="space-y-2">
                        {completedItems.map((item) => {
                            const isExpanded = expandedCompletedIds.includes(item.orderItemId);
                            const itemPickedHus = item.allocations?.filter(a => a.isPicked) || [];
                            const colSpanCount = canManageOutbound ? 7 : 6;

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
                                                        {canManageOutbound && <TableHead className="text-right text-xs">Ações</TableHead>}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {itemPickedHus.length === 0 ? (
                                                        <TableRow>
                                                            <TableCell colSpan={colSpanCount} className="text-center text-xs text-slate-400 italic">
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
                                                                {canManageOutbound && (
                                                                    <TableCell className="text-right">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => setHuToUndo(hu)}
                                                                            className="h-7 text-xs text-rose-600 hover:bg-rose-50"
                                                                            title="Estornar separação desta HU"
                                                                        >
                                                                            <Undo2 size={13} className="mr-1" /> Estornar
                                                                        </Button>
                                                                    </TableCell>
                                                                )}
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

            {/* MODAL DE CONFIRMAÇÃO DE FINALIZAÇÃO */}
            {canPickOutbound && (
                <AlertDialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
                    <AlertDialogContent className="bg-white sm:max-w-md">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2 text-emerald-800">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Finalizar Separação do Pedido?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-slate-600 space-y-2">
                                <span>
                                    Deseja confirmar a finalização física da separação da Ordem <strong className="text-slate-900 font-mono">#{orderData?.orderNumber}</strong>?
                                </span>
                                <p className="text-slate-500">
                                    O pedido avançará para a próxima etapa (Conferência se 100% volumes fechados, ou Embalagem/Packing se houver fracionamento).
                                </p>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="pt-2">
                            <AlertDialogCancel disabled={isFinalizing}>Revisar Mais</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleConfirmFinalize}
                                disabled={isFinalizing}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                                {isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                                Confirmar Finalização
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}

            {/* MODAL DE ESTORNO DE HU INDIVIDUAL */}
            {canManageOutbound && (
                <AlertDialog open={!!huToUndo} onOpenChange={(open) => !open && setHuToUndo(null)}>
                    <AlertDialogContent className="bg-white sm:max-w-md">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
                                <Undo2 className="h-5 w-5 text-rose-600" /> Estornar HU Coletada?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-slate-600 space-y-2">
                                <span>
                                    Deseja estornar a coleta da HU <strong className="text-slate-900 font-mono">{huToUndo?.lpn}</strong> ({huToUndo?.quantity} un)?
                                </span>
                                <p className="text-slate-500">
                                    A etiqueta será devolvida para as sugestões pendentes deste SKU e liberada no armazém.
                                </p>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="pt-2">
                            <AlertDialogCancel disabled={isUndoingHu}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleConfirmUndoHu}
                                disabled={isUndoingHu}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                            >
                                {isUndoingHu ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                                Confirmar Estorno
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}

            {/* MODAL DE RESET GERAL */}
            {canManageOutbound && (
                <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                    <AlertDialogContent className="bg-white sm:max-w-md">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
                                <RotateCcw className="h-5 w-5 text-rose-600" /> Reiniciar Separação Completa?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-slate-600 space-y-2">
                                <span>
                                    Deseja cancelar todas as coletas já feitas para a Ordem <strong className="text-slate-900 font-mono">#{orderData?.orderNumber}</strong>?
                                </span>
                                <p className="text-slate-500">
                                    Todas as HUs recolhidas retornarão ao estado inicial de reserva (Alocado).
                                </p>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="pt-2">
                            <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleConfirmReset}
                                disabled={isSubmitting}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                            >
                                Confirmar Reinício
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    );
}