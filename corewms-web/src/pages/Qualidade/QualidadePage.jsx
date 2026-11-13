import { useState, useMemo } from 'react';
import { useGetApiInventoryHandlingUnits } from '@/api/generated/inventory/inventory';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { customInstance } from '@/api/orval-mutator';
import { useQueryClient, useQuery } from '@tanstack/react-query';

import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
    ShieldAlert, ShieldCheck, AlertTriangle, Search, Loader2,
    Layers, MapPin, Lock, RefreshCw, Tag, ClipboardList, PackageSearch
} from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/date-picker';

// Componentes Modais Modulares da Qualidade
import RegisterHoldModal from './RegisterHoldModal';
import BulkHoldModal from './BulkHoldModal';
import ReleaseQualityModal from './ReleaseQualityModal';
import QualityEventDetailsModal from './QualityEventDetailsModal';
import QualityReasonsTab from './QualityReasonsTab';

const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleString('pt-BR'); }
    catch { return '-'; }
};

export default function QualidadePage() {
    const queryClient = useQueryClient();
    const [currentTab, setCurrentTab] = useState('estoque');

    // ==========================================
    // ESTADO: ABA 1 - ESTOQUE & BLOQUEIOS
    // ==========================================
    const [stockCustomer, setStockCustomer] = useState('ALL');
    const [stockQuality, setStockQuality] = useState('BLOCKED_ONLY'); // BLOCKED_ONLY, Quarantine, Damaged, Virtual_Shortage, Available, ALL
    const [stockLpn, setStockLpn] = useState('');
    const [stockPage, setStockPage] = useState(1);
    const STOCK_PAGE_SIZE = 20;
    const [selectedStockHuIds, setSelectedStockHuIds] = useState([]);

    // Controle de Modais - Aba Estoque
    const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
    const [isBulkHoldModalOpen, setIsBulkHoldModalOpen] = useState(false);
    const [isReleaseFromStockModalOpen, setIsReleaseFromStockModalOpen] = useState(false);
    const [holdTargetStatus, setHoldTargetStatus] = useState('3'); // 2, 3, 4

    // ==========================================
    // ESTADO: ABA 2 - PRONTUÁRIOS & LAUDOS (QUALITY EVENTS)
    // ==========================================
    const [eventsCustomer, setEventsCustomer] = useState('ALL');
    const [eventsStatus, setEventsStatus] = useState('OPEN_ONLY'); // OPEN_ONLY, ALL, RESOLVED_ONLY
    const [eventsSearch, setEventsSearch] = useState('');
    const [eventsStartDate, setEventsStartDate] = useState(undefined);
    const [eventsEndDate, setEventsEndDate] = useState(undefined);
    const [eventsPage, setEventsPage] = useState(1);
    const EVENTS_PAGE_SIZE = 20;
    const [selectedEventIds, setSelectedEventIds] = useState([]);

    // Controle de Modais - Aba Eventos
    const [isReleaseFromEventsModalOpen, setIsReleaseFromEventsModalOpen] = useState(false);
    const [viewEventDetailsId, setViewEventDetailsId] = useState(null); // ID da HU para ver o prontuário
    const [preloadedEventToView, setPreloadedEventToView] = useState(null);

    // ==========================================
    // DADOS MESTRES (DEPOSITANTES E ENDPOINTS)
    // ==========================================
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    // FETCH: ABA 1 (ESTOQUE)
    const getStockQualityParam = () => {
        if (stockQuality === 'ALL' || stockQuality === 'BLOCKED_ONLY') return undefined;
        return stockQuality;
    };

    const { data: stockResponse, isLoading: isStockLoading, isFetching: isStockFetching } = useGetApiInventoryHandlingUnits({
        Lpn: stockLpn,
        Page: stockPage,
        PageSize: STOCK_PAGE_SIZE,
        ...(stockCustomer !== 'ALL' && { CustomerId: stockCustomer }),
        ...(getStockQualityParam() && { QualityStatus: getStockQualityParam() })
    });

    const rawStockHus = stockResponse?.items || (Array.isArray(stockResponse) ? stockResponse : []);
    const stockHus = stockQuality === 'BLOCKED_ONLY'
        ? rawStockHus.filter(h => h.qualityStatus !== 'Available')
        : rawStockHus;
    const stockTotalCount = stockResponse?.totalCount || 0;
    const stockTotalPages = Math.ceil(stockTotalCount / STOCK_PAGE_SIZE);
    const selectedStockHusObj = stockHus.filter(h => selectedStockHuIds.includes(h.id));

    // FETCH: ABA 2 (PRONTUÁRIOS - QUALITY EVENTS)
    const { data: eventsResponse, isLoading: isEventsLoading, isFetching: isEventsFetching, refetch: refetchEvents } = useQuery({
        queryKey: ['qualityEvents', eventsPage, eventsCustomer, eventsStatus, eventsSearch, eventsStartDate, eventsEndDate],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append('Page', eventsPage);
            params.append('PageSize', EVENTS_PAGE_SIZE);
            if (eventsCustomer !== 'ALL') params.append('CustomerId', eventsCustomer);
            if (eventsStatus === 'OPEN_ONLY') params.append('IsResolved', 'false');
            if (eventsStatus === 'RESOLVED_ONLY') params.append('IsResolved', 'true');
            if (eventsSearch.trim()) params.append('Search', eventsSearch.trim());

            const pad = (n) => String(n).padStart(2, '0');
            if (eventsStartDate instanceof Date && !isNaN(eventsStartDate.getTime())) {
                params.append('StartDate', `${eventsStartDate.getFullYear()}-${pad(eventsStartDate.getMonth() + 1)}-${pad(eventsStartDate.getDate())}`);
            }
            if (eventsEndDate instanceof Date && !isNaN(eventsEndDate.getTime())) {
                params.append('EndDate', `${eventsEndDate.getFullYear()}-${pad(eventsEndDate.getMonth() + 1)}-${pad(eventsEndDate.getDate())}`);
            }

            return await customInstance({ url: `/api/quality/events?${params.toString()}`, method: 'GET' });
        }
    });

    const eventsList = eventsResponse?.items || [];
    const eventsMetrics = eventsResponse || {};
    const selectedEventsObj = eventsList.filter(e => selectedEventIds.includes(e.id));

    // ==========================================
    // AÇÕES DE SELEÇÃO: ABA ESTOQUE
    // ==========================================
    const toggleSelectAllStock = (checked) => {
        setSelectedStockHuIds(checked ? stockHus.map(h => h.id) : []);
    };

    const toggleSelectStockHu = (id, checked) => {
        setSelectedStockHuIds(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
    };

    const openStockHoldModal = (statusValue) => {
        if (selectedStockHuIds.length === 0) return toast.warning('Selecione HUs para bloquear.');
        setHoldTargetStatus(statusValue);
        setIsHoldModalOpen(true);
    };

    const handleStockRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
        refetchEvents();
        setSelectedStockHuIds([]);
    };

    // ==========================================
    // AÇÕES DE SELEÇÃO: ABA EVENTOS
    // ==========================================
    const toggleSelectAllEvents = (checked) => {
        const resolvable = eventsList.filter(e => !e.isResolved).map(e => e.id);
        setSelectedEventIds(checked ? resolvable : []);
    };

    const toggleSelectEvent = (id, checked) => {
        setSelectedEventIds(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
    };

    const handleEventsRefresh = () => {
        refetchEvents();
        queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
        setSelectedEventIds([]);
    };

    const openProntuarioDetalhado = (ev) => {
        setPreloadedEventToView(ev);
        setViewEventDetailsId(ev.handlingUnitId);
    };

    // RENDERIZAÇÃO DE STATUS
    const renderQualityBadge = (status) => {
        switch (status) {
            case 'Available':
                return <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">Livre</Badge>;
            case 'Quarantine':
                return <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">Quarentena</Badge>;
            case 'Damaged':
                return <Badge className="bg-rose-50 text-rose-800 border-rose-200 text-[10px]">Avaria</Badge>;
            case 'Virtual_Shortage':
                return <Badge className="bg-purple-50 text-purple-800 border-purple-200 text-[10px]">Falta Virtual</Badge>;
            default:
                return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
        }
    };

    return (
        <div className="flex flex-col space-y-5 h-full">
            {/* CABEÇALHO GLOBAL */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <ShieldAlert className="text-amber-600" size={26} /> Inspeção & Controle de Qualidade
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gerencie avarias, quarentenas, prontuários fotográficos e liberações técnicas de mercadorias.
                    </p>
                </div>
            </div>

            {/* NAVEGAÇÃO DE ABAS */}
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300">
                <div className="bg-white border border-slate-200/60 rounded-xl p-1 w-fit shadow-xs shrink-0 flex items-center justify-between">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="estoque" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-semibold">
                            <PackageSearch className="w-4 h-4 mr-2" /> Estoque & Bloqueios Rápidos
                        </TabsTrigger>
                        <TabsTrigger value="eventos" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-semibold">
                            <ClipboardList className="w-4 h-4 mr-2" /> Prontuários, Fotos & Liberação
                        </TabsTrigger>
                        <TabsTrigger value="motivos" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-semibold">
                            <Tag className="w-4 h-4 mr-2" /> Motivos Padronizados
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 mt-4 relative min-h-0">

                    {/* ============================================================== */}
                    {/* ABA 1: ESTOQUE E BLOQUEIOS RÁPIDOS */}
                    {/* ============================================================== */}
                    {currentTab === 'estoque' && (
                        <div className="h-full flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* KPI RESUMO DE ESTOQUE (Baseado no cache geral da página) */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
                                <Card className="bg-white border-slate-200 shadow-sm">
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Livre (Total)</p>
                                            <p className="text-xl font-bold font-mono text-emerald-700 mt-0.5">Livre</p>
                                        </div>
                                        <ShieldCheck size={24} className="text-emerald-200" />
                                    </CardContent>
                                </Card>
                                <Card className="bg-white border-slate-200 shadow-sm">
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quarentena / Retenção</p>
                                            <p className="text-xl font-bold font-mono text-amber-700 mt-0.5">{eventsMetrics.quarantineHusCount || 0}</p>
                                        </div>
                                        <Lock size={24} className="text-amber-200" />
                                    </CardContent>
                                </Card>
                                <Card className="bg-white border-slate-200 shadow-sm">
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avaria Física</p>
                                            <p className="text-xl font-bold font-mono text-rose-700 mt-0.5">{eventsMetrics.damagedHusCount || 0}</p>
                                        </div>
                                        <AlertTriangle size={24} className="text-rose-200" />
                                    </CardContent>
                                </Card>
                                <Card className="bg-white border-slate-200 shadow-sm">
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ocorrências Abertas</p>
                                            <p className="text-xl font-bold font-mono text-blue-700 mt-0.5">{eventsMetrics.openEventsCount || 0}</p>
                                        </div>
                                        <ClipboardList size={24} className="text-blue-200" />
                                    </CardContent>
                                </Card>
                            </div>

                            {/* BARRA DE FERRAMENTAS DO ESTOQUE */}
                            <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs shrink-0 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-3 flex-1">
                                    <div className="relative flex-1 min-w-[200px]">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder="Buscar LPN..."
                                            value={stockLpn}
                                            onChange={(e) => { setStockLpn(e.target.value); setStockPage(1); }}
                                            className="pl-9 bg-slate-50 border-slate-200 h-9 text-xs"
                                        />
                                    </div>
                                    <div className="w-[180px]">
                                        <Select value={stockCustomer} onValueChange={(v) => { setStockCustomer(v); setStockPage(1); }}>
                                            <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-xs">
                                                <SelectValue placeholder="Depositante" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">Todos Depositantes</SelectItem>
                                                {customers.map(c => (
                                                    <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="w-[180px]">
                                        <Select value={stockQuality} onValueChange={(v) => { setStockQuality(v); setStockPage(1); }}>
                                            <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-xs">
                                                <SelectValue placeholder="Filtro de Qualidade" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="BLOCKED_ONLY">Apenas Retidos</SelectItem>
                                                <SelectItem value="ALL">Todos os Status</SelectItem>
                                                <SelectItem value="Quarantine">Quarentena</SelectItem>
                                                <SelectItem value="Damaged">Avariado</SelectItem>
                                                <SelectItem value="Virtual_Shortage">Falta Virtual</SelectItem>
                                                <SelectItem value="Available">Livre / Liberado</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={handleStockRefresh} className="h-9 text-slate-500">
                                        <RefreshCw size={14} className={`mr-1.5 ${isStockFetching ? 'animate-spin' : ''}`} /> Atualizar
                                    </Button>
                                </div>

                                {/* AÇÕES EM LOTE NO ESTOQUE */}
                                <div className="flex items-center gap-2">
                                    {selectedStockHuIds.length === 0 ? (
                                        <Button
                                            onClick={() => setIsBulkHoldModalOpen(true)}
                                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-9 text-xs shadow-2xs"
                                        >
                                            <ShieldAlert size={14} className="mr-1.5" /> Bloqueio em Massa (Pesquisa)
                                        </Button>
                                    ) : (
                                        <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                                            <Badge className="bg-slate-900 text-white px-3 h-9 flex items-center rounded-md font-bold text-xs">
                                                {selectedStockHuIds.length} selecionado(s)
                                            </Badge>
                                            <Button onClick={() => setIsReleaseFromStockModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 text-xs">
                                                <ShieldCheck size={14} className="mr-1.5" /> Liberar Lote
                                            </Button>
                                            <Button onClick={() => openStockHoldModal('2')} className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-9 text-xs">
                                                <Lock size={14} className="mr-1.5" /> Reter (Quarentena)
                                            </Button>
                                            <Button onClick={() => openStockHoldModal('3')} className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-9 text-xs">
                                                <AlertTriangle size={14} className="mr-1.5" /> Reter (Avaria)
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* TABELA DA ABA 1 */}
                            <div className="flex-1 bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
                                <div className="flex-1 overflow-auto">
                                    <Table>
                                        <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                                            <TableRow>
                                                <TableHead className="w-12 text-center">
                                                    <Checkbox
                                                        checked={stockHus.length > 0 && selectedStockHuIds.length === stockHus.length}
                                                        onCheckedChange={toggleSelectAllStock}
                                                    />
                                                </TableHead>
                                                <TableHead>LPN / Volume</TableHead>
                                                <TableHead>Depositante / SKU</TableHead>
                                                <TableHead>Endereço</TableHead>
                                                <TableHead className="text-right">Qtd Física</TableHead>
                                                <TableHead>Status de Qualidade</TableHead>
                                                <TableHead className="text-right">Ação Rápida</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isStockLoading ? (
                                                <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-rose-600 mx-auto" /></TableCell></TableRow>
                                            ) : stockHus.length === 0 ? (
                                                <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-500 text-xs italic">Nenhum palete/volume encontrado com os filtros selecionados.</TableCell></TableRow>
                                            ) : stockHus.map((h) => {
                                                const isSelected = selectedStockHuIds.includes(h.id);
                                                const isBlocked = h.qualityStatus !== 'Available';
                                                return (
                                                    <TableRow key={h.id} className={`hover:bg-slate-50/60 transition-colors text-xs ${isSelected ? 'bg-amber-50/40' : ''}`}>
                                                        <TableCell className="text-center">
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onCheckedChange={(checked) => toggleSelectStockHu(h.id, checked)}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <Layers size={14} className="text-slate-400" />
                                                                <span className="font-bold font-mono text-slate-900 text-[13px]">{h.lpn}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="font-semibold text-slate-800 block">{h.productSku}</span>
                                                            <span className="text-[10px] text-slate-500 truncate block max-w-[200px]" title={h.customerName}>{h.customerName}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="bg-slate-50 font-mono text-slate-700 gap-1 text-[10px]">
                                                                <MapPin size={11} className={isBlocked ? "text-rose-600" : "text-blue-600"} />
                                                                {h.locationPath || 'TRÂNSITO'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono font-bold text-slate-800">
                                                            {Number(h.currentQuantity).toLocaleString('pt-BR')} {h.unit}
                                                        </TableCell>
                                                        <TableCell>
                                                            {renderQualityBadge(h.qualityStatus)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => openProntuarioDetalhado({ handlingUnitId: h.id, lpn: h.lpn, productSku: h.productSku })}
                                                                className="h-7 text-[10px] border-slate-200 text-slate-700 bg-white"
                                                            >
                                                                Ver Prontuário
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                                {stockTotalCount > 0 && (
                                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
                                        <span>Mostrando {(stockPage - 1) * STOCK_PAGE_SIZE + 1} a {Math.min(stockPage * STOCK_PAGE_SIZE, stockTotalCount)} de {stockTotalCount} HUs</span>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => setStockPage(p => Math.max(1, p - 1))} disabled={stockPage === 1} className="h-7 text-xs bg-white">Anterior</Button>
                                            <Button variant="outline" size="sm" onClick={() => setStockPage(p => Math.min(stockTotalPages, p + 1))} disabled={stockPage === stockTotalPages || stockTotalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ============================================================== */}
                    {/* ABA 2: PRONTUÁRIOS, LAUDOS E FOTOS (QUALITY EVENTS) */}
                    {/* ============================================================== */}
                    {currentTab === 'eventos' && (
                        <div className="h-full flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">

                            <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs shrink-0 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-3 flex-1">
                                    <div className="w-[160px]">
                                        <Select value={eventsStatus} onValueChange={(v) => { setEventsStatus(v); setEventsPage(1); }}>
                                            <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="OPEN_ONLY">Somente em Aberto</SelectItem>
                                                <SelectItem value="ALL">Todo Histórico</SelectItem>
                                                <SelectItem value="RESOLVED_ONLY">Já Encerrados (Liberados)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="relative flex-1 min-w-[200px]">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder="Buscar LPN, SKU, motivo, laudo..."
                                            value={eventsSearch}
                                            onChange={(e) => { setEventsSearch(e.target.value); setEventsPage(1); }}
                                            className="pl-9 bg-slate-50 border-slate-200 h-9 text-xs"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <DatePicker date={eventsStartDate} setDate={(d) => { setEventsStartDate(d); setEventsPage(1); }} placeholder="Data Inicial" />
                                        <DatePicker date={eventsEndDate} setDate={(d) => { setEventsEndDate(d); setEventsPage(1); }} placeholder="Data Final" />
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={handleEventsRefresh} className="h-9 text-slate-500">
                                        <RefreshCw size={14} className={`mr-1.5 ${isEventsFetching ? 'animate-spin' : ''}`} /> Atualizar
                                    </Button>
                                </div>

                                <div className="flex items-center gap-2">
                                    {selectedEventIds.length > 0 && (
                                        <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                                            <Badge className="bg-slate-900 text-white px-3 h-9 flex items-center rounded-md font-bold text-xs">
                                                {selectedEventIds.length} ocorrência(s)
                                            </Badge>
                                            <Button onClick={() => setIsReleaseFromEventsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 text-xs shadow-2xs">
                                                <ShieldCheck size={14} className="mr-1.5" /> Liberar Ocorrências (Laudo em Lote)
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
                                <div className="flex-1 overflow-auto">
                                    <Table>
                                        <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                                            <TableRow>
                                                <TableHead className="w-10 text-center">
                                                    <Checkbox
                                                        checked={eventsList.length > 0 && selectedEventIds.length === eventsList.filter(e => !e.isResolved).length && eventsList.filter(e => !e.isResolved).length > 0}
                                                        onCheckedChange={toggleSelectAllEvents}
                                                    />
                                                </TableHead>
                                                <TableHead className="w-14 text-center">Fotos</TableHead>
                                                <TableHead>LPN / Produto</TableHead>
                                                <TableHead>Data Bloqueio</TableHead>
                                                <TableHead>Motivo Retenção</TableHead>
                                                <TableHead>Duração</TableHead>
                                                <TableHead>Status / Liberação</TableHead>
                                                <TableHead className="text-right">Ação</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isEventsLoading ? (
                                                <TableRow><TableCell colSpan={8} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                                            ) : eventsList.length === 0 ? (
                                                <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500 text-xs italic">Nenhuma ocorrência ou prontuário atende aos filtros.</TableCell></TableRow>
                                            ) : eventsList.map((ev) => {
                                                const isSelected = selectedEventIds.includes(ev.id);
                                                return (
                                                    <TableRow key={ev.id} className={`hover:bg-slate-50/60 transition-colors text-xs ${isSelected ? 'bg-emerald-50/40' : ''}`}>
                                                        <TableCell className="text-center">
                                                            {!ev.isResolved && (
                                                                <Checkbox
                                                                    checked={isSelected}
                                                                    onCheckedChange={(checked) => toggleSelectEvent(ev.id, checked)}
                                                                />
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {ev.images?.length > 0 ? (
                                                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-mono font-bold w-7 justify-center p-0.5" title={`${ev.images.length} fotos anexadas`}>
                                                                    {ev.images.length}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-slate-300">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="font-bold font-mono text-slate-900 block">{ev.lpn}</span>
                                                            <span className="text-[10px] font-semibold text-slate-600">{ev.productSku}</span>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-[11px] text-slate-700">
                                                            {formatDate(ev.createdAt)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="font-semibold text-rose-700 block">{ev.holdReasonCode}</span>
                                                            <span className="text-[10px] text-slate-500 block max-w-[200px] truncate" title={ev.holdNotes}>{ev.holdNotes}</span>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-[11px] text-slate-500">
                                                            {ev.resolvedAt ? (
                                                                Math.round((new Date(ev.resolvedAt) - new Date(ev.createdAt)) / (1000 * 60 * 60)) + ' h'
                                                            ) : (
                                                                Math.round((new Date() - new Date(ev.createdAt)) / (1000 * 60 * 60)) + ' h (ativo)'
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {ev.isResolved ? (
                                                                <div className="flex flex-col">
                                                                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] w-fit mb-0.5">Liberado</Badge>
                                                                    <span className="text-[9px] text-slate-500">Por {ev.releaseReasonCode}</span>
                                                                </div>
                                                            ) : (
                                                                <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">Bloqueado</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => openProntuarioDetalhado(ev)}
                                                                className="h-7 text-[10px] border-slate-200 text-slate-700 bg-white"
                                                            >
                                                                Ver Prontuário Completo
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                                {eventsMetrics.totalCount > 0 && (
                                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
                                        <span>Mostrando {(eventsPage - 1) * EVENTS_PAGE_SIZE + 1} a {Math.min(eventsPage * EVENTS_PAGE_SIZE, eventsMetrics.totalCount)} de {eventsMetrics.totalCount} ocorrências</span>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => setEventsPage(p => Math.max(1, p - 1))} disabled={eventsPage === 1} className="h-7 text-xs bg-white">Anterior</Button>
                                            <Button variant="outline" size="sm" onClick={() => setEventsPage(p => Math.min(Math.ceil(eventsMetrics.totalCount / EVENTS_PAGE_SIZE), p + 1))} disabled={eventsPage === Math.ceil(eventsMetrics.totalCount / EVENTS_PAGE_SIZE) || eventsMetrics.totalCount === 0} className="h-7 text-xs bg-white">Próxima</Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ============================================================== */}
                    {/* ABA 3: MOTIVOS PADRONIZADOS */}
                    {/* ============================================================== */}
                    {currentTab === 'motivos' && (
                        <div className="h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <QualityReasonsTab onReasonsChanged={handleStockRefresh} />
                        </div>
                    )}
                </div>
            </Tabs>

            {/* MODAIS DA PÁGINA */}

            {/* Modal de Bloqueio Rápido via Checkbox na Tabela de Estoque */}
            <RegisterHoldModal
                open={isHoldModalOpen}
                onOpenChange={setIsHoldModalOpen}
                hus={selectedStockHusObj}
                defaultStatus={holdTargetStatus}
                onSuccess={handleStockRefresh}
            />

            {/* Modal de Bloqueio em Massa via Bipagem / Consulta dedicada */}
            <BulkHoldModal
                open={isBulkHoldModalOpen}
                onOpenChange={setIsBulkHoldModalOpen}
                onSuccess={handleStockRefresh}
            />

            {/* Modal de Liberação Lote via Estoque */}
            <ReleaseQualityModal
                open={isReleaseFromStockModalOpen}
                onOpenChange={setIsReleaseFromStockModalOpen}
                hus={selectedStockHusObj}
                onSuccess={handleStockRefresh}
            />

            {/* Modal de Liberação Lote via Ocorrências */}
            <ReleaseQualityModal
                open={isReleaseFromEventsModalOpen}
                onOpenChange={setIsReleaseFromEventsModalOpen}
                events={selectedEventsObj}
                onSuccess={handleEventsRefresh}
            />

            {/* Modal de Visualização do Prontuário de Qualidade da HU (Eventos + Fotos) */}
            <QualityEventDetailsModal
                open={Boolean(viewEventDetailsId)}
                onOpenChange={(v) => !v && setViewEventDetailsId(null)}
                handlingUnitId={viewEventDetailsId}
                initialEvent={preloadedEventToView}
                onRequestRelease={(args) => {
                    // Prepara a HUs e os eventos abertos passados pelo Prontuário para abrir o Modal de Liberação
                    setSelectedEventIds(args.events.map(e => e.id));
                    setIsReleaseFromEventsModalOpen(true);
                }}
            />
        </div>
    );
}