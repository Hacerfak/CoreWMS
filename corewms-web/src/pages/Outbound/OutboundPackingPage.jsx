import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, CheckCircle2, Loader2, Truck, Package, Box, Layers,
    Plus, Trash2, AlertCircle, ShieldCheck, Warehouse, Sparkles, Receipt, Check
} from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundPackingPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    const [order, setOrder] = useState(null);
    const [globalPackagingTypes, setGlobalPackagingTypes] = useState([]);
    const [docks, setDocks] = useState([]);
    const [billingServices, setBillingServices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // --- SERVIÇO DE TARIFICAÇÃO DE SEPARAÇÃO (HANDLING OUT) ---
    const [selectedHandlingServiceId, setSelectedHandlingServiceId] = useState('');

    // --- ESTADOS DO MOMENTO 1 (ITEM A ITEM) ---
    const [selectedItemId, setSelectedItemId] = useState(null);
    const [itemPackagings, setItemPackagings] = useState([]);
    const [isLoadingItemPacks, setIsLoadingItemPacks] = useState(false);
    const [isSavingItemPack, setIsSavingItemPack] = useState(false);

    // Linhas de apontamento do item em edição
    const [currentItemPacks, setCurrentItemPacks] = useState([
        { packagingTypeId: '', volumeCount: '', quantityPerVolume: 0 }
    ]);

    // --- ESTADOS DO MOMENTO 2 (FECHAMENTO DE TRANSPORTE) ---
    const [selectedDockId, setSelectedDockId] = useState('');
    const [usedStretch, setUsedStretch] = useState(false);
    const [shippingVolumes, setShippingVolumes] = useState([
        { packagingTypeId: '', volumeCount: '', grossWeight: '' }
    ]);
    const [isFinalizing, setIsFinalizing] = useState(false);

    // Carregamento inicial da ordem, docas, embalagens e serviços de faturamento
    const loadOrderData = async () => {
        try {
            setIsLoading(true);
            const [orderRes, packTypesRes, docksRes, servicesRes] = await Promise.all([
                customInstance({ url: `/api/outbound/orders/${orderId}`, method: 'GET' }),
                customInstance({ url: '/api/packaging-types', method: 'GET' }),
                customInstance({ url: '/api/topology/locations/docks', method: 'GET' }),
                customInstance({ url: '/api/billing/services', method: 'GET' })
            ]);

            const orderData = orderRes?.data || orderRes;
            setOrder(orderData);

            const packTypes = Array.isArray(packTypesRes) ? packTypesRes : (packTypesRes?.items || []);
            setGlobalPackagingTypes(packTypes);

            const dockList = Array.isArray(docksRes) ? docksRes : (docksRes?.items || []);
            setDocks(dockList);

            if (dockList.length > 0 && !selectedDockId) {
                setSelectedDockId(dockList[0].id);
            }

            const servicesList = Array.isArray(servicesRes) ? servicesRes : (servicesRes?.items || []);
            setBillingServices(servicesList);

            // Sugere automaticamente o serviço padrão de Handling Out / Expedição
            if (servicesList.length > 0 && !selectedHandlingServiceId) {
                const defaultHandling = servicesList.find(s =>
                    s.name?.toLowerCase().includes('expedição') ||
                    s.name?.toLowerCase().includes('handling out') ||
                    s.name?.toLowerCase().includes('saída')
                );
                if (defaultHandling) {
                    setSelectedHandlingServiceId(defaultHandling.id);
                }
            }

            // Seleciona o primeiro SKU pendente
            if (orderData?.items?.length > 0) {
                const firstPending = orderData.items.find(i => i.status !== 'Packed' && i.packedQuantity < i.expectedQuantity);
                setSelectedItemId(firstPending ? firstPending.id : orderData.items[0].id);
            }
        } catch {
            toast.error('Erro ao carregar dados do pedido para packing.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) loadOrderData();
    }, [orderId]);

    // Item selecionado para trabalho no momento
    const selectedItem = useMemo(() => {
        return order?.items?.find(i => i.id === selectedItemId);
    }, [order, selectedItemId]);

    // Carrega as embalagens cadastradas no SKU do produto e os apontamentos existentes
    useEffect(() => {
        if (!selectedItem?.productId || !orderId) return;

        const loadItemDetails = async () => {
            try {
                setIsLoadingItemPacks(true);

                const packsRes = await customInstance({
                    url: `/api/products/${selectedItem.productId}/packagings`,
                    method: 'GET'
                });
                const availablePacks = Array.isArray(packsRes) ? packsRes : [];
                setItemPackagings(availablePacks);

                // Consulta se este item já possui apontamentos salvos
                const currentStatus = await customInstance({
                    url: `/api/outbound/packing/orders/${orderId}/items/${selectedItem.id}`,
                    method: 'GET'
                });

                if (currentStatus?.packs && currentStatus.packs.length > 0) {
                    setCurrentItemPacks(currentStatus.packs.map(p => ({
                        packagingTypeId: p.packagingTypeId,
                        volumeCount: p.volumeCount,
                        quantityPerVolume: p.quantityPerVolume
                    })));
                } else if (availablePacks.length > 0) {
                    const defaultPack = availablePacks[0];
                    const factor = defaultPack.conversionFactor || 1;
                    const calculatedVolCount = Math.max(1, Math.floor(selectedItem.pickedQuantity / factor));

                    setCurrentItemPacks([
                        {
                            packagingTypeId: defaultPack.packagingTypeId,
                            volumeCount: calculatedVolCount,
                            quantityPerVolume: factor
                        }
                    ]);
                } else {
                    setCurrentItemPacks([
                        {
                            packagingTypeId: globalPackagingTypes[0]?.id || '',
                            volumeCount: '',
                            quantityPerVolume: selectedItem.pickedQuantity
                        }
                    ]);
                }
            } catch {
                toast.error('Erro ao carregar embalagens do produto.');
            } finally {
                setIsLoadingItemPacks(false);
            }
        };

        loadItemDetails();
    }, [selectedItemId, selectedItem?.productId, orderId]);

    // Subtotal de peças do SKU ativo
    const currentPointedTotal = useMemo(() => {
        return currentItemPacks.reduce((acc, curr) => {
            const count = Number(curr.volumeCount) || 0;
            const perVol = Number(curr.quantityPerVolume) || 0;
            return acc + (count * perVol);
        }, 0);
    }, [currentItemPacks]);

    const isCurrentItemBalanced = selectedItem && currentPointedTotal === selectedItem.pickedQuantity;

    // Métricas de progresso dos itens
    const packedItemsCount = useMemo(() => {
        return order?.items?.filter(i => i.status === 'Packed' || i.packedQuantity >= i.expectedQuantity).length || 0;
    }, [order]);

    const allItemsPacked = useMemo(() => {
        if (!order?.items || order.items.length === 0) return false;
        return order.items.every(i => i.status === 'Packed' || i.packedQuantity >= i.expectedQuantity);
    }, [order]);

    const handleAddPackRow = () => {
        const defaultPack = itemPackagings[0] || globalPackagingTypes[0];
        setCurrentItemPacks(prev => [
            ...prev,
            {
                packagingTypeId: defaultPack?.packagingTypeId || defaultPack?.id || '',
                volumeCount: '',
                quantityPerVolume: defaultPack?.conversionFactor || 1
            }
        ]);
    };

    const handleRemovePackRow = (idx) => {
        setCurrentItemPacks(prev => prev.filter((_, i) => i !== idx));
    };

    const handlePackRowChange = (idx, field, value) => {
        setCurrentItemPacks(prev => {
            const updated = [...prev];
            if (field === 'volumeCount') {
                const cleanNum = value.replace(/\D/g, '');
                updated[idx] = { ...updated[idx], volumeCount: cleanNum };
            } else {
                updated[idx] = { ...updated[idx], [field]: value };
            }

            if (field === 'packagingTypeId') {
                const foundPack = itemPackagings.find(p => p.packagingTypeId === value);
                if (foundPack) {
                    updated[idx].quantityPerVolume = foundPack.conversionFactor;
                }
            }
            return updated;
        });
    };

    // Confirmação do Momento 1 para o SKU selecionado
    const handleSaveItemPacking = async () => {
        if (!selectedItem) return;

        if (!selectedHandlingServiceId) {
            return toast.warning('Selecione o Serviço de Separação / Handling Out para tarifação no faturamento.');
        }

        if (currentPointedTotal !== selectedItem.pickedQuantity) {
            return toast.warning(
                `A soma apontada (${currentPointedTotal} ${selectedItem.unit}) difere do separado (${selectedItem.pickedQuantity} ${selectedItem.unit}). O saldo precisa fechar em 100%.`
            );
        }

        try {
            setIsSavingItemPack(true);
            const payload = {
                orderId,
                orderItemId: selectedItem.id,
                billingServiceId: selectedHandlingServiceId !== 'none' ? selectedHandlingServiceId : null,
                packs: currentItemPacks.map(p => ({
                    packagingTypeId: p.packagingTypeId,
                    volumeCount: Number(p.volumeCount),
                    quantityPerVolume: Number(p.quantityPerVolume)
                }))
            };

            await customInstance({
                url: `/api/outbound/packing/orders/${orderId}/items/${selectedItem.id}`,
                method: 'POST',
                data: payload
            });

            toast.success(`Apontamento de ${selectedItem.skuCode} concluído!`);

            // Recarrega o pedido para atualizar o status dos itens
            const updatedOrderRes = await customInstance({ url: `/api/outbound/orders/${orderId}`, method: 'GET' });
            const updatedOrder = updatedOrderRes?.data || updatedOrderRes;
            setOrder(updatedOrder);

            // Seleciona automaticamente o próximo SKU pendente
            const nextPending = updatedOrder?.items?.find(i => i.id !== selectedItem.id && i.status !== 'Packed' && i.packedQuantity < i.expectedQuantity);
            if (nextPending) {
                setSelectedItemId(nextPending.id);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao gravar apontamento do item.');
        } finally {
            setIsSavingItemPack(false);
        }
    };

    // --- FUNÇÕES DO MOMENTO 2 (FECHAMENTO DE TRANSPORTE) ---
    const handleAddShippingVolumeRow = () => {
        const defaultPack = globalPackagingTypes[0];
        setShippingVolumes(prev => [
            ...prev,
            {
                packagingTypeId: defaultPack?.id || '',
                volumeCount: '',
                grossWeight: ''
            }
        ]);
    };

    const handleRemoveShippingVolumeRow = (idx) => {
        setShippingVolumes(prev => prev.filter((_, i) => i !== idx));
    };

    const handleShippingVolumeChange = (idx, field, value) => {
        setShippingVolumes(prev => {
            const updated = [...prev];
            if (field === 'volumeCount') {
                const cleanNum = value.replace(/\D/g, '');
                updated[idx] = { ...updated[idx], volumeCount: cleanNum };
            } else {
                updated[idx] = { ...updated[idx], [field]: value };
            }
            return updated;
        });
    };

    const handleFinalizePacking = async (e) => {
        e.preventDefault();

        if (!allItemsPacked) {
            return toast.error('Existem itens com conferência pendente no Momento 1. Complete todos os SKUs antes de finalizar.');
        }

        if (!selectedDockId) {
            return toast.error('Selecione a Doca de embarque destino.');
        }

        const validVolumes = shippingVolumes.filter(v => v.packagingTypeId && Number(v.volumeCount) > 0);
        if (validVolumes.length === 0) {
            return toast.error('Informe ao menos um volume de transporte no Momento 2.');
        }

        try {
            setIsFinalizing(true);
            const payload = {
                orderId,
                dockLocationId: selectedDockId,
                usedStretchFilm: usedStretch,
                handlingServiceId: selectedHandlingServiceId !== 'none' ? selectedHandlingServiceId : null,
                shippingVolumes: validVolumes.map(v => ({
                    packagingTypeId: v.packagingTypeId,
                    volumeCount: Number(v.volumeCount),
                    grossWeight: v.grossWeight ? Number(v.grossWeight) : null
                }))
            };

            const res = await customInstance({
                url: `/api/outbound/packing/orders/${orderId}/finalize`,
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || 'Packing finalizado e tarifação gravada no faturamento com sucesso!');
            navigate(`/outbound`);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao finalizar packing.');
        } finally {
            setIsFinalizing(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando estativa de packing operacional...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO COM SERVIÇO DE TARIFICAÇÃO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/outbound')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <Package className="text-orange-600" size={22} /> Packing & Expedição (2 Momentos)
                            </h1>
                            <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs font-mono">
                                Pedido #{order?.orderNumber}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong>{order?.customerName}</strong> | Destinatário: <strong>{order?.destinationName}</strong>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* SELETOR DO SERVIÇO DE SEPARAÇÃO / HANDLING OUT */}
                    <div className="flex flex-col space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <Receipt className="text-orange-600" size={13} /> Serviço de Separação (Handling Out) *
                        </Label>
                        <Select value={selectedHandlingServiceId} onValueChange={setSelectedHandlingServiceId}>
                            <SelectTrigger className={`bg-slate-50 h-9 text-xs w-[260px] ${!selectedHandlingServiceId ? 'border-amber-300' : 'border-slate-200'}`}>
                                <SelectValue placeholder="Selecione o serviço contratado..." />
                            </SelectTrigger>
                            <SelectContent>
                                {billingServices.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                                <SelectItem value="none">Isento de Tarifa Adicional</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="pt-4">
                        <Badge className={`text-xs h-9 px-3 flex items-center gap-1.5 ${allItemsPacked ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                            {allItemsPacked ? <Check size={14} /> : <Layers size={14} />}
                            {allItemsPacked ? 'Momento 1 Pronto (100%)' : `Momento 1: ${packedItemsCount}/${order?.items?.length || 0} OK`}
                        </Badge>
                    </div>
                </div>
            </div>

            {/* GRID PRINCIPAL */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* COLUNA ESQUERDA: MOMENTO 1 (ITENS DA ORDEM E TRABALHO DO SKU SELECIONADO) */}
                <div className="lg:col-span-7 space-y-5">

                    {/* LISTA DINÂMICA DE SKUS DA ORDEM */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60 flex flex-row items-center justify-between">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <Layers size={16} className="text-orange-600" /> 1. Apontamento Operacional Item a Item (Handling Out)
                            </CardTitle>
                            <span className="text-[11px] text-slate-500 font-mono">
                                Clique no SKU para trabalhar o apontamento
                            </span>
                        </CardHeader>

                        <CardContent className="p-3">
                            <div className="grid grid-cols-1 gap-2">
                                {order?.items?.map(item => {
                                    const isSelected = item.id === selectedItemId;
                                    const isItemCompleted = item.status === 'Packed' || item.packedQuantity >= item.expectedQuantity;

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedItemId(item.id)}
                                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${isSelected
                                                ? 'border-orange-500 bg-orange-50/50 shadow-xs ring-2 ring-orange-500/20'
                                                : isItemCompleted
                                                    ? 'border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/40'
                                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-3 h-3 rounded-full flex items-center justify-center ${isItemCompleted ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-white'}`}>
                                                    {isItemCompleted && <Check size={8} />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-xs text-slate-900">{item.skuCode}</span>
                                                        <Badge variant="outline" className="text-[10px] font-mono">{item.unit}</Badge>
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 truncate max-w-sm">{item.description}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs font-mono">
                                                <div className="text-right">
                                                    <span className="text-[10px] text-slate-400 block uppercase">Separado / Conferido</span>
                                                    <span className="font-bold text-slate-800">{item.pickedQuantity} {item.unit}</span>
                                                    <span className="text-emerald-700 font-bold ml-1.5">({item.packedQuantity} OK)</span>
                                                </div>
                                                <Badge className={`text-xs ${isItemCompleted ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                                                    {isItemCompleted ? '✓ Concluído' : 'Pendente'}
                                                </Badge>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* MESA DE TRABALHO DO SKU SELECIONADO */}
                    {selectedItem && (
                        <Card className="border-orange-200 bg-orange-50/20 shadow-xs">
                            <CardHeader className="p-4 border-b border-orange-200/80 bg-orange-100/40 flex flex-row items-center justify-between">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-orange-900 block">SKU Selecionado para Trabalho</span>
                                    <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <Box size={16} className="text-orange-700" /> {selectedItem.skuCode} - {selectedItem.description}
                                    </CardTitle>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-slate-500 block uppercase">Total a Apontar</span>
                                    <span className="font-mono font-bold text-slate-900 text-sm">{selectedItem.pickedQuantity} {selectedItem.unit}</span>
                                </div>
                            </CardHeader>

                            <CardContent className="p-4 space-y-4">
                                <div className="p-3 bg-white border border-orange-200 rounded-xl space-y-1 text-xs text-slate-700">
                                    <p className="font-bold text-orange-950 flex items-center gap-1.5">
                                        <Sparkles size={14} className="text-orange-600" /> Apontamento Físico de Embalagens do SKU:
                                    </p>
                                    <p>
                                        Informe os volumes físicos preparados (ex: Paletes ou Caixas). A soma das peças deve totalizar exatamente <strong>{selectedItem.pickedQuantity} {selectedItem.unit}</strong>.
                                    </p>
                                </div>

                                {isLoadingItemPacks ? (
                                    <div className="py-8 text-center text-slate-500 text-xs flex justify-center items-center gap-2">
                                        <Loader2 className="animate-spin h-4 w-4 text-orange-600" /> Carregando embalagens do SKU...
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="border border-slate-200 bg-white rounded-xl overflow-hidden">
                                            <Table>
                                                <TableHeader className="bg-slate-50">
                                                    <TableRow>
                                                        <TableHead>Tipo de Embalagem</TableHead>
                                                        <TableHead className="w-28 text-center">Qtd Volumes</TableHead>
                                                        <TableHead className="w-32 text-center">Peças p/ Volume</TableHead>
                                                        <TableHead className="w-28 text-right">Subtotal</TableHead>
                                                        <TableHead className="w-10 text-right"></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {currentItemPacks.map((packRow, idx) => {
                                                        const rowSubtotal = (Number(packRow.volumeCount) || 0) * (Number(packRow.quantityPerVolume) || 0);

                                                        return (
                                                            <TableRow key={idx}>
                                                                <TableCell>
                                                                    <Select
                                                                        value={packRow.packagingTypeId}
                                                                        onValueChange={(val) => handlePackRowChange(idx, 'packagingTypeId', val)}
                                                                    >
                                                                        <SelectTrigger className="bg-white text-xs h-9">
                                                                            <SelectValue placeholder="Selecione a embalagem..." />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {itemPackagings.length > 0 ? (
                                                                                itemPackagings.map(pt => (
                                                                                    <SelectItem key={pt.packagingTypeId} value={pt.packagingTypeId}>
                                                                                        {pt.code} - {pt.description} (Fator: {pt.conversionFactor})
                                                                                    </SelectItem>
                                                                                ))
                                                                            ) : (
                                                                                globalPackagingTypes.map(pt => (
                                                                                    <SelectItem key={pt.id} value={pt.id}>
                                                                                        {pt.code} - {pt.description}
                                                                                    </SelectItem>
                                                                                ))
                                                                            )}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </TableCell>

                                                                <TableCell>
                                                                    <Input
                                                                        type="text"
                                                                        inputMode="numeric"
                                                                        placeholder="Qtd"
                                                                        value={packRow.volumeCount}
                                                                        onChange={(e) => handlePackRowChange(idx, 'volumeCount', e.target.value)}
                                                                        className="font-mono text-xs text-center h-9 bg-white"
                                                                    />
                                                                </TableCell>

                                                                <TableCell>
                                                                    <Input
                                                                        type="number"
                                                                        step="0.0001"
                                                                        value={packRow.quantityPerVolume}
                                                                        onChange={(e) => handlePackRowChange(idx, 'quantityPerVolume', e.target.value)}
                                                                        className="font-mono text-xs text-center h-9 bg-white"
                                                                    />
                                                                </TableCell>

                                                                <TableCell className="text-right font-mono font-bold text-xs text-slate-800">
                                                                    {rowSubtotal} {selectedItem.unit}
                                                                </TableCell>

                                                                <TableCell className="text-right">
                                                                    {currentItemPacks.length > 1 && (
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => handleRemovePackRow(idx)}
                                                                            className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </Button>
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        <div className="flex items-center justify-between pt-1">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleAddPackRow}
                                                className="bg-white text-orange-700 border-orange-200 hover:bg-orange-50 text-xs h-8"
                                            >
                                                <Plus size={13} className="mr-1" /> Adicionar Outro Tipo de Embalagem
                                            </Button>

                                            <div className="flex items-center gap-4 text-xs font-mono">
                                                <span>Total Apontado:</span>
                                                <Badge className={isCurrentItemBalanced ? 'bg-emerald-600 text-white font-bold' : 'bg-rose-600 text-white font-bold'}>
                                                    {currentPointedTotal} / {selectedItem.pickedQuantity} {selectedItem.unit}
                                                </Badge>
                                            </div>
                                        </div>

                                        <div className="pt-2 border-t border-orange-200 flex justify-end">
                                            <Button
                                                type="button"
                                                onClick={handleSaveItemPacking}
                                                disabled={isSavingItemPack || !isCurrentItemBalanced}
                                                className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9 px-5 shadow-xs"
                                            >
                                                {isSavingItemPack ? (
                                                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                                                ) : (
                                                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                                )}
                                                Confirmar Apontamento do SKU {selectedItem.skuCode}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* COLUNA DIREITA: MOMENTO 2 (LIBERADO APENAS QUANDO 100% DOS SKUS ESTIVEREM PRONTOS) */}
                <div className="lg:col-span-5 space-y-5">
                    <Card className={`border shadow-xs transition-all ${allItemsPacked ? 'border-emerald-200 bg-white ring-1 ring-emerald-500/20' : 'border-slate-200 bg-slate-50 opacity-80'}`}>
                        <CardHeader className={`p-4 border-b ${allItemsPacked ? 'bg-emerald-50/60' : 'bg-slate-100'}`}>
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Truck size={16} className={allItemsPacked ? 'text-emerald-600' : 'text-slate-400'} />
                                    2. Fechamento de Carga & Transporte (SEFAZ)
                                </span>
                                {allItemsPacked ? (
                                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Liberado para Embarque</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-slate-500 bg-white">Bloqueado</Badge>
                                )}
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="p-4 space-y-5">
                            {!allItemsPacked ? (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
                                    <div className="flex items-center gap-2 font-bold">
                                        <AlertCircle size={16} className="text-amber-600" /> Momento 2 Bloqueado
                                    </div>
                                    <p>
                                        Conclua o apontamento de todos os SKUs na coluna ao lado ({packedItemsCount}/{order?.items?.length || 0} finalizados).
                                        Assim que todos estiverem verdes (100% Concluído), o fechamento de transporte e faturamento de saída será liberado.
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={handleFinalizePacking} className="space-y-4">
                                    {/* SELEÇÃO DA DOCA */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                            <Warehouse size={14} className="text-emerald-600" /> Doca de Embarque Destino *
                                        </Label>
                                        <Select value={selectedDockId} onValueChange={setSelectedDockId}>
                                            <SelectTrigger className="bg-white text-xs h-10 border-slate-300">
                                                <SelectValue placeholder="Escolha a doca de staging..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {docks.map(d => (
                                                    <SelectItem key={d.id} value={d.id}>
                                                        <span className="font-mono font-bold text-slate-900">{d.code || d.fullPath}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* VOLUMES DE TRANSPORTE (SEFAZ) */}
                                    <div className="space-y-2 pt-2 border-t border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-bold text-slate-800">
                                                Volumes Finais para Despacho (SEFAZ/Transp) *
                                            </Label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleAddShippingVolumeRow}
                                                className="text-emerald-700 hover:bg-emerald-50 h-7 text-xs px-2"
                                            >
                                                <Plus size={12} className="mr-1" /> Adicionar Volume
                                            </Button>
                                        </div>

                                        <div className="space-y-2">
                                            {shippingVolumes.map((volRow, idx) => (
                                                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-bold uppercase text-slate-600 font-mono">Volume #{idx + 1}</span>
                                                        {shippingVolumes.length > 1 && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleRemoveShippingVolumeRow(idx)}
                                                                className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-50"
                                                            >
                                                                <Trash2 size={13} />
                                                            </Button>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                        <div className="space-y-1 md:col-span-2">
                                                            <Label className="text-[10px]">Tipo da Embalagem *</Label>
                                                            <Select
                                                                value={volRow.packagingTypeId}
                                                                onValueChange={(val) => handleShippingVolumeChange(idx, 'packagingTypeId', val)}
                                                            >
                                                                <SelectTrigger className="bg-white text-xs h-8">
                                                                    <SelectValue placeholder="Selecione o tipo..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {globalPackagingTypes.map(pt => (
                                                                        <SelectItem key={pt.id} value={pt.id}>
                                                                            {pt.code} - {pt.description}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <Label className="text-[10px]">Qtd Volumes *</Label>
                                                            <Input
                                                                type="text"
                                                                inputMode="numeric"
                                                                placeholder="Qtd"
                                                                value={volRow.volumeCount}
                                                                onChange={(e) => handleShippingVolumeChange(idx, 'volumeCount', e.target.value)}
                                                                className="font-mono text-xs text-center h-8 bg-white"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label className="text-[10px]">Peso Bruto Unitário (KG - Opcional)</Label>
                                                        <Input
                                                            type="number"
                                                            step="0.001"
                                                            placeholder="Calculado automaticamente se vazio"
                                                            value={volRow.grossWeight}
                                                            onChange={(e) => handleShippingVolumeChange(idx, 'grossWeight', e.target.value)}
                                                            className="font-mono text-xs h-8 bg-white"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* INSUMO FILME STRETCH */}
                                    <div className="flex items-start space-x-2 pt-3 border-t border-slate-100 bg-slate-50 p-3 rounded-xl border">
                                        <Checkbox
                                            id="stretch"
                                            checked={usedStretch}
                                            onCheckedChange={setUsedStretch}
                                            className="mt-0.5"
                                        />
                                        <label htmlFor="stretch" className="text-xs text-slate-700 font-medium cursor-pointer leading-tight">
                                            Aplicação de Filme Stretch nos Paletes
                                            <span className="text-[10px] text-slate-500 block font-normal mt-0.5">
                                                (Registra a tarifação do Insumo no ciclo de faturamento deste mês via query SQL)
                                            </span>
                                        </label>
                                    </div>

                                    {/* BOTÃO FINALIZAR */}
                                    <Button
                                        type="submit"
                                        disabled={isFinalizing || !selectedDockId}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 shadow-sm mt-3"
                                    >
                                        {isFinalizing ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Finalizando Packing & Faturamento...
                                            </>
                                        ) : (
                                            <>
                                                <ShieldCheck className="h-4 w-4 mr-2" /> Concluir Packing & Liberar para Doca 🚀
                                            </>
                                        )}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}