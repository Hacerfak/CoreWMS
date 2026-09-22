import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    useGetApiInboundId,
    usePostApiInboundReceiveCheckout,
    usePostApiInboundReceiveOrderItemIdRelease
} from '@/api/generated/inbound/inbound';
import { useGetApiProducts } from '@/api/generated/products/products';
import { useGetApiBillingServices } from '@/api/generated/billing/billing';
import { useGetApiPackagingTypes } from '@/api/generated/packaging-types/packaging-types';
import {
    useGetApiTopologyLocationsDocks,
    useGetApiTopologyLocationsStorage
} from '@/api/generated/topology/topology';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, Loader2, PackageCheck, Plus, Trash2, CheckCircle2,
    Receipt, AlertTriangle, FileWarning, Upload, ShoppingCart, Box, Printer, Search, ShieldAlert, PauseCircle
} from 'lucide-react';
import { toast } from 'sonner';
import PrintHuModal from './PrintHuModal';

// COMPONENTE SELETOR PESQUISÁVEL DE POSIÇÕES
function SearchableLocationSelect({ value, onChange, locations, placeholder = "Pesquisar Posição ou Doca (ex: P1C1AB01)..." }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const selectedLocation = locations.find(l => l.id === value);

    const filteredLocations = useMemo(() => {
        if (!searchTerm) return locations.slice(0, 40);
        const term = searchTerm.toLowerCase();
        return locations.filter(l => l.fullPath?.toLowerCase().includes(term)).slice(0, 40);
    }, [locations, searchTerm]);

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                <span className={selectedLocation ? 'text-slate-900 font-semibold font-mono' : 'text-slate-400'}>
                    {selectedLocation ? selectedLocation.fullPath : placeholder}
                </span>
                <Search size={14} className="text-slate-400 shrink-0 ml-2" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Digite para filtrar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                        />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1">
                        {filteredLocations.length === 0 ? (
                            <p className="text-[11px] text-slate-400 p-2 text-center">Nenhuma posição encontrada.</p>
                        ) : (
                            filteredLocations.map(loc => (
                                <div
                                    key={loc.id}
                                    onClick={() => {
                                        onChange(loc.id);
                                        setIsOpen(false);
                                        setSearchTerm('');
                                    }}
                                    className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between font-mono transition-colors ${value === loc.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'}`}
                                >
                                    <span>{loc.fullPath}</span>
                                    {value === loc.id && <CheckCircle2 size={12} className="text-blue-600" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ConferenciaItemPage() {
    const { orderId, itemId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    // 1. Dados da Ordem
    const { data: order, isLoading: isLoadingOrder } = useGetApiInboundId(orderId);
    const item = order?.items?.find(i => i.id === itemId);

    // 2. Detalhes do Produto no WMS
    const { data: productsRes } = useGetApiProducts(
        { Search: item?.sku || item?.rawSkuCode, PageSize: 5 },
        { query: { enabled: !!(item?.sku || item?.rawSkuCode) } }
    );
    const productDetail = productsRes?.items?.find(p => p.id === item?.productId || p.sku === item?.sku);

    // 3. APIs de Apoio
    const { data: billingServicesResponse } = useGetApiBillingServices();
    const billingServices = Array.isArray(billingServicesResponse) ? billingServicesResponse : (billingServicesResponse?.items || []);

    const { data: packTypesResponse } = useGetApiPackagingTypes();
    const globalPackTypes = Array.isArray(packTypesResponse) ? packTypesResponse : (packTypesResponse?.items || []);

    const { data: docks = [] } = useGetApiTopologyLocationsDocks();
    const { data: storageLocations = [] } = useGetApiTopologyLocationsStorage();
    const targetLocations = useMemo(() => [...docks, ...storageLocations], [docks, storageLocations]);

    // Embalagens atreladas ao cadastro do produto
    const availablePackagings = useMemo(() => {
        if (productDetail?.packagings && productDetail.packagings.length > 0) {
            return productDetail.packagings.map(p => {
                const globalType = globalPackTypes.find(g => g.id === p.packagingTypeId);
                return {
                    packagingTypeId: p.packagingTypeId,
                    code: globalType?.code || 'EMB',
                    description: globalType?.description || 'Embalagem',
                    conversionFactor: p.conversionFactor,
                    barcode: p.barcode
                };
            });
        }
        return globalPackTypes.map(g => ({
            packagingTypeId: g.id,
            code: g.code,
            description: g.description,
            conversionFactor: 1,
            barcode: null
        }));
    }, [productDetail, globalPackTypes]);

    // REGRAS ESTRITAS DE RASTREABILIDADE - DEPENDEM EXCLUSIVAMENTE DO CADASTRO DO PRODUTO WMS
    const tracksBatch = Boolean(productDetail?.tracksBatch);
    const tracksExpiration = Boolean(productDetail?.tracksExpiration);
    const tracksManufacture = Boolean(productDetail?.tracksManufacture);
    const tracksSerial = Boolean(productDetail?.tracksSerial);

    // 4. Estados do Formulário
    const [selectedBillingServiceId, setSelectedBillingServiceId] = useState('');

    const [volumeConfig, setVolumeConfig] = useState({
        packagingTypeId: '',
        volumeCount: 1,
        quantityPerVolume: 0,
        batch: '',
        manufactureDate: '',
        expirationDate: '',
        serialNumber: '',
        targetLocationId: '',
        qualityStatus: '',
        notes: '',
        images: []
    });

    // Carrinho
    const [stagedVolumes, setStagedVolumes] = useState([]);
    const [generatedHusResult, setGeneratedHusResult] = useState(null);

    // Pré-preenchimento Automático RESPEITANDO rigorosamente as travas do cadastro do produto
    useEffect(() => {
        if (item) {
            setVolumeConfig(prev => ({
                ...prev,
                batch: tracksBatch ? (item.expectedBatch || '') : '',
                expirationDate: (tracksExpiration && item.expectedExpirationDate) ? item.expectedExpirationDate.split('T')[0] : '',
                manufactureDate: (tracksManufacture && item.expectedManufactureDate) ? item.expectedManufactureDate.split('T')[0] : '',
                targetLocationId: item.dockLocationId || ''
            }));
        }
    }, [item, tracksBatch, tracksExpiration, tracksManufacture]);

    const handlePackagingChange = (typeId) => {
        const selectedPack = availablePackagings.find(p => p.packagingTypeId === typeId);
        setVolumeConfig(prev => ({
            ...prev,
            packagingTypeId: typeId,
            quantityPerVolume: selectedPack ? selectedPack.conversionFactor : 1
        }));
    };

    // Mutação de Liberação/Pausa do Item
    const { mutate: releaseItem, isPending: isReleasing } = usePostApiInboundReceiveOrderItemIdRelease({
        mutation: {
            onSuccess: () => {
                toast.success('Recebimento pausado e liberado com sucesso.');
                queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
                navigate(`/inbound/operacao/${orderId}`);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao pausar/liberar item.')
        }
    });

    const { mutate: checkoutLotes, isPending: isSubmitting } = usePostApiInboundReceiveCheckout({
        mutation: {
            onSuccess: (res) => {
                toast.success('Checkout realizado e HUs geradas!');
                queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });

                if (res?.husGenerated) {
                    setGeneratedHusResult(res.husGenerated);
                } else {
                    navigate(`/inbound/operacao/${orderId}`);
                }
            },
            onError: (err) => toast.error(err.response?.data?.message || err.response?.data?.detail || 'Erro no checkout.')
        }
    });

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setVolumeConfig(prev => ({
                    ...prev,
                    images: [...prev.images, { fileName: file.name, base64Data: reader.result }]
                }));
            };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (idx) => {
        setVolumeConfig(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== idx)
        }));
    };

    const handleAddVolumeToCart = () => {
        if (!selectedBillingServiceId) {
            return toast.warning('Selecione o Serviço de Operação de Recebimento.');
        }
        if (!volumeConfig.packagingTypeId) {
            return toast.warning('Selecione a Embalagem do Volume.');
        }
        if (!volumeConfig.qualityStatus) {
            return toast.warning('Selecione o Status de Qualidade do Lote.');
        }
        if (!volumeConfig.targetLocationId) {
            return toast.warning('Selecione a Posição / Doca de Destino.');
        }
        if (volumeConfig.volumeCount <= 0 || volumeConfig.quantityPerVolume <= 0) {
            return toast.warning('Informe quantidades válidas.');
        }

        const selectedPack = availablePackagings.find(p => p.packagingTypeId === volumeConfig.packagingTypeId);
        const selectedLoc = targetLocations.find(l => l.id === volumeConfig.targetLocationId);

        const newStagedItem = {
            ...volumeConfig,
            batch: tracksBatch ? volumeConfig.batch : '',
            expirationDate: tracksExpiration ? volumeConfig.expirationDate : '',
            manufactureDate: tracksManufacture ? volumeConfig.manufactureDate : '',
            serialNumber: tracksSerial ? volumeConfig.serialNumber : '',
            billingServiceId: selectedBillingServiceId,
            tempId: Date.now() + Math.random(),
            packagingCode: selectedPack?.code || 'EMB',
            locationPath: selectedLoc?.fullPath || 'DOCA',
            totalQuantity: volumeConfig.volumeCount * volumeConfig.quantityPerVolume
        };

        setStagedVolumes(prev => [...prev, newStagedItem]);
        toast.info('Lote adicionado ao carrinho de conferência.');

        setSelectedBillingServiceId('');
        setVolumeConfig(prev => ({
            ...prev,
            packagingTypeId: '',
            volumeCount: 1,
            quantityPerVolume: 0,
            qualityStatus: '',
            targetLocationId: '',
            batch: tracksBatch ? (item?.expectedBatch || '') : '',
            expirationDate: (tracksExpiration && item?.expectedExpirationDate) ? item.expectedExpirationDate.split('T')[0] : '',
            manufactureDate: (tracksManufacture && item?.expectedManufactureDate) ? item.expectedManufactureDate.split('T')[0] : '',
            notes: '',
            images: []
        }));
    };

    const removeStagedItem = (tempId) => {
        setStagedVolumes(prev => prev.filter(i => i.tempId !== tempId));
    };

    const handleFinalCheckout = () => {
        if (stagedVolumes.length === 0) {
            return toast.warning('Adicione pelo menos um lote ao carrinho antes de finalizar.');
        }

        const serviceId = stagedVolumes[0]?.billingServiceId !== 'none' ? stagedVolumes[0]?.billingServiceId : null;

        checkoutLotes({
            data: {
                orderItemId: item.id,
                billingServiceId: serviceId,
                volumes: stagedVolumes.map(v => ({
                    packagingTypeId: v.packagingTypeId,
                    volumeCount: v.volumeCount,
                    quantityPerVolume: v.quantityPerVolume,
                    batch: tracksBatch && v.batch ? v.batch : null,
                    manufactureDate: tracksManufacture && v.manufactureDate ? new Date(v.manufactureDate).toISOString() : null,
                    expirationDate: tracksExpiration && v.expirationDate ? new Date(v.expirationDate).toISOString() : null,
                    serialNumber: tracksSerial && v.serialNumber ? v.serialNumber : null,
                    targetLocationId: v.targetLocationId,
                    qualityStatus: Number(v.qualityStatus)
                }))
            }
        });
    };

    const getQualityBadgeInfo = (status) => {
        switch (String(status)) {
            case '1': return { label: 'Liberado (Sem Avarias)', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
            case '2': return { label: 'Quarentena / Retido', style: 'bg-amber-50 text-amber-800 border-amber-200' };
            case '3': return { label: 'Avariado / Danificado', style: 'bg-rose-50 text-rose-800 border-rose-200' };
            case '4': return { label: 'Falta Virtual / Divergência', style: 'bg-purple-50 text-purple-800 border-purple-200' };
            default: return { label: 'Status N/D', style: 'bg-slate-50 text-slate-700 border-slate-200' };
        }
    };

    if (isLoadingOrder) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!item) {
        return (
            <div className="p-8 text-center space-y-4">
                <p className="text-slate-500">Item da ordem não encontrado.</p>
                <Button onClick={() => navigate(`/inbound/operacao/${orderId}`)}>Voltar à Ordem</Button>
            </div>
        );
    }

    const totalCartUnits = stagedVolumes.reduce((acc, curr) => acc + curr.totalQuantity, 0);

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* CABEÇALHO COM BOTÃO PAUSAR & LIBERAR */}
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/inbound/operacao/${orderId}`)} className="shrink-0 text-slate-500 hover:text-slate-900">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Linha #{item.lineNumber}</span>
                            <h1 className="text-xl font-bold text-slate-900 font-mono">{item.sku || item.rawSkuCode}</h1>
                            <Badge variant="outline" className="bg-slate-50">{item.status}</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xl">{item.description || item.rawDescription}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        onClick={() => releaseItem({ orderItemId: item.id })}
                        disabled={isReleasing}
                        className="border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 h-10 text-xs font-semibold"
                    >
                        {isReleasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><PauseCircle className="h-4 w-4 mr-1.5 text-amber-600" /> Pausar e Liberar Item</>}
                    </Button>

                    <div className="flex items-center gap-6 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl">
                        <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Esperado NF-e</span>
                            <span className="text-sm font-bold font-mono text-slate-800">{item.expectedQuantity} UN</span>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Já Recebido</span>
                            <span className="text-sm font-bold font-mono text-emerald-600">{item.receivedQuantity || 0} UN</span>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">No Carrinho</span>
                            <span className="text-sm font-bold font-mono text-blue-600">{totalCartUnits} UN</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* SUCESSO DE ETIQUETAS */}
            {generatedHusResult ? (
                <div className="bg-white border border-emerald-200 rounded-2xl p-8 text-center space-y-6 max-w-2xl mx-auto my-auto shadow-lg animate-in zoom-in-95">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                        <CheckCircle2 size={36} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Recebimento Concluído!</h2>
                        <p className="text-sm text-slate-500 mt-1">HUs geradas e salvas no banco de dados.</p>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left max-h-48 overflow-y-auto font-mono text-xs space-y-1">
                        {generatedHusResult.map((hu, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-none">
                                <span className="font-bold text-slate-800">{typeof hu === 'string' ? hu : hu.lpn}</span>
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700">LPN Registrado</Badge>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3 justify-center pt-2">
                        <Button variant="outline" onClick={() => navigate(`/inbound/operacao/${orderId}`)}>
                            Voltar à Operação
                        </Button>
                        <Button onClick={() => setIsPrintModalOpen(true)} className="bg-slate-900 text-white">
                            <Printer className="w-4 h-4 mr-2" /> Imprimir Etiquetas HUs
                        </Button>
                    </div>
                </div>
            ) : (
                /* CONTEÚDO PRINCIPAL DEDICADO */
                <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">

                    {/* COLUNA ESQUERDA (7 COLS) */}
                    <div className="col-span-7 bg-white border border-slate-200/80 rounded-xl shadow-xs p-6 overflow-y-auto flex flex-col space-y-6">

                        {/* 1. SERVIÇO DE FATURAMENTO */}
                        <div className="space-y-2 border-b border-slate-100 pb-4">
                            <Label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                <Receipt className="text-blue-600" size={16} /> 1. Serviço de Operação de Recebimento *
                            </Label>
                            <Select value={selectedBillingServiceId} onValueChange={setSelectedBillingServiceId}>
                                <SelectTrigger className="bg-slate-50 border-slate-200 h-10">
                                    <SelectValue placeholder="Selecione obrigatoriamente a tarifa/serviço..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {billingServices.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                    <SelectItem value="none">Isento de Tarifa Adicional</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 2. DADOS DO VOLUME / LOTE */}
                        <div className="space-y-4">
                            <Label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                <Box className="text-blue-600" size={16} /> 2. Dados do Volume / Lote Descarregado *
                            </Label>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1.5 col-span-2">
                                    <Label className="text-xs">Embalagem do Volume *</Label>
                                    <Select value={volumeConfig.packagingTypeId} onValueChange={handlePackagingChange}>
                                        <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Escolha a embalagem..." /></SelectTrigger>
                                        <SelectContent>
                                            {availablePackagings.map(pt => (
                                                <SelectItem key={pt.packagingTypeId} value={pt.packagingTypeId}>
                                                    {pt.code} - {pt.description} (Fator: {pt.conversionFactor})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Qtd Volumes (HUs) *</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={volumeConfig.volumeCount}
                                        onChange={(e) => setVolumeConfig(p => ({ ...p, volumeCount: Number(e.target.value) }))}
                                        className="bg-slate-50 font-mono font-bold"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Qtd de Peças por Volume *</Label>
                                    <Input
                                        type="number"
                                        step="0.0001"
                                        value={volumeConfig.quantityPerVolume}
                                        onChange={(e) => setVolumeConfig(p => ({ ...p, quantityPerVolume: Number(e.target.value) }))}
                                        className="bg-slate-50 font-mono font-bold text-blue-700"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Posição / Doca Destino *</Label>
                                    <SearchableLocationSelect
                                        value={volumeConfig.targetLocationId}
                                        onChange={(locId) => setVolumeConfig(p => ({ ...p, targetLocationId: locId }))}
                                        locations={targetLocations}
                                    />
                                </div>
                            </div>

                            {/* RASTREABILIDADE EXIBIDA APENAS SE HABILITADA NO CADASTRO DO PRODUTO */}
                            {(tracksBatch || tracksExpiration || tracksManufacture || tracksSerial) && (
                                <div className="grid grid-cols-2 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                                    {tracksBatch && (
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-slate-600 font-semibold">Lote Físico</Label>
                                            <Input
                                                value={volumeConfig.batch}
                                                onChange={(e) => setVolumeConfig(p => ({ ...p, batch: e.target.value }))}
                                                placeholder="Lote do XML/Físico"
                                                className="h-8 text-xs font-mono bg-white"
                                            />
                                        </div>
                                    )}

                                    {tracksExpiration && (
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-slate-600 font-semibold">Data Validade</Label>
                                            <Input
                                                type="date"
                                                value={volumeConfig.expirationDate}
                                                onChange={(e) => setVolumeConfig(p => ({ ...p, expirationDate: e.target.value }))}
                                                className="h-8 text-xs bg-white font-mono"
                                            />
                                        </div>
                                    )}

                                    {tracksManufacture && (
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-slate-600 font-semibold">Data Fabricação</Label>
                                            <Input
                                                type="date"
                                                value={volumeConfig.manufactureDate}
                                                onChange={(e) => setVolumeConfig(p => ({ ...p, manufactureDate: e.target.value }))}
                                                className="h-8 text-xs bg-white font-mono"
                                            />
                                        </div>
                                    )}

                                    {tracksSerial && (
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-slate-600 font-semibold">Número de Série</Label>
                                            <Input
                                                value={volumeConfig.serialNumber}
                                                onChange={(e) => setVolumeConfig(p => ({ ...p, serialNumber: e.target.value }))}
                                                placeholder="Serial Unitário"
                                                className="h-8 text-xs font-mono bg-white"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 3. QUALIDADE E CONDICIONAIS */}
                            <div className="space-y-3 pt-2">
                                <Label className="text-xs font-bold text-slate-800">3. Qualidade do Lote Recebido *</Label>
                                <Select value={String(volumeConfig.qualityStatus)} onValueChange={(v) => setVolumeConfig(p => ({ ...p, qualityStatus: v }))}>
                                    <SelectTrigger className="bg-slate-50">
                                        <SelectValue placeholder="Selecione a Qualidade..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">Liberado (Sem Avarias)</SelectItem>
                                        <SelectItem value="2">Quarentena / Controle Qualidade</SelectItem>
                                        <SelectItem value="3">Avariado / Danificado</SelectItem>
                                        <SelectItem value="4">Falta Virtual / Divergência Fiscal</SelectItem>
                                    </SelectContent>
                                </Select>

                                {(volumeConfig.qualityStatus === '2' || volumeConfig.qualityStatus === '3' || volumeConfig.qualityStatus === '4') && (
                                    <div className="p-4 rounded-xl border bg-amber-50/50 border-amber-200 space-y-3 animate-in fade-in duration-300">
                                        <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                                            {volumeConfig.qualityStatus === '2' && <ShieldAlert size={16} />}
                                            {volumeConfig.qualityStatus === '3' && <AlertTriangle size={16} />}
                                            {volumeConfig.qualityStatus === '4' && <FileWarning size={16} />}
                                            {volumeConfig.qualityStatus === '2' ? 'Registro de Retenção em Quarentena' : volumeConfig.qualityStatus === '3' ? 'Registro de Avaria Físico' : 'Registro de Divergência / Falta'}
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs">Descrição / Motivo do Bloqueio ou Ocorrência *</Label>
                                            <Input
                                                value={volumeConfig.notes}
                                                onChange={(e) => setVolumeConfig(p => ({ ...p, notes: e.target.value }))}
                                                placeholder="Descreva observações, inspecções ou motivos..."
                                                className="bg-white text-xs h-9"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Anexar Imagens / Comprovantes</Label>
                                            <div className="flex items-center gap-3">
                                                <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-amber-300 bg-white text-xs text-amber-800 cursor-pointer hover:bg-amber-100/50">
                                                    <Upload size={14} /> Selecionar Fotos
                                                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                                                </label>
                                                <span className="text-[10px] text-slate-500">{volumeConfig.images.length} imagem(ns) anexada(s)</span>
                                            </div>

                                            {volumeConfig.images.length > 0 && (
                                                <div className="flex gap-2 flex-wrap pt-2">
                                                    {volumeConfig.images.map((img, idx) => (
                                                        <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-amber-300">
                                                            <img src={img.base64Data} alt="Evidência" className="w-full h-full object-cover" />
                                                            <button
                                                                onClick={() => removeImage(idx)}
                                                                className="absolute inset-0 bg-rose-900/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <Button
                                type="button"
                                onClick={handleAddVolumeToCart}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-11"
                            >
                                <Plus className="w-4 h-4 mr-2" /> Adicionar Lote ao Carrinho de Conferência
                            </Button>
                        </div>
                    </div>

                    {/* CARRINHO DE CONFERÊNCIA COM RASTREABILIDADE E QUALIDADE */}
                    <div className="col-span-5 bg-slate-50/50 border border-slate-200/80 rounded-xl p-6 flex flex-col min-h-0">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
                            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                <ShoppingCart className="text-emerald-600" size={18} /> Carrinho de Conferência
                            </h3>
                            <Badge variant="outline" className="bg-white font-mono text-xs">{stagedVolumes.length} lote(s)</Badge>
                        </div>

                        <div className="flex-1 overflow-y-auto py-4 space-y-3 my-2 pr-1">
                            {stagedVolumes.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center space-y-2 py-12">
                                    <ShoppingCart className="w-12 h-12 text-slate-300 stroke-1" />
                                    <p className="text-xs">Nenhum volume no carrinho.</p>
                                    <p className="text-[10px] text-slate-400 max-w-[200px]">Configure o lote ao lado e clique em "Adicionar Lote".</p>
                                </div>
                            ) : (
                                stagedVolumes.map((cartItem) => {
                                    const qualityInfo = getQualityBadgeInfo(cartItem.qualityStatus);

                                    return (
                                        <div key={cartItem.tempId} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2 relative">
                                            <button
                                                onClick={() => removeStagedItem(cartItem.tempId)}
                                                className="absolute top-3 right-3 text-slate-400 hover:text-rose-600 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>

                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-[10px]">{cartItem.packagingCode}</Badge>
                                                <span className="font-bold text-slate-900 text-xs font-mono">{cartItem.volumeCount} Vol x {cartItem.quantityPerVolume} UN</span>
                                            </div>

                                            <div className="text-[10px] text-slate-500 space-y-1 font-mono pt-1 border-t border-slate-100">
                                                <p>Destino: <strong className="text-slate-800">{cartItem.locationPath}</strong></p>
                                                {cartItem.batch && <p>Lote: <strong className="text-slate-800">{cartItem.batch}</strong></p>}
                                                {cartItem.expirationDate && <p>Validade: <strong className="text-slate-800">{cartItem.expirationDate}</strong></p>}
                                                {cartItem.manufactureDate && <p>Fabricação: <strong className="text-slate-800">{cartItem.manufactureDate}</strong></p>}
                                                {cartItem.serialNumber && <p>Série: <strong className="text-slate-800">{cartItem.serialNumber}</strong></p>}

                                                <div className="pt-1">
                                                    <Badge variant="outline" className={`text-[9px] font-sans font-semibold ${qualityInfo.style}`}>
                                                        {qualityInfo.label}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="border-t border-slate-200 pt-4 space-y-3 shrink-0 bg-white p-4 rounded-xl border">
                            <div className="flex justify-between text-xs font-semibold text-slate-700">
                                <span>Total a Gravar nesta Conferência:</span>
                                <span className="font-mono text-emerald-700 font-bold text-sm">{totalCartUnits} UN</span>
                            </div>

                            <Button
                                onClick={handleFinalCheckout}
                                disabled={stagedVolumes.length === 0 || isSubmitting}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 shadow-sm"
                            >
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><PackageCheck className="w-4 h-4 mr-2" /> Registrar Checkout & Gerar HUs</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {isPrintModalOpen && generatedHusResult && (
                <PrintHuModal
                    open={isPrintModalOpen}
                    onOpenChange={setIsPrintModalOpen}
                    husToPrint={generatedHusResult.map(hu => ({
                        id: typeof hu === 'object' ? hu.id : hu,
                        lpn: typeof hu === 'object' ? hu.lpn : hu,
                        sku: item.sku || item.rawSkuCode,
                        productDescription: item.description || item.rawDescription,
                        batch: item.expectedBatch,
                        expirationDate: item.expectedExpirationDate,
                        unit: item.rawUnit || 'UN'
                    }))}
                    orderData={order}
                />
            )}
        </div>
    );
}