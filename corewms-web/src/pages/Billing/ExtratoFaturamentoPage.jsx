import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import {
    ArrowLeft, Receipt, Calendar, Lock, RefreshCw,
    Plus, Loader2, CheckCircle2, ChevronDown, ChevronUp, FileText,
    TrendingUp, Trash2, AlertTriangle, Layers, FileSpreadsheet, Search
} from 'lucide-react';
import { toast } from 'sonner';

import {
    formatDatePtBr,
    formatCurrency,
    extractNfeNumber,
    classifyService,
    aggregatePackagingRows
} from './Extrato/billingUtils';

import VisaoPorServicosTab from './Extrato/VisaoPorServicosTab';
import VisaoPorNfeTab from './Extrato/VisaoPorNfeTab';

export default function ExtratoFaturamentoPage() {
    const { id: cycleId } = useParams();
    const navigate = useNavigate();

    const [cycle, setCycle] = useState(null);
    const [services, setServices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [viewMode, setViewMode] = useState('services');
    const [filterTerm, setFilterTerm] = useState('');

    const [expandedServiceIds, setExpandedServiceIds] = useState([]);
    const [expandedNfeKeys, setExpandedNfeKeys] = useState([]);
    const [expandedItemDetailId, setExpandedItemDetailId] = useState(null);

    // Modal de Lançamento Manual Extra
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [description, setDescription] = useState('');
    const [documentNumber, setDocumentNumber] = useState('');
    const [chargeDate, setChargeDate] = useState(() => new Date());
    const [quantity, setQuantity] = useState(1);
    const [totalValue, setTotalValue] = useState(0);
    const [manualNotes, setManualNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Modal de Exclusão de Cobrança
    const [itemToDelete, setItemToDelete] = useState(null);
    const [isDeletingItem, setIsDeletingItem] = useState(false);

    const loadCycleDetails = async () => {
        try {
            setIsLoading(true);
            const [cycleRes, servicesRes] = await Promise.all([
                customInstance({ url: `/api/billing/cycles/${cycleId}`, method: 'GET' }),
                customInstance({ url: '/api/billing/services', method: 'GET' })
            ]);
            setCycle(cycleRes);
            setServices(Array.isArray(servicesRes) ? servicesRes : []);
        } catch {
            toast.error('Erro ao carregar detalhes do ciclo de faturamento.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (cycleId) loadCycleDetails();
    }, [cycleId]);

    const handlePrintStatement = async () => {
        if (!cycleId) return;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                    <head><title>Carregando Extrato...</title></head>
                    <body style="font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #ffffff;">
                        <div style="text-align: center;">
                            <h2 style="font-size: 16px; margin-bottom: 6px;">Carregando extrato de faturamento...</h2>
                            <p style="color: #94a3b8; font-size: 12px; margin: 0;">Por favor, aguarde.</p>
                        </div>
                    </body>
                </html>
            `);
        }

        try {
            const html = await customInstance({
                url: `/api/billing/cycles/${cycleId}/statement-html`,
                method: 'GET',
                responseType: 'text'
            });

            if (printWindow) {
                printWindow.document.open();
                printWindow.document.write(html);
                printWindow.document.close();
            }
        } catch (error) {
            if (printWindow) printWindow.close();
            toast.error(error.response?.data?.message || 'Erro ao carregar extrato para impressão.');
        }
    };

    const handleDownloadCsv = async () => {
        if (!cycleId) return;
        try {
            toast.info('Gerando planilha CSV do extrato...');
            const response = await customInstance({
                url: `/api/billing/cycles/${cycleId}/export-csv`,
                method: 'GET',
                responseType: 'blob'
            });

            const blob = response instanceof Blob
                ? response
                : new Blob([response.data || response], { type: 'text/csv; charset=utf-8;' });

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const refMonth = (cycle?.referenceMonth || 'extrato').replace('/', '_');
            link.setAttribute('download', `extrato_faturamento_${refMonth}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Planilha CSV baixada com sucesso!');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao exportar arquivo CSV.');
        }
    };

    const handleRecalculateCycle = async () => {
        if (!cycle) return;
        try {
            setIsLoading(true);
            await customInstance({
                url: '/api/billing/cycles/generate',
                method: 'POST',
                data: {
                    customerId: cycle.customerId,
                    referenceMonth: cycle.referenceMonth,
                    startDate: cycle.startDate,
                    endDate: cycle.endDate
                }
            });
            toast.success('Motor executado! Diárias e saldos recalculados com sucesso.');
            loadCycleDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao recalcular ciclo.');
            setIsLoading(false);
        }
    };

    const handleCloseCycle = async () => {
        if (!confirm('Deseja realmente encerrar este ciclo de faturamento? O extrato ficará congelado para faturamento.')) return;
        try {
            await customInstance({ url: `/api/billing/cycles/${cycleId}/close`, method: 'POST' });
            toast.success('Ciclo de faturamento encerrado com sucesso!');
            loadCycleDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao fechar ciclo.');
        }
    };

    const handleSaveManualItem = async (e) => {
        e.preventDefault();
        if (!selectedServiceId || !description) return;

        try {
            setIsSubmitting(true);
            let formattedChargeDate = undefined;
            if (chargeDate) {
                const year = chargeDate.getFullYear();
                const month = String(chargeDate.getMonth() + 1).padStart(2, '0');
                const day = String(chargeDate.getDate()).padStart(2, '0');
                formattedChargeDate = `${year}-${month}-${day}T00:00:00.000Z`;
            }

            await customInstance({
                url: `/api/billing/cycles/${cycleId}/items/manual`,
                method: 'POST',
                data: {
                    billingServiceId: selectedServiceId,
                    description: description.trim(),
                    quantityTotal: Number(quantity),
                    serviceTotal: Number(totalValue),
                    manualNotes: manualNotes.trim() || null,
                    chargeDate: formattedChargeDate,
                    documentNumber: documentNumber.trim() || 'Avulso'
                }
            });

            toast.success('Lançamento avulso registrado com sucesso!');
            setIsManualModalOpen(false);
            setSelectedServiceId('');
            setDescription('');
            setDocumentNumber('');
            setChargeDate(new Date());
            setQuantity(1);
            setTotalValue(0);
            setManualNotes('');
            loadCycleDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao gravar lançamento manual.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmDeleteItem = async () => {
        if (!itemToDelete) return;
        try {
            setIsDeletingItem(true);
            await customInstance({
                url: `/api/billing/cycles/${cycleId}/items/${itemToDelete.id}`,
                method: 'DELETE'
            });
            toast.success('Lançamento removido do extrato!');
            setItemToDelete(null);
            loadCycleDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao remover lançamento.');
        } finally {
            setIsDeletingItem(false);
        }
    };

    const checkIsManualItem = (item) => {
        if (!item) return false;
        if (item.documentType?.toLowerCase() === 'manual') return true;
        if (!item.statementDataJson && item.documentType !== 'Diária de Estoque' && !item.documentId) return true;
        return false;
    };

    const metrics = useMemo(() => {
        if (!cycle?.items) return { dailyTotal: 0, eventsTotal: 0, manualTotal: 0 };
        let dailyTotal = 0;
        let eventsTotal = 0;
        let manualTotal = 0;

        cycle.items.forEach(i => {
            const val = Number(i.serviceTotal) || 0;
            const isManual = checkIsManualItem(i);
            const cat = classifyService(i);

            if (isManual) manualTotal += val;
            else if (cat === 'storage' || cat === 'ad_valorem') dailyTotal += val;
            else eventsTotal += val;
        });

        return { dailyTotal, eventsTotal, manualTotal };
    }, [cycle]);

    // Visão 1: Agrupada por Serviço
    const groupedByService = useMemo(() => {
        if (!cycle?.items) return [];

        const map = {};

        cycle.items.forEach(item => {
            const isManual = checkIsManualItem(item);
            const serviceId = isManual ? 'manual_group' : (item.billingServiceId || 'outros');

            const rawServiceName = item.serviceName || (services.find(s => s.id === item.billingServiceId)?.name) || item.description || 'Outros Serviços';
            const cleanServiceName = rawServiceName
                .replace(/\s*\(NF\s*#?\d+\)/gi, '')
                .replace(/\s*\(NF-e\s*Entrada\s*#?\d+\)/gi, '')
                .replace(/\s*\(Pedido\s*#?[^)]+\)/gi, '')
                .replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}$/, '')
                .trim();

            if (!map[serviceId]) {
                const serviceDef = services.find(s => s.id === item.billingServiceId);
                const cat = classifyService(item);
                const isAuto = serviceDef?.type === 'Automatic_Daily' ||
                    serviceDef?.type === 'Automatic_SQL' ||
                    serviceDef?.type === 1 ||
                    serviceDef?.type === '1' ||
                    cat === 'storage' ||
                    cat === 'ad_valorem' ||
                    item.documentType === 'Diária de Estoque';

                map[serviceId] = {
                    serviceId,
                    serviceName: isManual ? 'Lançamentos Avulsos / Extras' : cleanServiceName,
                    category: isManual ? 'manual' : cat,
                    isDaily: isAuto,
                    totalAmount: 0,
                    totalQuantity: 0,
                    packagingBreakdown: {},
                    items: []
                };
            }

            const group = map[serviceId];
            const val = Number(item.serviceTotal || 0);
            const vol = Number(item.quantityTotal || 0);

            group.totalAmount += val;
            group.totalQuantity += vol;
            group.items.push(item);

            const isAdValorem = group.category === 'ad_valorem';
            const aggregatedPacks = aggregatePackagingRows(item.statementDataJson, vol, val, isAdValorem);
            aggregatedPacks.forEach(p => {
                const key = p.packagingCode;
                if (!group.packagingBreakdown[key]) {
                    group.packagingBreakdown[key] = {
                        count: 0,
                        unitValue: p.unitValue,
                        totalValue: 0
                    };
                }
                group.packagingBreakdown[key].count += p.volumeCount;
                group.packagingBreakdown[key].totalValue += p.totalValue;
                if (p.unitValue > 0) {
                    group.packagingBreakdown[key].unitValue = p.unitValue;
                }
            });
        });

        return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [cycle, services]);

    // Visão 2: Agrupada por NF-e de Entrada
    const groupedByInboundNfe = useMemo(() => {
        if (!cycle?.items) return [];

        const nfeMap = {};

        cycle.items.forEach(item => {
            if (checkIsManualItem(item)) return;

            const nfeKey = extractNfeNumber(item);

            if (!nfeMap[nfeKey]) {
                nfeMap[nfeKey] = {
                    nfeNumber: nfeKey,
                    entryDate: item.chargeDate,
                    isOutboundOrder: item.documentType?.includes('Saída'),
                    volumeTotal: 0,
                    handlingInTotal: 0,
                    storageTotal: 0,
                    adValoremTotal: 0,
                    handlingOutTotal: 0,
                    totalAmount: 0,
                    packagingBreakdown: {},
                    occurrences: []
                };
            }

            const val = Number(item.serviceTotal || 0);
            const vol = Number(item.quantityTotal || 0);
            const cat = classifyService(item);
            const group = nfeMap[nfeKey];

            if (cat === 'handling_in') group.handlingInTotal += val;
            else if (cat === 'storage') group.storageTotal += val;
            else if (cat === 'ad_valorem') group.adValoremTotal += val;
            else if (cat === 'handling_out') group.handlingOutTotal += val;

            group.totalAmount += val;

            const isAdValorem = cat === 'ad_valorem';
            const aggregatedPacks = aggregatePackagingRows(item.statementDataJson, vol, val, isAdValorem);
            aggregatedPacks.forEach(p => {
                const key = p.packagingCode;
                if (!group.packagingBreakdown[key]) {
                    group.packagingBreakdown[key] = {
                        count: 0,
                        unitValue: p.unitValue,
                        totalValue: 0
                    };
                }
                group.packagingBreakdown[key].count += p.volumeCount;
                group.packagingBreakdown[key].totalValue += p.totalValue;
                if (p.unitValue > 0) {
                    group.packagingBreakdown[key].unitValue = p.unitValue;
                }
            });

            const typeLabel = cat === 'handling_in'
                ? 'Recebimento (Handling In)'
                : (cat === 'storage' ? 'Armazenagem Diária' : (cat === 'ad_valorem' ? 'Seguro / Ad-Valorem' : (cat === 'handling_out' ? 'Separação / Handling Out' : 'Outro Serviço')));

            group.occurrences.push({
                id: item.id,
                type: typeLabel,
                date: item.chargeDate,
                description: item.description,
                detailedPacks: aggregatedPacks,
                volume: vol,
                amount: val,
                manualNotes: item.manualNotes,
                statementDataJson: item.statementDataJson
            });
        });

        Object.values(nfeMap).forEach(g => {
            g.occurrences.sort((a, b) => new Date(a.date) - new Date(b.date));
        });

        return Object.values(nfeMap).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [cycle]);

    const filteredServices = useMemo(() => {
        if (!filterTerm.trim()) return groupedByService;
        const term = filterTerm.toLowerCase();
        return groupedByService.filter(g =>
            g.serviceName.toLowerCase().includes(term) ||
            g.items.some(i => (i.description || '').toLowerCase().includes(term) || (i.documentNumber || '').toLowerCase().includes(term))
        );
    }, [groupedByService, filterTerm]);

    const filteredNfes = useMemo(() => {
        if (!filterTerm.trim()) return groupedByInboundNfe;
        const term = filterTerm.toLowerCase();
        return groupedByInboundNfe.filter(g =>
            g.nfeNumber.toLowerCase().includes(term) ||
            g.occurrences.some(o => o.description?.toLowerCase().includes(term))
        );
    }, [groupedByInboundNfe, filterTerm]);

    const toggleServiceExpand = (serviceId) => {
        setExpandedServiceIds(prev =>
            prev.includes(serviceId) ? prev.filter(id => id !== serviceId) : [...prev, serviceId]
        );
    };

    const toggleNfeExpand = (nfeKey) => {
        setExpandedNfeKeys(prev =>
            prev.includes(nfeKey) ? prev.filter(key => key !== nfeKey) : [...prev, nfeKey]
        );
    };

    const handleExpandAll = () => {
        if (viewMode === 'services') {
            setExpandedServiceIds(filteredServices.map(s => s.serviceId));
        } else {
            setExpandedNfeKeys(filteredNfes.map(n => n.nfeNumber));
        }
    };

    const handleCollapseAll = () => {
        if (viewMode === 'services') setExpandedServiceIds([]);
        else setExpandedNfeKeys([]);
    };

    if (isLoading && !cycle) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando extrato de faturamento analítico...</p>
            </div>
        );
    }

    const isDraft = cycle?.status === 'Draft' || cycle?.status === '1';

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO ORQUESTRADOR */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/billing/tarifas-ciclos')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold tracking-tight text-slate-900">
                                Extrato de Faturamento - {cycle?.customerName}
                            </h1>
                            <Badge className={`text-xs ${isDraft ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                                {isDraft ? '🟢 Aberto (Acumulando)' : '🔒 Fatura Congelada'}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Competência Contábil: <strong className="font-mono text-slate-800">{cycle?.referenceMonth}</strong> ({formatDatePtBr(cycle?.startDate)} a {formatDatePtBr(cycle?.endDate)})
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        onClick={handleDownloadCsv}
                        variant="outline"
                        size="sm"
                        className="bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 h-9 font-semibold shadow-2xs"
                    >
                        <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />
                        Exportar
                    </Button>
                    <Button
                        onClick={handlePrintStatement}
                        variant="outline"
                        size="sm"
                        className="bg-white text-slate-700 h-9 font-medium shadow-2xs hover:bg-slate-50"
                    >
                        <FileText className="mr-1.5 h-4 w-4 text-blue-600" />
                        Imprimir
                    </Button>

                    {isDraft && (
                        <>
                            <Button onClick={handleRecalculateCycle} variant="outline" size="sm" className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 h-9 font-semibold">
                                <RefreshCw className="mr-1.5 h-4 w-4" /> Recalcular
                            </Button>
                            <Button onClick={() => setIsManualModalOpen(true)} variant="outline" size="sm" className="bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 h-9 font-semibold">
                                <Plus className="mr-1.5 h-4 w-4" /> Extra
                            </Button>
                            <Button onClick={handleCloseCycle} size="sm" className="bg-slate-900 hover:bg-slate-800 text-white h-9 font-semibold">
                                <Lock className="mr-1.5 h-4 w-4" /> Fechar
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* CARDS DE RESUMO FINANCEIRO ANALÍTICO */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-emerald-200 bg-emerald-50/30 shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-emerald-800 uppercase flex items-center justify-between">
                            <span>Total Geral da Fatura</span>
                            <TrendingUp size={16} className="text-emerald-700" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-emerald-800">
                            {formatCurrency(cycle?.totalAmount || 0)}
                        </p>
                        <span className="text-[10px] text-emerald-600 font-mono">{cycle?.items?.length || 0} lançamentos consolidados</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Diárias (Armaz. / Seguro)</span>
                            <Calendar size={16} className="text-purple-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-purple-800">
                            {formatCurrency(metrics.dailyTotal)}
                        </p>
                        <span className="text-[10px] text-slate-400">Armazenagem e Ad-Valorem Noturno</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Eventos Operacionais</span>
                            <Receipt size={16} className="text-blue-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-blue-800">
                            {formatCurrency(metrics.eventsTotal)}
                        </p>
                        <span className="text-[10px] text-slate-400">Recebimento e Separação por Volume</span>
                    </CardContent>
                </Card>

                <Card className="border-amber-200 bg-amber-50/20 shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-amber-800 uppercase flex items-center justify-between">
                            <span>Lançamentos Avulsos</span>
                            <Plus size={16} className="text-amber-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-amber-800">
                            {formatCurrency(metrics.manualTotal)}
                        </p>
                        <span className="text-[10px] text-amber-600/80">Serviços manuais e extras</span>
                    </CardContent>
                </Card>
            </div>

            {/* BARRA DE CONTROLE: SELETOR DE VISÃO + BUSCA + EXPANDIR/RECOLHER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/80 p-3 rounded-xl shadow-2xs">
                <div className="flex items-center gap-2">
                    <Button
                        variant={viewMode === 'services' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => { setViewMode('services'); setExpandedItemDetailId(null); }}
                        className={`text-xs h-9 font-bold ${viewMode === 'services' ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs' : 'text-slate-500'}`}
                    >
                        <Layers size={14} className="mr-1.5 text-blue-600" /> Visão por Serviços ({groupedByService.length})
                    </Button>
                    <Button
                        variant={viewMode === 'invoices' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => { setViewMode('invoices'); setExpandedItemDetailId(null); }}
                        className={`text-xs h-9 font-bold ${viewMode === 'invoices' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs' : 'text-slate-500'}`}
                    >
                        <FileSpreadsheet size={14} className="mr-1.5 text-emerald-600" /> Visão por NF-e de Entrada ({groupedByInboundNfe.length})
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Buscar serviço, NF-e ou embalagem..."
                            value={filterTerm}
                            onChange={(e) => setFilterTerm(e.target.value)}
                            className="pl-8 bg-slate-50 border-slate-200 text-xs h-9 font-mono"
                        />
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExpandAll}
                        className="text-xs h-9 bg-white text-slate-600 border-slate-200"
                        title="Expandir todas as seções"
                    >
                        <ChevronDown size={14} className="mr-1" /> Expandir
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCollapseAll}
                        className="text-xs h-9 bg-white text-slate-600 border-slate-200"
                        title="Recolher todas as seções"
                    >
                        <ChevronUp size={14} className="mr-1" /> Recolher
                    </Button>
                </div>
            </div>

            {/* RENDERIZAÇÃO MODULAR DA ABA ATIVA */}
            {viewMode === 'services' ? (
                <VisaoPorServicosTab
                    services={filteredServices}
                    expandedServiceIds={expandedServiceIds}
                    toggleServiceExpand={toggleServiceExpand}
                    expandedItemDetailId={expandedItemDetailId}
                    setExpandedItemDetailId={setExpandedItemDetailId}
                    isDraft={isDraft}
                    setItemToDelete={setItemToDelete}
                />
            ) : (
                <VisaoPorNfeTab
                    nfes={filteredNfes}
                    expandedNfeKeys={expandedNfeKeys}
                    toggleNfeExpand={toggleNfeExpand}
                />
            )}

            {/* MODAL DE LANÇAMENTO MANUAL EXTRA */}
            <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Plus className="text-emerald-600" size={20} /> Lançamento Extra no Ciclo
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Adicione serviços ad-hoc executados no período (ex.: descarte de paletes, re-etiquetagem, horas extras).
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveManualItem} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Serviço Logístico *</Label>
                            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                                <SelectTrigger className="bg-white text-xs h-9"><SelectValue placeholder="Escolha o serviço..." /></SelectTrigger>
                                <SelectContent>
                                    {services.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Descrição / Justificativa *</Label>
                            <Input
                                placeholder="Ex: Mão de obra extra para re-etiquetagem"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="bg-white text-xs h-9"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Data do Serviço *</Label>
                                <DatePicker
                                    date={chargeDate}
                                    setDate={(d) => setChargeDate(d || new Date())}
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Documento / Ref</Label>
                                <Input
                                    placeholder="Ex: OS 1045 / Avulso"
                                    value={documentNumber}
                                    onChange={(e) => setDocumentNumber(e.target.value)}
                                    className="bg-white text-xs h-9 font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Quantidade Total *</Label>
                                <Input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(Number(e.target.value))}
                                    className="bg-white font-mono text-xs h-9"
                                    min="1"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Valor Total R$ *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={totalValue}
                                    onChange={(e) => setTotalValue(Number(e.target.value))}
                                    className="bg-white font-mono text-xs h-9"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Observações Manuais (Auditoria)</Label>
                            <Input
                                placeholder="Aprovado por e-mail pelo cliente"
                                value={manualNotes}
                                onChange={(e) => setManualNotes(e.target.value)}
                                className="bg-white text-xs h-9"
                            />
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsManualModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                                Gravar Lançamento
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
            <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-600 text-base">
                            <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão de Cobrança
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Tem certeza de que deseja remover este lançamento do extrato? Caso seja um estorno de recebimento ou expedição, o recálculo poderá ser acionado novamente.
                        </DialogDescription>
                    </DialogHeader>

                    {itemToDelete && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1.5 font-sans">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Descrição:</span>
                                <strong className="text-slate-800">{itemToDelete.description || itemToDelete.serviceName}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Documento / Tipo:</span>
                                <span className="font-semibold text-slate-700">
                                    {itemToDelete.documentNumber || itemToDelete.documentType || 'Consolidado'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Quantidade:</span>
                                <span className="font-mono text-slate-700">{itemToDelete.quantityTotal}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-200/60 pt-1">
                                <span className="text-slate-500">Valor a Estornar:</span>
                                <strong className="font-mono text-rose-600">
                                    {formatCurrency(itemToDelete.serviceTotal || 0)}
                                </strong>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setItemToDelete(null)}
                            disabled={isDeletingItem}
                            className="h-9"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleConfirmDeleteItem}
                            disabled={isDeletingItem}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-9"
                        >
                            {isDeletingItem ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                            Excluir Lançamento
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}