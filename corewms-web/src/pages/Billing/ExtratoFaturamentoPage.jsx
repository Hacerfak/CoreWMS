import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { downloadBackendCsv } from '@/lib/exportCsv';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import {
    ArrowLeft, Receipt, Calendar, Download, Lock, RefreshCw,
    Plus, Loader2, CheckCircle2, ChevronDown, ChevronRight, FileText,
    TrendingUp, Sparkles, Trash2, AlertTriangle, Layers, FileSpreadsheet, Package, Clock
} from 'lucide-react';
import { toast } from 'sonner';

// Utilitário para formatar datas civis sem retroceder o dia devido ao fuso horário
const formatDatePtBr = (dateValue) => {
    if (!dateValue) return '-';
    if (typeof dateValue === 'string') {
        const clean = dateValue.split('T')[0];
        const parts = clean.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        }
    }
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch {
        return '-';
    }
};

// Converte textos com data/hora em UTC para o Horário de Brasília (America/Sao_Paulo - UTC-3)
const formatNotesWithLocalTime = (notes) => {
    if (!notes) return '-';
    const match = notes.match(/(Atualizado|Recalculado) em (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(.*)/);
    if (match) {
        const [, action, day, month, year, hour, minute, rest] = match;
        const utcDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
        if (!isNaN(utcDate.getTime())) {
            const localStr = utcDate.toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            return `${action} em ${localStr}${rest || ''}`;
        }
    }
    return notes;
};

const formatCurrency = (val) => {
    const num = Number(val);
    return (isNaN(num) ? 0 : num).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatNumber = (val) => {
    const num = Number(val);
    return (isNaN(num) ? 0 : num).toLocaleString('pt-BR');
};

const extractNfeNumber = (item) => {
    if (!item) return 'Estoque Consolidado';
    if (item.documentNumber && !item.documentNumber.includes('/') && item.documentNumber !== 'Estoque Consolidado') {
        return item.documentNumber.replace(/[^0-9]/g, '') || item.documentNumber;
    }
    const match = (item.description || '').match(/NF(?:-e)?\s*(?:Entrada)?\s*#?\s*(\d+)/i);
    if (match) return match[1];

    if (item.statementDataJson) {
        try {
            const parsed = JSON.parse(item.statementDataJson);
            const first = Array.isArray(parsed) ? parsed[0] : parsed;
            if (first?.NF_ENTRADA && !String(first.NF_ENTRADA).includes('/')) {
                return String(first.NF_ENTRADA).replace(/[^0-9]/g, '');
            }
        } catch { }
    }
    return item.documentNumber || 'Estoque Consolidado';
};

const classifyService = (item) => {
    const desc = (item.description || item.serviceName || '').toLowerCase();
    const docType = (item.documentType || '').toLowerCase();

    if (desc.includes('ad-valorem') || desc.includes('seguro')) {
        return 'ad_valorem';
    }
    if (desc.includes('armazenagem') || desc.includes('storage') || desc.includes('estadia') || docType.includes('diária')) {
        return 'storage';
    }
    if (desc.includes('recebimento') || desc.includes('handling in') || desc.includes('entrada') || docType.includes('entrada')) {
        return 'handling_in';
    }
    if (desc.includes('expedição') || desc.includes('handling out') || desc.includes('stretch') || desc.includes('saída') || docType.includes('saída')) {
        return 'handling_out';
    }
    return 'other';
};

export default function ExtratoFaturamentoPage() {
    const { id: cycleId } = useParams();
    const navigate = useNavigate();

    const [cycle, setCycle] = useState(null);
    const [services, setServices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [expandedItemId, setExpandedItemId] = useState(null);
    const [expandedNfeKey, setExpandedNfeKey] = useState(null);

    const [viewMode, setViewMode] = useState('services');

    // Estado do Modal de Lançamento Manual Extra
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [description, setDescription] = useState('');
    const [documentNumber, setDocumentNumber] = useState('');
    const [chargeDate, setChargeDate] = useState(() => new Date());
    const [quantity, setQuantity] = useState(1);
    const [totalValue, setTotalValue] = useState(0);
    const [manualNotes, setManualNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    const handleExportPdf = async () => {
        if (!cycleId) return;
        try {
            setIsExportingPdf(true);
            const response = await customInstance({
                url: `/api/billing/cycles/${cycleId}/export-pdf`,
                method: 'GET',
                responseType: 'blob'
            });

            const blob = response instanceof Blob
                ? response
                : new Blob([response.data || response], { type: 'application/pdf' });

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const refMonth = (cycle?.referenceMonth || 'extrato').replace('/', '_');
            link.setAttribute('download', `extrato_faturamento_${refMonth}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Extrato em PDF baixado com sucesso!');
        } catch (error) {
            console.error('Erro detalhado ao gerar PDF:', error);
            toast.error(error.response?.data?.message || 'Erro ao gerar PDF do extrato.');
        } finally {
            setIsExportingPdf(false);
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
            toast.success('Motor executado! Diárias e saldos recalculados.');
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

            // Normaliza a data selecionada para UTC com a data civil escolhida
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

            if (isManual) {
                manualTotal += val;
            } else if (cat === 'storage' || cat === 'ad_valorem') {
                dailyTotal += val;
            } else {
                eventsTotal += val;
            }
        });

        return { dailyTotal, eventsTotal, manualTotal };
    }, [cycle]);

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
                    volumeTotal: 0,
                    handlingInTotal: 0,
                    storageTotal: 0,
                    adValoremTotal: 0,
                    totalAmount: 0,
                    products: [],
                    occurrences: []
                };
            }

            const val = Number(item.serviceTotal || 0);
            const vol = Number(item.quantityTotal || 0);
            const cat = classifyService(item);

            if (cat === 'handling_in') {
                nfeMap[nfeKey].handlingInTotal += val;
            } else if (cat === 'storage') {
                nfeMap[nfeKey].storageTotal += val;
            } else if (cat === 'ad_valorem') {
                nfeMap[nfeKey].adValoremTotal += val;
            }

            nfeMap[nfeKey].totalAmount += val;
            nfeMap[nfeKey].volumeTotal = Math.max(nfeMap[nfeKey].volumeTotal, vol);

            if (item.statementDataJson) {
                try {
                    const parsed = JSON.parse(item.statementDataJson);
                    const rows = Array.isArray(parsed) ? parsed : [parsed];
                    rows.forEach(r => {
                        const sku = r.SKU;
                        if (sku && !nfeMap[nfeKey].products.some(p => p.sku === sku)) {
                            nfeMap[nfeKey].products.push({
                                sku,
                                description: r.DESCRICAO || '',
                                volume: r.VOLUME || vol,
                                packaging: r.TIPO_VOLUME || 'PLT'
                            });
                        }
                    });
                } catch { }
            }

            const typeLabel = cat === 'handling_in'
                ? 'Handling In (Recebimento)'
                : (cat === 'storage' ? 'Armazenagem Diária' : (cat === 'ad_valorem' ? 'Seguro / Ad-Valorem' : 'Outro Serviço'));

            nfeMap[nfeKey].occurrences.push({
                type: typeLabel,
                date: item.chargeDate,
                description: item.description,
                packaging: 'PLT',
                volume: vol,
                amount: val
            });
        });

        return Object.values(nfeMap).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [cycle]);

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
            {/* CABEÇALHO */}
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

                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleExportPdf}
                        disabled={isExportingPdf}
                        variant="outline"
                        size="sm"
                        className="bg-white text-slate-700 h-9 font-medium shadow-2xs"
                    >
                        {isExportingPdf ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin text-rose-600" /> : <FileText className="mr-1.5 h-4 w-4 text-rose-600" />}
                        Exportar PDF
                    </Button>

                    {isDraft && (
                        <>
                            <Button onClick={handleRecalculateCycle} variant="outline" size="sm" className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 h-9 font-semibold">
                                <RefreshCw className="mr-1.5 h-4 w-4" /> Recalcular Motor
                            </Button>
                            <Button onClick={() => setIsManualModalOpen(true)} variant="outline" size="sm" className="bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 h-9 font-semibold">
                                <Plus className="mr-1.5 h-4 w-4" /> Lançamento Extra
                            </Button>
                            <Button onClick={handleCloseCycle} size="sm" className="bg-slate-900 hover:bg-slate-800 text-white h-9 font-semibold">
                                <Lock className="mr-1.5 h-4 w-4" /> Fechar Ciclo
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
                        <span className="text-[10px] text-slate-400">Apuração contínua de estoque</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Eventos (Entrada / Saída)</span>
                            <Receipt size={16} className="text-blue-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-blue-800">
                            {formatCurrency(metrics.eventsTotal)}
                        </p>
                        <span className="text-[10px] text-slate-400">Handling In/Out e Insumos</span>
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
                        <span className="text-[10px] text-amber-600/80">Serviços adicionais manuais</span>
                    </CardContent>
                </Card>
            </div>

            {/* SELETOR DE VISÃO DO EXTRATO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 p-2 rounded-xl shadow-2xs">
                <div className="flex items-center gap-1.5">
                    <Button
                        variant={viewMode === 'services' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('services')}
                        className={`text-xs h-8 font-semibold ${viewMode === 'services' ? 'bg-slate-100 text-slate-900 shadow-2xs' : 'text-slate-500'}`}
                    >
                        <Layers size={14} className="mr-1.5 text-blue-600" /> Visão por Serviços ({cycle?.items?.length || 0})
                    </Button>
                    <Button
                        variant={viewMode === 'invoices' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('invoices')}
                        className={`text-xs h-8 font-semibold ${viewMode === 'invoices' ? 'bg-slate-100 text-slate-900 shadow-2xs' : 'text-slate-500'}`}
                    >
                        <FileSpreadsheet size={14} className="mr-1.5 text-emerald-600" /> Visão por NF-e de Entrada ({groupedByInboundNfe.length})
                    </Button>
                </div>

                <span className="text-[11px] text-slate-400 font-mono pr-2">
                    {viewMode === 'services' ? 'Apurações diárias, operacionais e avulsas' : 'Consolidado por nota fiscal de recebimento (Estilo 3PL)'}
                </span>
            </div>

            {/* VISÃO 1: POR SERVIÇOS */}
            {viewMode === 'services' && (
                <Card className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                    <CardHeader className="p-4 border-b bg-slate-50/60 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                            <FileText size={16} className="text-emerald-600" /> Extrato Analítico dos Serviços Prestados
                        </CardTitle>
                        <span className="text-[11px] text-slate-500 font-mono">
                            Lançamentos separados por documento de origem e data de apuração
                        </span>
                    </CardHeader>

                    <CardContent className="p-0 overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead className="w-8"></TableHead>
                                    <TableHead className="w-28">Data Cobrança</TableHead>
                                    <TableHead className="w-44">Doc. Origem</TableHead>
                                    <TableHead>Serviço / Operação</TableHead>
                                    <TableHead className="text-right">Volume / Qtd</TableHead>
                                    <TableHead className="text-right">Valor Total R$</TableHead>
                                    <TableHead>Observações</TableHead>
                                    <TableHead className="text-right w-16">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cycle?.items?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-28 text-center text-xs text-slate-400 italic">
                                            Nenhum serviço bilhetado neste ciclo até o momento.
                                        </TableCell>
                                    </TableRow>
                                ) : cycle?.items?.map((item) => {
                                    const isExpanded = expandedItemId === item.id;
                                    const hasStatement = Boolean(item.statementDataJson);
                                    const isManual = checkIsManualItem(item);
                                    const cat = classifyService(item);
                                    const isDaily = cat === 'storage' || cat === 'ad_valorem';
                                    const nfeDocNumber = extractNfeNumber(item);

                                    let parsedStatement = [];
                                    if (hasStatement) {
                                        try {
                                            const parsed = JSON.parse(item.statementDataJson);
                                            parsedStatement = Array.isArray(parsed) ? parsed : [parsed];
                                        } catch {
                                            parsedStatement = [];
                                        }
                                    }

                                    const cleanDescription = (item.description || item.serviceName || '')
                                        .replace(/\s*\(NF\s*#?\d+\)/gi, '')
                                        .replace(/\s*\(NF-e\s*Entrada\s*#?\d+\)/gi, '')
                                        .replace(/\s*-\s*\d{2}\/\d{2}\/\d{4}$/, '');

                                    return (
                                        <React.Fragment key={item.id}>
                                            <TableRow className="hover:bg-slate-50/50 transition-colors">
                                                <TableCell>
                                                    {hasStatement && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                                                            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-800"
                                                        >
                                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        </Button>
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-slate-700">
                                                    {formatDatePtBr(item.chargeDate)}
                                                </TableCell>
                                                <TableCell>
                                                    {isManual ? (
                                                        <div className="space-y-0.5">
                                                            <Badge variant="outline" className="font-mono text-[10px] bg-amber-50 text-amber-800 border-amber-300">
                                                                {item.documentNumber || 'Lançamento Avulso'}
                                                            </Badge>
                                                            <span className="block text-[9px] text-amber-600 font-medium">Ajuste Manual</span>
                                                        </div>
                                                    ) : nfeDocNumber && nfeDocNumber !== 'Estoque Consolidado' ? (
                                                        <div className="space-y-0.5">
                                                            <Badge variant="outline" className={`font-mono text-[10px] ${isDaily ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
                                                                {item.documentType?.includes('Saída') ? `Ped #${nfeDocNumber}` : `NF #${nfeDocNumber}`}
                                                            </Badge>
                                                            <span className="block text-[9px] text-slate-500 font-medium">
                                                                {cat === 'storage' ? 'Diária de Armazenagem' : (cat === 'ad_valorem' ? 'Seguro Ad-Valorem' : (item.documentType || 'Recebimento NF-e'))}
                                                            </span>
                                                        </div>
                                                    ) : isDaily ? (
                                                        <div className="space-y-0.5">
                                                            <Badge variant="outline" className="font-mono text-[10px] bg-purple-50 text-purple-800 border-purple-200">
                                                                Estoque em Custódia
                                                            </Badge>
                                                            <span className="block text-[9px] text-purple-600 font-medium">Diária Contínua</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 font-mono">Consolidado</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs font-semibold text-slate-900">
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={14} className={isDaily ? 'text-purple-600' : 'text-emerald-600'} />
                                                        <span>{cleanDescription}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs font-bold text-slate-800">
                                                    {formatNumber(item.quantityTotal || 0)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-emerald-700 text-sm">
                                                    {formatCurrency(item.serviceTotal || 0)}
                                                </TableCell>
                                                <TableCell className="text-xs text-slate-500 italic">
                                                    {formatNotesWithLocalTime(item.manualNotes)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isDraft && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setItemToDelete(item)}
                                                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 h-7 w-7 p-0"
                                                            title="Excluir este lançamento"
                                                        >
                                                            <Trash2 size={13} />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>

                                            {isExpanded && hasStatement && (
                                                <TableRow className="bg-slate-50/80">
                                                    <TableCell colSpan={8} className="p-4">
                                                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                                                            <div className="flex items-center justify-between border-b pb-2">
                                                                <span className="font-bold text-xs uppercase text-slate-800 flex items-center gap-1.5">
                                                                    <Sparkles size={14} className="text-emerald-600" />
                                                                    Apuração por NF-e de Entrada ({parsedStatement.length} registros)
                                                                </span>
                                                                <Badge variant="outline" className="font-mono text-[10px]">
                                                                    Competência: {cycle?.referenceMonth}
                                                                </Badge>
                                                            </div>

                                                            <div className="border border-slate-100 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                                                                <Table>
                                                                    <TableHeader className="bg-slate-50">
                                                                        <TableRow>
                                                                            <TableHead className="text-xs">NF-e Entrada</TableHead>
                                                                            <TableHead className="text-xs">Data Entrada</TableHead>
                                                                            <TableHead className="text-xs">SKU / Produto</TableHead>
                                                                            <TableHead className="text-xs">Embalagem</TableHead>
                                                                            <TableHead className="text-right text-xs">Volumes</TableHead>
                                                                            <TableHead className="text-right text-xs">Valor R$</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {parsedStatement.map((rec, rIdx) => {
                                                                            const nfeLabel = rec.NF_ENTRADA ? `NF #${rec.NF_ENTRADA}` : (rec.OrderNumber ? `Ped #${rec.OrderNumber}` : (nfeDocNumber ? `NF #${nfeDocNumber}` : 'Estoque Geral'));
                                                                            const lineDate = rec.DATA_ENTRADA || rec.DATA || item.chargeDate;
                                                                            const lineVal = Number(rec.VALOR_TOTAL ?? rec.VALOR_DIARIA ?? 0) || 0;

                                                                            return (
                                                                                <TableRow key={rIdx} className="hover:bg-slate-50/50 text-xs font-mono">
                                                                                    <TableCell className="font-bold text-blue-700">
                                                                                        {nfeLabel}
                                                                                    </TableCell>
                                                                                    <TableCell className="text-slate-600">
                                                                                        {formatDatePtBr(lineDate)}
                                                                                    </TableCell>
                                                                                    <TableCell className="text-slate-800">
                                                                                        {rec.SKU ? (
                                                                                            <span><strong>{rec.SKU}</strong> - {rec.DESCRICAO || ''}</span>
                                                                                        ) : (rec.DESCRICAO || 'Apuração de Saldo')}
                                                                                    </TableCell>
                                                                                    <TableCell className="font-semibold text-slate-700">
                                                                                        {rec.TIPO_VOLUME || rec.PackagingCode || 'PLT'}
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right font-bold text-slate-900">
                                                                                        {formatNumber(rec.VOLUME ?? rec.VolumeCount ?? 1)}
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right font-bold text-emerald-700">
                                                                                        {formatCurrency(lineVal)}
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            );
                                                                        })}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* VISÃO 2: CONSOLIDADO POR NF-E DE ENTRADA */}
            {viewMode === 'invoices' && (
                <div className="space-y-4">
                    {groupedByInboundNfe.length === 0 ? (
                        <Card className="p-8 text-center text-slate-400 italic text-xs bg-white">
                            Nenhuma NF-e de entrada identificada com cobranças neste ciclo.
                        </Card>
                    ) : (
                        groupedByInboundNfe.map((nfeGroup) => {
                            const isExpandedNfe = expandedNfeKey === nfeGroup.nfeNumber;

                            return (
                                <Card key={nfeGroup.nfeNumber} className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                                    <CardHeader className="p-4 bg-slate-50/80 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setExpandedNfeKey(isExpandedNfe ? null : nfeGroup.nfeNumber)}
                                                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-800"
                                            >
                                                {isExpandedNfe ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </Button>

                                            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                                                <Package size={18} />
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-sm text-slate-900 font-mono">
                                                        NF-e Entrada #{nfeGroup.nfeNumber}
                                                    </h3>
                                                    <Badge variant="outline" className="text-[10px] bg-white font-mono">
                                                        Entrada: {formatDatePtBr(nfeGroup.entryDate)}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-mono">
                                                        {formatNumber(nfeGroup.volumeTotal)} vol(s)
                                                    </Badge>
                                                </div>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    {nfeGroup.products.length > 0
                                                        ? nfeGroup.products.map(p => `${p.sku} (${p.volume} ${p.packaging})`).join(', ')
                                                        : `${nfeGroup.occurrences.length} lançamento(s) apurado(s) nesta nota fiscal`}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Faturado da Nota</span>
                                            <span className="text-lg font-bold font-mono text-emerald-700">
                                                {formatCurrency(nfeGroup.totalAmount)}
                                            </span>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="p-4 space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70 flex justify-between items-center">
                                                <span className="text-slate-600 font-sans">Recebimento (Handling In):</span>
                                                <strong className="text-blue-700 font-bold">
                                                    {formatCurrency(nfeGroup.handlingInTotal)}
                                                </strong>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70 flex justify-between items-center">
                                                <span className="text-slate-600 font-sans">Armazenagem Acumulada:</span>
                                                <strong className="text-purple-700 font-bold">
                                                    {formatCurrency(nfeGroup.storageTotal)}
                                                </strong>
                                            </div>
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70 flex justify-between items-center">
                                                <span className="text-slate-600 font-sans">Seguro / Ad-Valorem:</span>
                                                <strong className="text-emerald-700 font-bold">
                                                    {formatCurrency(nfeGroup.adValoremTotal)}
                                                </strong>
                                            </div>
                                        </div>

                                        {isExpandedNfe && nfeGroup.occurrences.length > 0 && (
                                            <div className="border border-slate-200 rounded-xl overflow-hidden animate-in fade-in duration-200">
                                                <div className="bg-slate-100/70 px-3 py-2 border-b text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                    <Clock size={13} className="text-blue-600" /> Detalhamento Analítico dos Serviços desta NF-e
                                                </div>
                                                <Table>
                                                    <TableHeader className="bg-slate-50">
                                                        <TableRow>
                                                            <TableHead className="text-xs">Serviço</TableHead>
                                                            <TableHead className="text-xs">Data Ref</TableHead>
                                                            <TableHead className="text-xs">Descrição da Operação</TableHead>
                                                            <TableHead className="text-xs">Embalagem</TableHead>
                                                            <TableHead className="text-right text-xs">Volumes</TableHead>
                                                            <TableHead className="text-right text-xs">Valor Cobrado R$</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {nfeGroup.occurrences.map((occ, oIdx) => (
                                                            <TableRow key={oIdx} className="hover:bg-slate-50 text-xs font-mono">
                                                                <TableCell className="font-semibold text-slate-800">{occ.type}</TableCell>
                                                                <TableCell className="text-slate-600">{formatDatePtBr(occ.date)}</TableCell>
                                                                <TableCell className="text-slate-700">{occ.description}</TableCell>
                                                                <TableCell className="font-bold text-slate-800">{occ.packaging}</TableCell>
                                                                <TableCell className="text-right font-bold text-slate-900">{formatNumber(occ.volume)}</TableCell>
                                                                <TableCell className="text-right font-bold text-emerald-700">{formatCurrency(occ.amount)}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
                </div>
            )}

            {/* MODAL DE LANÇAMENTO MANUAL EXTRA */}
            <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Plus className="text-emerald-600" size={20} /> Lançamento Extra no Ciclo
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Adicione serviços ad-hoc executados no período (ex: descarte de paletes, etiquetagem especial, horas extras).
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

                        {/* DATA DA COBRANÇA (DATEPICKER) E NÚMERO DO DOCUMENTO */}
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