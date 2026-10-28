import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiInventoryHandlingUnits } from '@/api/generated/inventory/inventory';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { useGetApiTopologyLocationsStorage } from '@/api/generated/topology/topology';
import { customInstance } from '@/api/orval-mutator';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
    Search, Loader2, Download, Layers, MapPin, ShieldAlert,
    AlertTriangle, Printer, CheckCircle2, FileText,
    Undo2, X, SlidersHorizontal, Columns, ChevronDown, ChevronUp, RotateCcw,
    MoreHorizontal, Merge, Split, Pencil
} from 'lucide-react';

import { downloadBackendCsv } from '@/lib/exportCsv';
import RegisterHoldModal from '@/pages/Qualidade/RegisterHoldModal';
import PrintHuModal from '@/pages/Inbound/PrintHuModal';
import AgruparHuModal from '../Modals/AgruparHuModal';
import TransbordoHuModal from '../Modals/TransbordoHuModal';
import EditarHuModal from '../Modals/EditarHuModal';

const formatCivilDate = (dateVal) => {
    if (!dateVal) return '-';
    if (typeof dateVal === 'string') {
        const clean = dateVal.split('T')[0];
        const parts = clean.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

const COLUMN_DEFINITIONS = [
    { id: 'lpn', label: 'LPN / Unidade' },
    { id: 'sku', label: 'Depositante / SKU' },
    { id: 'createdAt', label: 'Data Entrada' },
    { id: 'consumedAt', label: 'Data Finalização' },
    { id: 'nfe', label: 'NF-e / Série' },
    { id: 'location', label: 'Endereço Atual' },
    { id: 'batch', label: 'Lote / Validade' },
    { id: 'quantity', label: 'Qtd Atual' },
    { id: 'unitValue', label: 'Valor Unit.' },
    { id: 'totalValue', label: 'Valor Total HU' },
    { id: 'quality', label: 'Qualidade' },
    { id: 'status', label: 'Status HU' },
];

function SearchableLocationSelect({ value, onChange, locations, placeholder = "Selecione a Posição..." }) {
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
                className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${value && value !== 'ALL' ? 'border-blue-400 font-bold font-mono text-slate-900' : 'border-slate-200 text-slate-500'}`}
            >
                <span className="truncate">{selectedLocation ? selectedLocation.fullPath : placeholder}</span>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                    {value && value !== 'ALL' && (
                        <X size={12} className="text-slate-400 hover:text-rose-600 transition-colors" onClick={(e) => { e.stopPropagation(); onChange('ALL'); }} />
                    )}
                    <Search size={14} className="text-slate-400" />
                </div>
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text" autoFocus placeholder="Filtrar endereço..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                        <div onClick={() => { onChange('ALL'); setIsOpen(false); setSearchTerm(''); }} className="px-2.5 py-1.5 rounded text-xs cursor-pointer hover:bg-slate-100 text-slate-500 italic">Todas as Posições</div>
                        {filteredLocations.map(loc => (
                            <div key={loc.id} onClick={() => { onChange(loc.id); setIsOpen(false); setSearchTerm(''); }} className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between font-mono transition-colors ${value === loc.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'}`}>
                                <span>{loc.fullPath}</span>
                                {value === loc.id && <CheckCircle2 size={12} className="text-blue-600" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SearchableCustomerSelect({ value, onChange, customers, placeholder = "Selecione o Depositante..." }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const selectedCustomer = customers.find(c => c.id === value);
    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return customers.slice(0, 30);
        const term = searchTerm.toLowerCase();
        return customers.filter(c => c.corporateName?.toLowerCase().includes(term) || c.cnpj?.includes(term)).slice(0, 30);
    }, [customers, searchTerm]);

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${value && value !== 'ALL' ? 'border-blue-400 font-bold text-slate-900' : 'border-slate-200 text-slate-500'}`}
            >
                <span className="truncate">{selectedCustomer ? selectedCustomer.corporateName : placeholder}</span>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                    {value && value !== 'ALL' && (
                        <X size={12} className="text-slate-400 hover:text-rose-600 transition-colors" onClick={(e) => { e.stopPropagation(); onChange('ALL'); }} />
                    )}
                    <ChevronDown size={14} className="text-slate-400" />
                </div>
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text" autoFocus placeholder="Buscar por nome ou CNPJ..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500"
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                        <div onClick={() => { onChange('ALL'); setIsOpen(false); setSearchTerm(''); }} className="px-2.5 py-1.5 rounded text-xs cursor-pointer hover:bg-slate-100 text-slate-500 italic">Todos os Depositantes</div>
                        {filteredCustomers.map(cust => (
                            <div key={cust.id} onClick={() => { onChange(cust.id); setIsOpen(false); setSearchTerm(''); }} className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between transition-colors ${value === cust.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'}`}>
                                <div className="flex flex-col"><span className="truncate">{cust.corporateName}</span><span className="text-[10px] text-slate-400 font-mono">CNPJ: {cust.cnpj}</span></div>
                                {value === cust.id && <CheckCircle2 size={12} className="text-blue-600" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function HandlingUnitsTab() {
    const queryClient = useQueryClient();
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    const [visibleColumns, setVisibleColumns] = useState({
        lpn: true, sku: true, createdAt: true, consumedAt: false, nfe: true,
        location: true, batch: true, quantity: true, unitValue: true, totalValue: true, quality: true, status: true
    });

    const [searchLpn, setSearchLpn] = useState('');
    const [searchSku, setSearchSku] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');
    const [searchBatch, setSearchBatch] = useState('');
    const [searchNfe, setSearchNfe] = useState('');
    const [selectedLocation, setSelectedLocation] = useState('ALL');
    const [qualityFilter, setQualityFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [dateRange, setDateRange] = useState(undefined);
    const [appliedFilters, setAppliedFilters] = useState({});

    const [selectedHus, setSelectedHus] = useState([]);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const [husToHold, setHusToHold] = useState(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [husToMove, setHusToMove] = useState([]);
    const [targetLocationId, setTargetLocationId] = useState('');
    const [isMoving, setIsMoving] = useState(false);
    const [locationTypeTab, setLocationTypeTab] = useState('storage');
    const [husToRollback, setHusToRollback] = useState(null);
    const [isRollingBack, setIsRollingBack] = useState(false);

    // Ações Individuais (Popover)
    const [huToMerge, setHuToMerge] = useState(null);
    const [huToSplit, setHuToSplit] = useState(null);
    const [huToEdit, setHuToEdit] = useState(null);
    const [openPopoverId, setOpenPopoverId] = useState(null);

    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);
    const { data: storageLocations = [] } = useGetApiTopologyLocationsStorage();
    const [qualityLocations, setQualityLocations] = useState([]);

    useEffect(() => {
        customInstance({ url: '/api/topology/locations/quality', method: 'GET' })
            .then(res => setQualityLocations(Array.isArray(res) ? res : []))
            .catch(() => setQualityLocations([]));
    }, []);

    const allTopologyLocations = useMemo(() => [...storageLocations, ...qualityLocations], [storageLocations, qualityLocations]);

    const activeAdvancedCount = useMemo(() => {
        let count = 0;
        if (searchBatch.trim()) count++;
        if (searchNfe.trim()) count++;
        if (selectedLocation !== 'ALL') count++;
        if (qualityFilter !== 'ALL') count++;
        if (statusFilter !== 'ALL') count++;
        if (dateRange?.from) count++;
        return count;
    }, [searchBatch, searchNfe, selectedLocation, qualityFilter, statusFilter, dateRange]);

    const handleSearchSubmit = (e) => {
        if (e) e.preventDefault();
        setPage(1);
        let startString = undefined;
        let endString = undefined;
        if (dateRange?.from) {
            const fromDate = new Date(dateRange.from);
            fromDate.setHours(0, 0, 0, 0);
            startString = fromDate.toISOString();
            const toDate = new Date(dateRange.to || dateRange.from);
            toDate.setHours(23, 59, 59, 999);
            endString = toDate.toISOString();
        }
        setAppliedFilters({
            ...(searchLpn.trim() && { Lpn: searchLpn.trim() }),
            ...(searchSku.trim() && { Sku: searchSku.trim() }),
            ...(searchBatch.trim() && { Batch: searchBatch.trim() }),
            ...(searchNfe.trim() && { NfeNumber: searchNfe.trim() }),
            ...(selectedCustomer !== 'ALL' && { CustomerId: selectedCustomer }),
            ...(selectedLocation !== 'ALL' && { LocationId: selectedLocation }),
            ...(statusFilter !== 'ALL' && { Status: Number(statusFilter) }),
            ...(qualityFilter !== 'ALL' && { QualityStatus: Number(qualityFilter) }),
            ...(startString && { StartDate: startString }),
            ...(endString && { EndDate: endString })
        });
    };

    const handleClearFilters = () => {
        setSearchLpn(''); setSearchSku(''); setSelectedCustomer('ALL');
        setSearchBatch(''); setSearchNfe(''); setSelectedLocation('ALL');
        setQualityFilter('ALL'); setStatusFilter('ALL'); setDateRange(undefined);
        setPage(1); setAppliedFilters({});
    };

    const queryParams = { Page: page, PageSize: PAGE_SIZE, ...appliedFilters };
    const { data: apiResponse, isLoading, isFetching, refetch } = useGetApiInventoryHandlingUnits(queryParams);
    const hus = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const toggleSelectAll = () => {
        if (selectedHus.length === hus.length) setSelectedHus([]);
        else setSelectedHus(hus);
    };

    const toggleSelectHu = (hu) => {
        setSelectedHus(prev => prev.some(h => h.id === hu.id) ? prev.filter(h => h.id !== hu.id) : [...prev, hu]);
    };

    const toggleColumn = (columnId) => {
        setVisibleColumns(prev => ({ ...prev, [columnId]: !prev[columnId] }));
    };

    const handleOpenMoveModal = (targetHus) => {
        setHusToMove(targetHus);
        setTargetLocationId('');
        const hasQualityRestriction = targetHus.some(h => String(h.qualityStatus) !== '1' && String(h.qualityStatus) !== 'Available');
        setLocationTypeTab(hasQualityRestriction ? 'quality' : 'storage');
        setIsMoveModalOpen(true);
    };

    const handleExecuteMove = async () => {
        if (!targetLocationId || husToMove.length === 0) return toast.warning('Selecione o endereço de destino.');
        setIsMoving(true);
        try {
            const huIds = husToMove.map(h => h.id);
            const res = await customInstance({
                url: '/api/inventory/handling-units/move',
                method: 'POST',
                data: { handlingUnitIds: huIds, destinationLocationId: targetLocationId }
            });
            toast.success(res?.message || 'Movimentação concluída!');
            await refetch();
            setSelectedHus(prev => prev.filter(h => !huIds.includes(h.id)));
            setIsMoveModalOpen(false);
            setHusToMove([]);
            setTargetLocationId('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao movimentar HUs.');
        } finally {
            setIsMoving(false);
        }
    };

    const handleConfirmRollback = async () => {
        if (!husToRollback || husToRollback.length === 0) return;
        setIsRollingBack(true);
        try {
            const huIds = husToRollback.map(h => h.id);
            await customInstance({
                url: '/api/inbound/receive/hus/rollback',
                method: 'POST',
                data: { handlingUnitIds: huIds }
            });
            toast.success(`${huIds.length} HU(s) estornada(s) com sucesso!`);
            await refetch();
            queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
            setSelectedHus(prev => prev.filter(h => !huIds.includes(h.id)));
            setHusToRollback(null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao realizar o estorno das HUs.');
        } finally {
            setIsRollingBack(false);
        }
    };

    const handleExport = () => downloadBackendCsv('/api/inventory/handling-units/export', appliedFilters, 'unidades_manuseio_hus');

    const renderQualityBadge = (qualityStatus) => {
        const statusStr = String(qualityStatus);
        if (statusStr === '1' || statusStr === 'Available') return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Liberado</Badge>;
        if (statusStr === '2' || statusStr === 'Quarantine') return <Badge className="bg-amber-100 text-amber-800 border-amber-200 flex items-center gap-1"><ShieldAlert size={12} /> Quarentena</Badge>;
        if (statusStr === '3' || statusStr === 'Damaged') return <Badge className="bg-rose-100 text-rose-800 border-rose-200 flex items-center gap-1"><AlertTriangle size={12} /> Avariado</Badge>;
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Divergência / Falta</Badge>;
    };

    const renderHuStatusBadge = (status) => {
        const statusStr = String(status);
        switch (statusStr) {
            case 'Received': case '2': return <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-mono text-[10px] font-bold">Na Doca</Badge>;
            case 'Stored': case '3': return <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 font-mono text-[10px]">Armazenado</Badge>;
            case 'Picking': case '4': case 'Staged': case '5': return <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-mono text-[10px]">Em Expedição</Badge>;
            case 'Shipped': case '6': return <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 font-mono text-[10px]">Expedido</Badge>;
            case 'Consumed': case '7': return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 font-mono text-[10px]">Consumido</Badge>;
            default: return <Badge variant="outline" className="font-mono text-[10px]">{statusStr}</Badge>;
        }
    };

    const isSelectedRestricted = selectedHus.some(h => String(h.qualityStatus) !== '1' && String(h.qualityStatus) !== 'Available');

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex flex-col overflow-hidden h-full">
            <form onSubmit={handleSearchSubmit} className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Button type="button" variant={showAdvancedFilters ? "secondary" : "outline"} onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className="text-xs font-semibold h-9 bg-white border-slate-200">
                            <SlidersHorizontal size={14} className="mr-1.5 text-slate-600" /> Filtros Avançados
                            {activeAdvancedCount > 0 && <Badge className="ml-1.5 bg-blue-600 text-white font-mono text-[10px] h-4 px-1 rounded-full">{activeAdvancedCount}</Badge>}
                            {showAdvancedFilters ? <ChevronUp size={14} className="ml-1 text-slate-400" /> : <ChevronDown size={14} className="ml-1 text-slate-400" />}
                        </Button>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button type="button" variant="outline" className="text-xs font-semibold h-9 bg-white border-slate-200"><Columns size={14} className="mr-1.5 text-slate-600" />Colunas</Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-3 bg-white border border-slate-200 shadow-xl rounded-xl space-y-2">
                                <span className="text-xs font-bold text-slate-800 block border-b pb-1">Exibir Colunas</span>
                                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                    {COLUMN_DEFINITIONS.map(col => (
                                        <label key={col.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 p-1 rounded">
                                            <Checkbox checked={visibleColumns[col.id]} onCheckedChange={() => toggleColumn(col.id)} />
                                            <span>{col.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button type="button" onClick={() => setHusToHold(selectedHus)} disabled={selectedHus.length === 0} variant="outline" className="border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 text-xs font-semibold h-9">
                            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" /> Avaria ({selectedHus.length})
                        </Button>
                        <Button type="button" onClick={() => handleOpenMoveModal(selectedHus)} disabled={selectedHus.length === 0} variant="outline" className="text-xs font-semibold h-9">
                            <MapPin className="w-3.5 h-3.5 mr-1 text-blue-600" /> Mover ({selectedHus.length})
                        </Button>
                        <Button type="button" onClick={() => setHusToRollback(selectedHus)} disabled={selectedHus.length === 0} variant="outline" className="border-rose-300 text-rose-800 bg-rose-50 hover:bg-rose-100 text-xs font-semibold h-9">
                            <Undo2 className="w-3.5 h-3.5 mr-1 text-rose-600" /> Estornar ({selectedHus.length})
                        </Button>
                        <Button type="button" onClick={() => setIsPrintModalOpen(true)} disabled={selectedHus.length === 0} className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-9">
                            <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir ({selectedHus.length})
                        </Button>
                        <Button type="button" onClick={handleExport} variant="outline" size="sm" disabled={totalCount === 0} className="bg-white border-slate-200 text-slate-700 text-xs h-9">
                            <Download className="mr-1 h-3.5 w-3.5" /> CSV
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1 items-end">
                    <div className="sm:col-span-3 space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700 uppercase">Código LPN / HU</Label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input placeholder="Digite o LPN..." value={searchLpn} onChange={(e) => setSearchLpn(e.target.value)} className="pl-8 bg-white text-xs h-9 font-mono border-slate-200" />
                        </div>
                    </div>
                    <div className="sm:col-span-4 space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700 uppercase">SKU / Descrição do Produto</Label>
                        <Input placeholder="Digite o código SKU..." value={searchSku} onChange={(e) => setSearchSku(e.target.value)} className="bg-white text-xs h-9 font-mono border-slate-200" />
                    </div>
                    <div className="sm:col-span-3 space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700 uppercase">Depositante</Label>
                        <SearchableCustomerSelect value={selectedCustomer} onChange={(cust) => setSelectedCustomer(cust)} customers={customers} placeholder="Todos os Depositantes" />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-1.5">
                        <Button type="submit" disabled={isFetching} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 flex-1 shadow-2xs">
                            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search size={14} className="mr-1.5" /> Pesquisar</>}
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={handleClearFilters} title="Limpar Filtros" className="h-9 w-9 text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"><RotateCcw size={14} /></Button>
                    </div>
                </div>

                {showAdvancedFilters && (
                    <div className="pt-3 border-t border-slate-200/80 animate-in fade-in duration-200 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-3 items-end">
                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">Lote Físico</Label>
                                <Input placeholder="Digite o lote..." value={searchBatch} onChange={(e) => setSearchBatch(e.target.value)} className="bg-white text-xs h-9 font-mono border-slate-200" />
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">NF-e / Chave de Acesso</Label>
                                <div className="relative">
                                    <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                    <Input placeholder="Número da NF-e..." value={searchNfe} onChange={(e) => setSearchNfe(e.target.value)} className="pl-8 bg-white text-xs h-9 font-mono border-slate-200" />
                                </div>
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">Endereço / Posição</Label>
                                <SearchableLocationSelect value={selectedLocation} onChange={(locId) => setSelectedLocation(locId)} locations={allTopologyLocations} placeholder="Selecione a Posição..." />
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">Qualidade</Label>
                                <Select value={qualityFilter} onValueChange={setQualityFilter}>
                                    <SelectTrigger className="bg-white h-9 text-xs border-slate-200"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Todas Qualidades</SelectItem>
                                        <SelectItem value="1">Liberado</SelectItem>
                                        <SelectItem value="2">Quarentena</SelectItem>
                                        <SelectItem value="3">Avariado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">Status HU</Label>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="bg-white h-9 text-xs border-slate-200"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Todos os Status</SelectItem>
                                        <SelectItem value="2">Na Doca</SelectItem>
                                        <SelectItem value="3">Armazenado</SelectItem>
                                        <SelectItem value="6">Expedido</SelectItem>
                                        <SelectItem value="7">Consumido</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">Período Entrada</Label>
                                <DateRangePicker date={dateRange} setDate={setDateRange} className="w-full" />
                            </div>
                        </div>
                    </div>
                )}
            </form>

            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow>
                            <TableHead className="w-[40px]"><Checkbox checked={hus.length > 0 && selectedHus.length === hus.length} onCheckedChange={toggleSelectAll} /></TableHead>
                            {visibleColumns.lpn && <TableHead>LPN / Unidade</TableHead>}
                            {visibleColumns.sku && <TableHead>Depositante / SKU</TableHead>}
                            {visibleColumns.createdAt && <TableHead>Data Entrada</TableHead>}
                            {visibleColumns.consumedAt && <TableHead>Data Finalização</TableHead>}
                            {visibleColumns.nfe && <TableHead>NF-e / Série</TableHead>}
                            {visibleColumns.location && <TableHead>Endereço Atual</TableHead>}
                            {visibleColumns.batch && <TableHead>Lote / Validade</TableHead>}
                            {visibleColumns.quantity && <TableHead className="text-right">Qtd Atual</TableHead>}
                            {visibleColumns.unitValue && <TableHead className="text-right">Valor Unit.</TableHead>}
                            {visibleColumns.totalValue && <TableHead className="text-right font-bold text-slate-900">Valor Total HU</TableHead>}
                            {visibleColumns.quality && <TableHead>Qualidade</TableHead>}
                            {visibleColumns.status && <TableHead>Status HU</TableHead>}
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading || isFetching ? (
                            <TableRow><TableCell colSpan={14} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : hus.length === 0 ? (
                            <TableRow><TableCell colSpan={14} className="h-32 text-center text-slate-500">Nenhuma HU encontrada para os filtros aplicados.</TableCell></TableRow>
                        ) : hus.map((h) => {
                            const isSelected = selectedHus.some(x => x.id === h.id);
                            const isQualityRestricted = String(h.qualityStatus) !== 'Available' && String(h.qualityStatus) !== '1';
                            const isPendingAllocation = String(h.status) === 'Received' || String(h.status) === '2';
                            const isConsumedOrShipped = String(h.status) === 'Consumed' || String(h.status) === 'Shipped';
                            const hasSerial = Boolean(h.serialNumber);

                            const unitVal = h.unitValue || 0;
                            const totalVal = h.totalValue ?? (h.currentQuantity * unitVal);

                            return (
                                <TableRow key={h.id} className={isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/50'}>
                                    <TableCell><Checkbox checked={isSelected} onCheckedChange={() => toggleSelectHu(h)} /></TableCell>
                                    {visibleColumns.lpn && (
                                        <TableCell>
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Layers size={16} /></div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold font-mono text-slate-900 text-xs">{h.lpn}</span>
                                                    <span className="text-[10px] font-mono text-purple-700 font-semibold uppercase">{h.packagingTypeCode || 'VOL'}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                    )}
                                    {visibleColumns.sku && (
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-slate-800 text-xs font-mono">{h.productSku}</span>
                                                <span className="text-[10px] text-slate-400">{h.customerName}</span>
                                            </div>
                                        </TableCell>
                                    )}
                                    {visibleColumns.createdAt && (
                                        <TableCell className="text-xs font-mono text-slate-600">
                                            {h.createdAt ? new Date(h.createdAt).toLocaleString('pt-BR') : '-'}
                                        </TableCell>
                                    )}
                                    {visibleColumns.consumedAt && (
                                        <TableCell className="text-xs font-mono text-slate-600">
                                            {h.consumedAt ? <span className="text-rose-700 font-semibold">{new Date(h.consumedAt).toLocaleString('pt-BR')}</span> : <span className="text-slate-400 italic">-</span>}
                                        </TableCell>
                                    )}
                                    {visibleColumns.nfe && (
                                        <TableCell>
                                            {h.nfeNumber ? (
                                                <div className="flex flex-col"><span className="font-mono font-bold text-slate-800 text-xs">NF {h.nfeNumber}</span><span className="text-[10px] text-slate-400 font-mono">Série {h.nfeSeries || '1'}</span></div>
                                            ) : <span className="text-xs text-slate-400 italic">S/N</span>}
                                        </TableCell>
                                    )}
                                    {visibleColumns.location && (
                                        <TableCell>
                                            {h.locationPath ? (
                                                <Badge variant="outline" className="bg-slate-50 font-mono text-slate-700 text-[10px] gap-1"><MapPin size={12} className="text-blue-600" /> {h.locationPath}</Badge>
                                            ) : <span className="text-xs text-slate-400 italic">Em Trânsito / Doca</span>}
                                        </TableCell>
                                    )}
                                    {visibleColumns.batch && (
                                        <TableCell className="text-xs font-mono text-slate-600">
                                            <div>Lote: {h.batch || '-'}</div>
                                            <div>Val: {formatCivilDate(h.expirationDate)}</div>
                                        </TableCell>
                                    )}
                                    {visibleColumns.quantity && (
                                        <TableCell className="text-right font-mono font-bold text-slate-900 text-xs">
                                            {h.currentQuantity?.toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-slate-500">{h.unit || 'UN'}</span>
                                        </TableCell>
                                    )}
                                    {visibleColumns.unitValue && (
                                        <TableCell className="text-right font-mono text-xs text-slate-700">{unitVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                    )}
                                    {visibleColumns.totalValue && (
                                        <TableCell className="text-right font-mono font-bold text-xs text-slate-900 bg-slate-50/50">{totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                    )}
                                    {visibleColumns.quality && <TableCell>{renderQualityBadge(h.qualityStatus)}</TableCell>}
                                    {visibleColumns.status && <TableCell>{renderHuStatusBadge(h.status)}</TableCell>}

                                    <TableCell>
                                        <Popover open={openPopoverId === h.id} onOpenChange={(open) => setOpenPopoverId(open ? h.id : null)}>
                                            <PopoverTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                                                    <MoreHorizontal size={16} />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent align="end" className="w-52 p-1 bg-white border-slate-200 shadow-xl rounded-xl">
                                                <div className="flex flex-col text-xs font-medium text-slate-600">
                                                    {!isQualityRestricted && (
                                                        <button onClick={() => { setHusToHold([h]); setOpenPopoverId(null); }} className="w-full text-left flex items-center gap-2 px-2.5 py-2 hover:bg-amber-50 hover:text-amber-700 rounded-md transition-colors">
                                                            <AlertTriangle size={14} className="text-amber-500" /> Registrar Avaria
                                                        </button>
                                                    )}
                                                    <button onClick={() => { handleOpenMoveModal([h]); setOpenPopoverId(null); }} className="w-full text-left flex items-center gap-2 px-2.5 py-2 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors">
                                                        <MapPin size={14} className="text-blue-500" /> {isPendingAllocation ? "Alocar no Estoque" : "Mover Posição"}
                                                    </button>
                                                    <button onClick={() => { setSelectedHus([h]); setIsPrintModalOpen(true); setOpenPopoverId(null); }} className="w-full text-left flex items-center gap-2 px-2.5 py-2 hover:bg-slate-100 hover:text-slate-900 rounded-md transition-colors">
                                                        <Printer size={14} /> Reimprimir Etiqueta
                                                    </button>
                                                    {!hasSerial && !isConsumedOrShipped && (
                                                        <>
                                                            <button onClick={() => { setHuToMerge(h); setOpenPopoverId(null); }} className="w-full text-left flex items-center gap-2 px-2.5 py-2 hover:bg-slate-100 hover:text-slate-900 rounded-md transition-colors">
                                                                <Merge size={14} className="text-blue-600" /> Agrupar (Merge)
                                                            </button>
                                                            <button onClick={() => { setHuToSplit(h); setOpenPopoverId(null); }} className="w-full text-left flex items-center gap-2 px-2.5 py-2 hover:bg-slate-100 hover:text-slate-900 rounded-md transition-colors">
                                                                <Split size={14} className="text-purple-600" /> Transbordo (Split)
                                                            </button>
                                                        </>
                                                    )}
                                                    <button onClick={() => { setHuToEdit(h); setOpenPopoverId(null); }} className="w-full text-left flex items-center gap-2 px-2.5 py-2 hover:bg-slate-100 hover:text-slate-900 rounded-md transition-colors">
                                                        <Pencil size={14} /> Editar Rastreabilidade
                                                    </button>
                                                    <button onClick={() => { setHusToRollback([h]); setOpenPopoverId(null); }} className="w-full text-left flex items-center gap-2 px-2.5 py-2 hover:bg-rose-50 hover:text-rose-700 rounded-md transition-colors border-t border-slate-100 mt-1 pt-2">
                                                        <Undo2 size={14} className="text-rose-500" /> Estornar Entrada
                                                    </button>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
            {totalCount > 0 && (
                <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0 text-xs text-slate-500">
                    <span>Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} HUs</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                        <span className="text-xs font-mono self-center text-slate-600 px-1">Página {page} de {totalPages || 1}</span>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                    </div>
                </div>
            )}

            {/* MODAIS (IDÊNTICOS À INBOUND HUS) */}
            <Dialog open={isMoveModalOpen} onOpenChange={setIsMoveModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <MapPin className="text-blue-600" size={20} /> Mover no Estoque
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Selecione a posição de destino para {husToMove.length} HU(s).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {isSelectedRestricted ? (
                            <div className="p-3 rounded-lg border bg-rose-50 border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-medium">
                                <ShieldAlert size={18} className="shrink-0 text-rose-600" />
                                <span>Volumes com restrição só podem ser movimentados para posições do tipo <strong>Qualidade</strong>.</span>
                            </div>
                        ) : (
                            <div className="flex border-b border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => { setLocationTypeTab('storage'); setTargetLocationId(''); }}
                                    className={`pb-2 px-3 text-xs font-bold transition-all border-b-2 ${locationTypeTab === 'storage' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    Armazenamento Geral ({storageLocations.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setLocationTypeTab('quality'); setTargetLocationId(''); }}
                                    className={`pb-2 px-3 text-xs font-bold transition-all border-b-2 ${locationTypeTab === 'quality' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    Posições de Qualidade / Retenção ({qualityLocations.length})
                                </button>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700">Endereço Destino *</label>
                            <SearchableLocationSelect
                                value={targetLocationId}
                                onChange={(locId) => setTargetLocationId(locId)}
                                locations={isSelectedRestricted || locationTypeTab === 'quality' ? qualityLocations : storageLocations}
                                placeholder={isSelectedRestricted || locationTypeTab === 'quality' ? "Pesquisar Posição de Qualidade/Avaria..." : "Pesquisar Posição de Armazenamento..."}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMoveModalOpen(false)} disabled={isMoving}>Cancelar</Button>
                        <Button onClick={handleExecuteMove} disabled={!targetLocationId || isMoving} className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                            {isMoving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Confirmar Movimento
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {husToHold && husToHold.length > 0 && (
                <RegisterHoldModal
                    open={!!husToHold && husToHold.length > 0}
                    onOpenChange={(open) => !open && setHusToHold(null)}
                    hus={husToHold}
                    onSuccess={() => { refetch(); setSelectedHus([]); }}
                />
            )}

            {isPrintModalOpen && (
                <PrintHuModal
                    open={isPrintModalOpen}
                    onOpenChange={setIsPrintModalOpen}
                    husToPrint={selectedHus}
                />
            )}

            <AlertDialog open={!!husToRollback && husToRollback.length > 0} onOpenChange={(open) => !open && !isRollingBack && setHusToRollback(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Estornar {husToRollback?.length === 1 ? `HU ${husToRollback[0]?.lpn}` : `${husToRollback?.length} HU(s) selecionadas`}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja estornar a entrada deste(s) volume(s)? A quantidade recebida na NF-e e os saldos em estoque serão reajustados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRollingBack}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmRollback} disabled={isRollingBack} className="bg-rose-600 hover:bg-rose-700 text-white font-semibold">
                            {isRollingBack ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Estorno'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {huToMerge && (
                <AgruparHuModal
                    open={Boolean(huToMerge)}
                    onOpenChange={(open) => !open && setHuToMerge(null)}
                    sourceHu={huToMerge}
                    onSuccess={refetch}
                />
            )}

            {huToSplit && (
                <TransbordoHuModal
                    open={Boolean(huToSplit)}
                    onOpenChange={(open) => !open && setHuToSplit(null)}
                    sourceHu={huToSplit}
                    onSuccess={refetch}
                />
            )}

            {huToEdit && (
                <EditarHuModal
                    open={Boolean(huToEdit)}
                    onOpenChange={(open) => !open && setHuToEdit(null)}
                    hu={huToEdit}
                    onSuccess={refetch}
                />
            )}
        </div>
    );
}