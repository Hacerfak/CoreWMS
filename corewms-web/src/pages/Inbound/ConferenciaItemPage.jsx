import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    useGetApiInboundId,
    usePostApiInboundReceiveCheckout
} from '@/api/generated/inbound/inbound';
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
    Receipt, AlertTriangle, FileWarning, Upload, ShoppingCart, Box, Printer, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

export default function ConferenciaItemPage() {
    const { orderId, itemId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // 1. Dados Principais
    const { data: order, isLoading: isLoadingOrder } = useGetApiInboundId(orderId);
    const item = order?.items?.find(i => i.id === itemId);

    // 2. Apis de Apoio (Serviços, Embalagens e Topologia)
    const { data: billingServicesResponse } = useGetApiBillingServices();
    const billingServices = Array.isArray(billingServicesResponse) ? billingServicesResponse : (billingServicesResponse?.items || []);

    const { data: packTypesResponse } = useGetApiPackagingTypes();
    const packagingTypes = Array.isArray(packTypesResponse) ? packTypesResponse : (packTypesResponse?.items || []);

    const { data: docks = [] } = useGetApiTopologyLocationsDocks();
    const { data: storageLocations = [] } = useGetApiTopologyLocationsStorage();
    const targetLocations = [...docks, ...storageLocations];

    // 3. Estados Locais do Fluxo de Conferência
    const [selectedBillingServiceId, setSelectedBillingServiceId] = useState('');

    // Formulário do Volume Atual (Configurador)
    const [volumeConfig, setVolumeConfig] = useState({
        packagingTypeId: '',
        volumeCount: 1,
        quantityPerVolume: 0,
        batch: '',
        manufactureDate: '',
        expirationDate: '',
        serialNumber: '',
        targetLocationId: '',
        qualityStatus: 1, // 1 = Available, 2 = Quarantine, 3 = Damaged, 4 = Virtual_Shortage
        notes: '',
        images: []
    });

    // O PULO DO GATO: Carrinho de Lotes/Volumes Acumulados
    const [stagedVolumes, setStagedVolumes] = useState([]);
    const [generatedHusResult, setGeneratedHusResult] = useState(null);

    // Pré-preenchimento Automático vindo da NF-e
    useEffect(() => {
        if (item) {
            setVolumeConfig(prev => ({
                ...prev,
                quantityPerVolume: item.expectedQuantity - (item.receivedQuantity || 0),
                batch: item.expectedBatch || '',
                expirationDate: item.expectedExpirationDate ? item.expectedExpirationDate.split('T')[0] : '',
                manufactureDate: item.expectedManufactureDate ? item.expectedManufactureDate.split('T')[0] : '',
                targetLocationId: item.dockLocationId || (docks[0]?.id || '')
            }));
        }
    }, [item, docks]);

    // Mutação do Checkout Final
    const { mutate: checkoutLotes, isPending: isSubmitting } = usePostApiInboundReceiveCheckout({
        mutation: {
            onSuccess: (res) => {
                toast.success('Checkout realizado e HUs geradas com sucesso!');
                queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });

                // Se a API retornar os LPNs gerados
                if (res?.husGenerated) {
                    setGeneratedHusResult(res.husGenerated);
                } else {
                    navigate(`/inbound/operacao/${orderId}`);
                }
            },
            onError: (err) => {
                toast.error(err.response?.data?.message || err.response?.data?.detail || 'Erro ao registrar conferência.');
            }
        }
    });

    // Manipulação de Imagens de Avaria/Falta
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

    // Adiciona o Volume Configurado ao Carrinho Staged
    const handleAddVolumeToCart = () => {
        if (!volumeConfig.packagingTypeId) {
            return toast.warning('Selecione o tipo de embalagem.');
        }
        if (!volumeConfig.targetLocationId) {
            return toast.warning('Selecione a posição ou doca de destino.');
        }
        if (volumeConfig.volumeCount <= 0 || volumeConfig.quantityPerVolume <= 0) {
            return toast.warning('Informe quantidades válidas.');
        }

        const selectedPack = packagingTypes.find(p => p.id === volumeConfig.packagingTypeId);
        const selectedLoc = targetLocations.find(l => l.id === volumeConfig.targetLocationId);

        const newStagedItem = {
            ...volumeConfig,
            tempId: Date.now() + Math.random(),
            packagingCode: selectedPack?.code || 'EMB',
            locationPath: selectedLoc?.fullPath || 'DOCA',
            totalQuantity: volumeConfig.volumeCount * volumeConfig.quantityPerVolume
        };

        setStagedVolumes(prev => [...prev, newStagedItem]);
        toast.info('Lote adicionado ao carrinho de conferência.');

        // Reseta parte do form para o próximo lote mantendo dados do XML
        setVolumeConfig(prev => ({
            ...prev,
            volumeCount: 1,
            qualityStatus: 1,
            notes: '',
            images: []
        }));
    };

    const removeStagedItem = (tempId) => {
        setStagedVolumes(prev => prev.filter(i => i.tempId !== tempId));
    };

    // Submissão do Checkout Final no Banco
    const handleFinalCheckout = () => {
        if (stagedVolumes.length === 0) {
            return toast.warning('Adicione pelo menos um lote ao carrinho antes de finalizar.');
        }

        checkoutLotes({
            data: {
                orderItemId: item.id,
                billingServiceId: selectedBillingServiceId || null,
                volumes: stagedVolumes.map(v => ({
                    packagingTypeId: v.packagingTypeId,
                    volumeCount: v.volumeCount,
                    quantityPerVolume: v.quantityPerVolume,
                    batch: v.batch || null,
                    manufactureDate: v.manufactureDate ? new Date(v.manufactureDate).toISOString() : null,
                    expirationDate: v.expirationDate ? new Date(v.expirationDate).toISOString() : null,
                    serialNumber: v.serialNumber || null,
                    targetLocationId: v.targetLocationId,
                    qualityStatus: v.qualityStatus
                }))
            }
        });
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

    // Cálculos de Totais e Progresso
    const totalCartUnits = stagedVolumes.reduce((acc, curr) => acc + curr.totalQuantity, 0);
    const pendingQuantity = item.expectedQuantity - (item.receivedQuantity || 0);

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* BARRA SUPERIOR */}
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

                {/* CARD DE PROGRESSO */}
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

            {/* SE MODAL/MODO DE SUCESSO DE HU MOSTRA ETIQUETAS */}
            {generatedHusResult ? (
                <div className="bg-white border border-emerald-200 rounded-2xl p-8 text-center space-y-6 max-w-2xl mx-auto my-auto shadow-lg animate-in zoom-in-95">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                        <CheckCircle2 size={36} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Recebimento Concluído!</h2>
                        <p className="text-sm text-slate-500 mt-1">HUs geradas e prontas para movimentação no estoque.</p>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left max-h-48 overflow-y-auto font-mono text-xs space-y-1">
                        {generatedHusResult.map((lpn, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-100 last:border-none">
                                <span className="font-bold text-slate-800">{lpn}</span>
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700">Etiqueta ZPL Gerada</Badge>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3 justify-center pt-2">
                        <Button variant="outline" onClick={() => navigate(`/inbound/operacao/${orderId}`)}>
                            Voltar à Operação
                        </Button>
                        <Button className="bg-slate-900 text-white">
                            <Printer className="w-4 h-4 mr-2" /> Imprimir Etiquetas HUs
                        </Button>
                    </div>
                </div>
            ) : (
                /* CONTEÚDO PRINCIPAL (DEDICADO) */
                <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">

                    {/* COLUNA ESQUERDA: CONFIGURADOR DO LOTE / VOLUME (7 COLS) */}
                    <div className="col-span-7 bg-white border border-slate-200/80 rounded-xl shadow-xs p-6 overflow-y-auto flex flex-col space-y-6">

                        {/* ETAPA 1: SERVIÇO DE FATURAMENTO */}
                        <div className="space-y-2 border-b border-slate-100 pb-4">
                            <Label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                <Receipt className="text-blue-600" size={16} /> 1. Serviço de Operação de Recebimento
                            </Label>
                            <Select value={selectedBillingServiceId} onValueChange={setSelectedBillingServiceId}>
                                <SelectTrigger className="bg-slate-50 border-slate-200 h-10">
                                    <SelectValue placeholder="Selecione a tarifa/serviço aplicado a este recebimento..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {billingServices.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                    <SelectItem value="none">Isento de Tarifa Adicional</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* ETAPA 2: CONFIGURAÇÃO DO VOLUME / LOTE */}
                        <div className="space-y-4">
                            <Label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                <Box className="text-blue-600" size={16} /> 2. Dados do Volume / Lote Descarregado
                            </Label>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1.5 col-span-2">
                                    <Label className="text-xs">Embalagem do Volume *</Label>
                                    <Select value={volumeConfig.packagingTypeId} onValueChange={(v) => setVolumeConfig(p => ({ ...p, packagingTypeId: v }))}>
                                        <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Escolha..." /></SelectTrigger>
                                        <SelectContent>
                                            {packagingTypes.map(pt => (
                                                <SelectItem key={pt.id} value={pt.id}>{pt.code} - {pt.description}</SelectItem>
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
                                    <Select value={volumeConfig.targetLocationId} onValueChange={(v) => setVolumeConfig(p => ({ ...p, targetLocationId: v }))}>
                                        <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Selecione Doca..." /></SelectTrigger>
                                        <SelectContent>
                                            {targetLocations.map(loc => (
                                                <SelectItem key={loc.id} value={loc.id}>{loc.fullPath}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* RASTREABILIDADE (PRÉ-PREENCHIDA DO XML) */}
                            <div className="grid grid-cols-3 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                                <div className="space-y-1">
                                    <Label className="text-[11px] text-slate-600">Lote Físico</Label>
                                    <Input
                                        value={volumeConfig.batch}
                                        onChange={(e) => setVolumeConfig(p => ({ ...p, batch: e.target.value }))}
                                        placeholder="Obtido do XML"
                                        className="h-8 text-xs font-mono bg-white"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[11px] text-slate-600">Data Validade</Label>
                                    <Input
                                        type="date"
                                        value={volumeConfig.expirationDate}
                                        onChange={(e) => setVolumeConfig(p => ({ ...p, expirationDate: e.target.value }))}
                                        className="h-8 text-xs bg-white"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[11px] text-slate-600">Data Fabricação</Label>
                                    <Input
                                        type="date"
                                        value={volumeConfig.manufactureDate}
                                        onChange={(e) => setVolumeConfig(p => ({ ...p, manufactureDate: e.target.value }))}
                                        className="h-8 text-xs bg-white"
                                    />
                                </div>
                            </div>

                            {/* ETAPA 3: QUALIDADE / CONDICIONAIS DE AVARIA OU FALTA */}
                            <div className="space-y-3 pt-2">
                                <Label className="text-xs font-bold text-slate-800">3. Qualidade do Lote Recebido</Label>
                                <Select value={String(volumeConfig.qualityStatus)} onValueChange={(v) => setVolumeConfig(p => ({ ...p, qualityStatus: Number(v) }))}>
                                    <SelectTrigger className="bg-slate-50">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">Liberado (Sem Avarias)</SelectItem>
                                        <SelectItem value="2">Quarentena / Controle Qualidade</SelectItem>
                                        <SelectItem value="3">Avariado / Danificado</SelectItem>
                                        <SelectItem value="4">Falta Virtual / Divergência Fiscal</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* CONDICIONAL DE AVARIA OU FALTA */}
                                {(volumeConfig.qualityStatus === 3 || volumeConfig.qualityStatus === 4) && (
                                    <div className="p-4 rounded-xl border bg-amber-50/50 border-amber-200 space-y-3 animate-in fade-in duration-300">
                                        <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                                            {volumeConfig.qualityStatus === 3 ? <AlertTriangle size={16} /> : <FileWarning size={16} />}
                                            {volumeConfig.qualityStatus === 3 ? 'Registro de Avaria Físico' : 'Registro de Divergência / Falta'}
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs">Descrição / Motivo da Ocorrência</Label>
                                            <Input
                                                value={volumeConfig.notes}
                                                onChange={(e) => setVolumeConfig(p => ({ ...p, notes: e.target.value }))}
                                                placeholder="Descreva detalhes do dano ou divergência..."
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
                                                            <img src={img.base64Data} alt="Avaria" className="w-full h-full object-cover" />
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

                        {/* BOTÃO ADICIONAR AO CARRINHO */}
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

                    {/* COLUNA DIREITA: O CARRINHO DE STAGING E CHECKOUT (5 COLS) */}
                    <div className="col-span-5 bg-slate-50/50 border border-slate-200/80 rounded-xl p-6 flex flex-col min-h-0">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
                            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                <ShoppingCart className="text-emerald-600" size={18} /> Carrinho de Conferência
                            </h3>
                            <Badge variant="outline" className="bg-white font-mono text-xs">{stagedVolumes.length} lote(s)</Badge>
                        </div>

                        {/* LISTA DE ITENS STAGED */}
                        <div className="flex-1 overflow-y-auto py-4 space-y-3 my-2 pr-1">
                            {stagedVolumes.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center space-y-2 py-12">
                                    <ShoppingCart className="w-12 h-12 text-slate-300 stroke-1" />
                                    <p className="text-xs">Nenhum volume no carrinho.</p>
                                    <p className="text-[10px] text-slate-400 max-w-[200px]">Configure os lotes ao lado e clique em "Adicionar ao Carrinho".</p>
                                </div>
                            ) : (
                                stagedVolumes.map((item) => (
                                    <div key={item.tempId} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2 relative">
                                        <button
                                            onClick={() => removeStagedItem(item.tempId)}
                                            className="absolute top-3 right-3 text-slate-400 hover:text-rose-600 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>

                                        <div className="flex items-center gap-2">
                                            <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-[10px]">{item.packagingCode}</Badge>
                                            <span className="font-bold text-slate-900 text-xs font-mono">{item.volumeCount} Vol x {item.quantityPerVolume} UN</span>
                                        </div>

                                        <div className="text-[10px] text-slate-500 space-y-0.5 font-mono">
                                            <p>Destino: <strong className="text-slate-700">{item.locationPath}</strong></p>
                                            {item.batch && <p>Lote: <strong className="text-slate-700">{item.batch}</strong></p>}
                                            {item.qualityStatus !== 1 && (
                                                <span className="text-amber-700 font-bold uppercase block mt-1">
                                                    Status: {item.qualityStatus === 3 ? 'Avariado' : 'Falta/Divergência'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* RESUMO DO CHECKOUT E SUBMISSÃO */}
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
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="w-4 h-4 mr-2" /> Registrar Checkout & Gerar HUs</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}