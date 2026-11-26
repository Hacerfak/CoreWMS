import { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import {
    Boxes, Layers, ScrollText, UploadCloud, Search, SlidersHorizontal,
    ChevronDown, ChevronUp, RotateCcw, FileText, X, CheckCircle2, Loader2
} from 'lucide-react';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { useGetApiTopologyLocationsStorage } from '@/api/generated/topology/topology';
import { customInstance } from '@/api/orval-mutator';
import { useHasPermission } from '@/hooks/useHasPermission';
import BalancoTab from './Tabs/BalancoTab';
import HandlingUnitsTab from './Tabs/HandlingUnitsTab';
import KardexTab from './Tabs/KardexTab';
import ImportarLegadoModal from './ImportarLegadoModal';

function SearchableLocationSelect({ value, onChange, locations, placeholder = 'Selecione a Posição...' }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const selectedLocation = locations.find(l => l.id === value);

    const filteredLocations = useMemo(() => {
        if (!searchTerm.trim()) return locations.slice(0, 40);
        const term = searchTerm.trim().toLowerCase();
        return locations.filter(l => l.fullPath?.toLowerCase().includes(term)).slice(0, 40);
    }, [locations, searchTerm]);

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer ${value && value !== 'ALL'
                    ? 'border-blue-400 font-bold font-mono text-slate-900'
                    : 'border-slate-200 text-slate-500'
                    }`}
            >
                <span className="truncate">{selectedLocation ? selectedLocation.fullPath : placeholder}</span>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                    {value && value !== 'ALL' && (
                        <X
                            size={12}
                            className="text-slate-400 hover:text-rose-600 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange('ALL');
                            }}
                        />
                    )}
                    <Search size={14} className="text-slate-400" />
                </div>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Filtrar endereço..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                        <div
                            onClick={() => {
                                onChange('ALL');
                                setIsOpen(false);
                                setSearchTerm('');
                            }}
                            className="px-2.5 py-1.5 rounded text-xs cursor-pointer hover:bg-slate-100 text-slate-500 italic"
                        >
                            Todas as Posições
                        </div>
                        {filteredLocations.map(loc => (
                            <div
                                key={loc.id}
                                onClick={() => {
                                    onChange(loc.id);
                                    setIsOpen(false);
                                    setSearchTerm('');
                                }}
                                className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between font-mono transition-colors ${value === loc.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                    }`}
                            >
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

function SearchableCustomerSelect({ value, onChange, customers, placeholder = 'Selecione o Depositante...' }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const selectedCustomer = customers.find(c => c.id === value);

    const filteredCustomers = useMemo(() => {
        if (!searchTerm.trim()) return customers.slice(0, 30);
        const term = searchTerm.trim().toLowerCase();
        return customers
            .filter(c => c.corporateName?.toLowerCase().includes(term) || c.cnpj?.includes(term))
            .slice(0, 30);
    }, [customers, searchTerm]);

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer ${value && value !== 'ALL'
                    ? 'border-blue-400 font-bold text-slate-900'
                    : 'border-slate-200 text-slate-500'
                    }`}
            >
                <span className="truncate">{selectedCustomer ? selectedCustomer.corporateName : placeholder}</span>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                    {value && value !== 'ALL' && (
                        <X
                            size={12}
                            className="text-slate-400 hover:text-rose-600 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange('ALL');
                            }}
                        />
                    )}
                    <ChevronDown size={14} className="text-slate-400" />
                </div>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Buscar por nome ou CNPJ..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500"
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                        <div
                            onClick={() => {
                                onChange('ALL');
                                setIsOpen(false);
                                setSearchTerm('');
                            }}
                            className="px-2.5 py-1.5 rounded text-xs cursor-pointer hover:bg-slate-100 text-slate-500 italic"
                        >
                            Todos os Depositantes
                        </div>
                        {filteredCustomers.map(cust => (
                            <div
                                key={cust.id}
                                onClick={() => {
                                    onChange(cust.id);
                                    setIsOpen(false);
                                    setSearchTerm('');
                                }}
                                className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between transition-colors ${value === cust.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                    }`}
                            >
                                <div className="flex flex-col">
                                    <span className="truncate">{cust.corporateName}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">CNPJ: {cust.cnpj}</span>
                                </div>
                                {value === cust.id && <CheckCircle2 size={12} className="text-blue-600" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function EstoquePage() {
    const canViewInventory = useHasPermission(['inventory:view', 'inventory:manage']);
    const canManageInventory = useHasPermission('inventory:manage');
    const canViewCustomers = useHasPermission('customers:view');

    const [currentTab, setCurrentTab] = useState('balances');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
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
    const [filterVersion, setFilterVersion] = useState(0);
    const [isSearching, setIsSearching] = useState(false);

    const { data: customersData } = useGetApiCustomers(
        { OnlyActive: true, PageSize: 500 },
        { query: { enabled: Boolean(canViewInventory && canViewCustomers) } }
    );
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const { data: storageLocations = [] } = useGetApiTopologyLocationsStorage({
        query: { enabled: Boolean(canViewInventory && showAdvancedFilters) }
    });

    const [qualityLocations, setQualityLocations] = useState([]);

    useEffect(() => {
        if (!canViewInventory || !showAdvancedFilters) return;
        let isMounted = true;
        customInstance({ url: '/api/topology/locations/quality', method: 'GET' })
            .then(res => {
                if (isMounted) setQualityLocations(Array.isArray(res) ? res : []);
            })
            .catch(() => {
                if (isMounted) setQualityLocations([]);
            });
        return () => {
            isMounted = false;
        };
    }, [canViewInventory, showAdvancedFilters]);

    const allTopologyLocations = useMemo(
        () => [...storageLocations, ...qualityLocations],
        [storageLocations, qualityLocations]
    );

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
        setIsSearching(true);

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
        setFilterVersion(v => v + 1);
        setTimeout(() => setIsSearching(false), 200);
    };

    const handleClearFilters = () => {
        setSearchLpn('');
        setSearchSku('');
        setSelectedCustomer('ALL');
        setSearchBatch('');
        setSearchNfe('');
        setSelectedLocation('ALL');
        setQualityFilter('ALL');
        setStatusFilter('ALL');
        setDateRange(undefined);
        setAppliedFilters({});
        setFilterVersion(v => v + 1);
    };

    if (!canViewInventory) {
        return null;
    }

    return (
        <div className="flex flex-col space-y-4 h-full">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Consulta e Relatórios de Estoque</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Acompanhe saldos consolidados, rastreie volumes (HUs) e audite o extrato Kardex com o mesmo filtro global.
                    </p>
                </div>
                {canManageInventory && (
                    <Button
                        onClick={() => setIsImportModalOpen(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm text-xs font-semibold"
                    >
                        <UploadCloud className="mr-2 h-4 w-4" /> Importar Inventário Legado
                    </Button>
                )}
            </div>

            {/* BARRA DE FILTRO GLOBAL UNIFICADA */}
            <form
                onSubmit={handleSearchSubmit}
                className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs shrink-0 space-y-3"
            >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant={showAdvancedFilters ? 'secondary' : 'outline'}
                            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                            className="text-xs font-semibold h-8 bg-white border-slate-200 cursor-pointer"
                        >
                            <SlidersHorizontal size={13} className="mr-1.5 text-slate-600" /> Filtros Avançados
                            {activeAdvancedCount > 0 && (
                                <Badge className="ml-1.5 bg-blue-600 text-white font-mono text-[10px] h-4 px-1 rounded-full">
                                    {activeAdvancedCount}
                                </Badge>
                            )}
                            {showAdvancedFilters ? (
                                <ChevronUp size={13} className="ml-1 text-slate-400" />
                            ) : (
                                <ChevronDown size={13} className="ml-1 text-slate-400" />
                            )}
                        </Button>
                        <span className="text-[11px] text-slate-400">
                            Os filtros aplicados valem para Balanço, HUs e Kardex.
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Button
                            type="submit"
                            disabled={isSearching}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-4 shadow-2xs cursor-pointer"
                        >
                            {isSearching ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <>
                                    <Search size={13} className="mr-1.5" /> Pesquisar
                                </>
                            )}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleClearFilters}
                            title="Limpar Filtros Globais"
                            className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
                        >
                            <RotateCcw size={13} />
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-3 space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700 uppercase">Código LPN / HU</Label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                placeholder="Digite o LPN..."
                                value={searchLpn}
                                onChange={(e) => setSearchLpn(e.target.value)}
                                className="pl-8 bg-white text-xs h-9 font-mono border-slate-200"
                            />
                        </div>
                    </div>

                    <div className={`${canViewCustomers ? 'sm:col-span-5' : 'sm:col-span-9'} space-y-1`}>
                        <Label className="text-[11px] font-bold text-slate-700 uppercase">SKU / Descrição do Produto</Label>
                        <Input
                            placeholder="Digite o código SKU ou descrição..."
                            value={searchSku}
                            onChange={(e) => setSearchSku(e.target.value)}
                            className="bg-white text-xs h-9 font-mono border-slate-200"
                        />
                    </div>

                    {canViewCustomers && (
                        <div className="sm:col-span-4 space-y-1">
                            <Label className="text-[11px] font-bold text-slate-700 uppercase">Depositante</Label>
                            <SearchableCustomerSelect
                                value={selectedCustomer}
                                onChange={(cust) => setSelectedCustomer(cust)}
                                customers={customers}
                                placeholder="Todos os Depositantes"
                            />
                        </div>
                    )}
                </div>

                {showAdvancedFilters && (
                    <div className="pt-3 border-t border-slate-200/80 animate-in fade-in duration-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-3 items-end">
                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">Lote Físico</Label>
                                <Input
                                    placeholder="Digite o lote..."
                                    value={searchBatch}
                                    onChange={(e) => setSearchBatch(e.target.value)}
                                    className="bg-white text-xs h-9 font-mono border-slate-200"
                                />
                            </div>

                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">NF-e / Chave de Acesso</Label>
                                <div className="relative">
                                    <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                    <Input
                                        placeholder="Número da NF-e..."
                                        value={searchNfe}
                                        onChange={(e) => setSearchNfe(e.target.value)}
                                        className="pl-8 bg-white text-xs h-9 font-mono border-slate-200"
                                    />
                                </div>
                            </div>

                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">Endereço / Posição</Label>
                                <SearchableLocationSelect
                                    value={selectedLocation}
                                    onChange={(locId) => setSelectedLocation(locId)}
                                    locations={allTopologyLocations}
                                    placeholder="Selecione a Posição..."
                                />
                            </div>

                            <div className="lg:col-span-2 space-y-1">
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">Qualidade</Label>
                                <Select value={qualityFilter} onValueChange={setQualityFilter}>
                                    <SelectTrigger className="bg-white h-9 text-xs border-slate-200">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
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
                                    <SelectTrigger className="bg-white h-9 text-xs border-slate-200">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
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
                                <Label className="text-[11px] font-bold text-slate-700 uppercase">Período</Label>
                                <DateRangePicker date={dateRange} setDate={setDateRange} className="w-full" />
                            </div>
                        </div>
                    </div>
                )}
            </form>

            {/* NAVEGAÇÃO ENTRE ABAS */}
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300">
                <div className="bg-white border border-slate-200/60 rounded-xl p-1 w-fit shadow-xs shrink-0">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger
                            value="balances"
                            className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-semibold cursor-pointer"
                        >
                            <Boxes className="w-4 h-4 mr-2" /> Balanço de Estoque
                        </TabsTrigger>
                        <TabsTrigger
                            value="hus"
                            className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-semibold cursor-pointer"
                        >
                            <Layers className="w-4 h-4 mr-2" /> Unidades de Manuseio (HUs)
                        </TabsTrigger>
                        <TabsTrigger
                            value="kardex"
                            className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-semibold cursor-pointer"
                        >
                            <ScrollText className="w-4 h-4 mr-2" /> Kardex (Extrato)
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 mt-3 relative min-h-0">
                    {currentTab === 'balances' && (
                        <div className="h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <BalancoTab appliedFilters={appliedFilters} filterVersion={filterVersion} />
                        </div>
                    )}
                    {currentTab === 'hus' && (
                        <div className="h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <HandlingUnitsTab appliedFilters={appliedFilters} filterVersion={filterVersion} />
                        </div>
                    )}
                    {currentTab === 'kardex' && (
                        <div className="h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <KardexTab appliedFilters={appliedFilters} filterVersion={filterVersion} />
                        </div>
                    )}
                </div>
            </Tabs>

            {canManageInventory && (
                <ImportarLegadoModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />
            )}
        </div>
    );
}