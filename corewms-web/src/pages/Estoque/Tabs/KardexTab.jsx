import { useState, useMemo } from 'react';
import { useGetApiInventoryKardex } from '@/api/generated/inventory/inventory';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Search, Loader2, Download, Calendar, FileText,
    ArrowUpRight, ArrowDownLeft, RefreshCcw, SlidersHorizontal,
    ChevronDown, ChevronUp, RotateCcw, MapPin, CheckCircle2, X, Columns
} from 'lucide-react';
import { downloadBackendCsv } from '@/lib/exportCsv';

// Definição de Colunas Customizáveis do Kardex
const KARDEX_COLUMN_DEFINITIONS = [
    { id: 'createdAt', label: 'Data / Hora' },
    { id: 'sku', label: 'SKU / Produto' },
    { id: 'customer', label: 'Depositante' },
    { id: 'lpn', label: 'LPN / Código HU' },
    { id: 'batch', label: 'Lote / Validade' },
    { id: 'type', label: 'Tipo de Evento' },
    { id: 'quantityChange', label: 'Variação Qtd' },
    { id: 'balanceAfter', label: 'Saldo Pós-Evento' },
    { id: 'location', label: 'Endereço / Posição' },
    { id: 'sourceDocument', label: 'Documento Origem' },
];

// Seletor Pesquisável de Depositantes Ativos
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
                            onClick={() => { onChange('ALL'); setIsOpen(false); setSearchTerm(''); }}
                            className="px-2.5 py-1.5 rounded text-xs cursor-pointer hover:bg-slate-100 text-slate-500 italic"
                        >
                            Todos os Depositantes
                        </div>
                        {filteredCustomers.map(cust => (
                            <div
                                key={cust.id}
                                onClick={() => { onChange(cust.id); setIsOpen(false); setSearchTerm(''); }}
                                className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between transition-colors ${value === cust.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'}`}
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

export default function KardexTab() {
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // Estado da Customização de Colunas Visíveis
    const [visibleColumns, setVisibleColumns] = useState({
        createdAt: true,
        sku: true,
        customer: true,
        lpn: true,
        batch: true,
        type: true,
        quantityChange: true,
        balanceAfter: true,
        location: true,
        sourceDocument: true,
    });

    // 1. FILTROS BÁSICOS
    const [searchLpn, setSearchLpn] = useState('');
    const [searchSku, setSearchSku] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // 2. FILTROS AVANÇADOS
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');
    const [searchBatch, setSearchBatch] = useState('');
    const [searchNfe, setSearchNfe] = useState('');

    const [appliedFilters, setAppliedFilters] = useState({});
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    // APIs
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const formattedStartDate = useMemo(() => {
        if (!startDate) return undefined;
        return new Date(`${startDate}T00:00:00.000`).toISOString();
    }, [startDate]);

    const formattedEndDate = useMemo(() => {
        if (!endDate) return undefined;
        return new Date(`${endDate}T23:59:59.999`).toISOString();
    }, [endDate]);

    const activeAdvancedCount = useMemo(() => {
        let count = 0;
        if (selectedCustomer !== 'ALL') count++;
        if (searchBatch.trim()) count++;
        if (searchNfe.trim()) count++;
        return count;
    }, [selectedCustomer, searchBatch, searchNfe]);

    const handleSearchSubmit = (e) => {
        if (e) e.preventDefault();
        setPage(1);

        setAppliedFilters({
            ...(searchLpn.trim() && { Lpn: searchLpn.trim() }),
            ...(searchSku.trim() && { Sku: searchSku.trim() }),
            ...(selectedCustomer !== 'ALL' && { CustomerId: selectedCustomer }),
            ...(searchBatch.trim() && { Batch: searchBatch.trim() }),
            ...(searchNfe.trim() && { NfeNumber: searchNfe.trim() }),
            ...(formattedStartDate && { StartDate: formattedStartDate }),
            ...(formattedEndDate && { EndDate: formattedEndDate })
        });
    };

    const handleClearFilters = () => {
        setSearchLpn('');
        setSearchSku('');
        setStartDate('');
        setEndDate('');
        setSelectedCustomer('ALL');
        setSearchBatch('');
        setSearchNfe('');
        setPage(1);
        setAppliedFilters({});
    };

    const toggleColumn = (columnId) => {
        setVisibleColumns(prev => ({ ...prev, [columnId]: !prev[columnId] }));
    };

    const queryParams = {
        Page: page,
        PageSize: PAGE_SIZE,
        ...appliedFilters
    };

    const { data: apiResponse, isLoading, isFetching } = useGetApiInventoryKardex(queryParams);
    const transactions = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const totals = useMemo(() => {
        return {
            inputs: apiResponse?.totalInputs ?? 0,
            outputs: apiResponse?.totalOutputs ?? 0,
            net: apiResponse?.netChange ?? 0
        };
    }, [apiResponse]);

    const handleExport = () => {
        downloadBackendCsv('/api/inventory/kardex/export', appliedFilters, 'kardex_extrato_movimentacoes');
    };

    const renderEventTypeBadge = (type) => {
        const typeStr = String(type);
        switch (typeStr) {
            case 'Inbound_Receipt':
            case '1':
                return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-mono text-[10px] flex items-center gap-1 w-fit"><ArrowDownLeft size={12} /> Recebimento / Entrada</Badge>;
            case 'Inventory_Adjustment_In':
            case '2':
                return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-300 font-mono text-[10px] flex items-center gap-1 w-fit"><ArrowDownLeft size={12} /> Ajuste Entrada (+)</Badge>;
            case 'Internal_Move':
            case '3':
                return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-[10px] flex items-center gap-1 w-fit"><MapPin size={12} /> Movimentação Interna</Badge>;
            case 'Quality_Hold':
            case '4':
                return <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-mono text-[10px] flex items-center gap-1 w-fit"><RefreshCcw size={12} /> Retenção Qualidade</Badge>;
            case 'Quality_Release':
            case '5':
                return <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 font-mono text-[10px] flex items-center gap-1 w-fit"><CheckCircle2 size={12} /> Liberação Qualidade</Badge>;
            case 'Outbound_FullPallet':
            case '6':
                return <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-mono text-[10px] flex items-center gap-1 w-fit"><ArrowUpRight size={12} /> Saída / Palete Fechado</Badge>;
            case 'Outbound_FullBox':
            case '7':
                return <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-mono text-[10px] flex items-center gap-1 w-fit"><ArrowUpRight size={12} /> Saída / Caixa Fechada</Badge>;
            case 'Outbound_Fractional':
            case '8':
                return <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-mono text-[10px] flex items-center gap-1 w-fit"><ArrowUpRight size={12} /> Saída / Fracionado (Picking)</Badge>;
            case 'Inventory_Adjustment_Out':
            case '9':
                return <Badge className="bg-rose-100 text-rose-800 border-rose-200 font-mono text-[10px] flex items-center gap-1 w-fit"><ArrowUpRight size={12} /> Ajuste Saída (-)</Badge>;
            default:
                return <Badge variant="outline" className="bg-slate-50 text-slate-700 font-mono text-[10px]">{typeStr}</Badge>;
        }
    };

    return (
        <div className="flex flex-col space-y-4 h-full">
            {/* KPI TOTALIZADORES DAS CONSULTAS DE KARDEX */}
            <div className="grid grid-cols-3 gap-4 shrink-0">
                <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg shrink-0"><ArrowDownLeft size={20} /></div>
                    <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Entradas (+)</span>
                        <span className="text-lg font-bold font-mono text-emerald-700">{totals.inputs.toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex items-center gap-3">
                    <div className="p-2.5 bg-rose-50 text-rose-700 rounded-lg shrink-0"><ArrowUpRight size={20} /></div>
                    <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Saídas (-)</span>
                        <span className="text-lg font-bold font-mono text-rose-700">{totals.outputs.toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg shrink-0"><RefreshCcw size={20} /></div>
                    <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Variação do Período</span>
                        <span className={`text-lg font-bold font-mono ${totals.net >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                            {totals.net >= 0 ? `+${totals.net.toLocaleString('pt-BR')}` : totals.net.toLocaleString('pt-BR')}
                        </span>
                    </div>
                </div>
            </div>

            {/* BARRA DE FILTROS FIXA */}
            <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex-1 flex flex-col overflow-hidden">
                <form onSubmit={handleSearchSubmit} className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant={showAdvancedFilters ? "secondary" : "outline"}
                                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                                className="text-xs font-semibold h-9 bg-white border-slate-200"
                            >
                                <SlidersHorizontal size={14} className="mr-1.5 text-slate-600" />
                                Filtros Avançados
                                {activeAdvancedCount > 0 && (
                                    <Badge className="ml-1.5 bg-blue-600 text-white font-mono text-[10px] h-4 px-1 rounded-full">
                                        {activeAdvancedCount}
                                    </Badge>
                                )}
                                {showAdvancedFilters ? <ChevronUp size={14} className="ml-1 text-slate-400" /> : <ChevronDown size={14} className="ml-1 text-slate-400" />}
                            </Button>

                            {/* CUSTOMIZADOR DE COLUNAS */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" className="text-xs font-semibold h-9 bg-white border-slate-200">
                                        <Columns size={14} className="mr-1.5 text-slate-600" />
                                        Colunas
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-3 bg-white border border-slate-200 shadow-xl rounded-xl space-y-2">
                                    <span className="text-xs font-bold text-slate-800 block border-b pb-1">Exibir Colunas</span>
                                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                        {KARDEX_COLUMN_DEFINITIONS.map(col => (
                                            <label key={col.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 p-1 rounded">
                                                <Checkbox
                                                    checked={visibleColumns[col.id]}
                                                    onCheckedChange={() => toggleColumn(col.id)}
                                                />
                                                <span>{col.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <Button type="button" onClick={handleExport} variant="outline" size="sm" disabled={totalCount === 0} className="bg-white border-slate-200 text-slate-700 text-xs h-9">
                            <Download className="mr-1 h-3.5 w-3.5" /> Exportar CSV
                        </Button>
                    </div>

                    {/* FILTROS BÁSICOS (LPN, SKU E DATAS) */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className="sm:col-span-3 space-y-1">
                            <Label className="text-[11px] font-bold text-slate-700 uppercase">LPN / Código HU</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <Input
                                    placeholder="Buscar por LPN..."
                                    value={searchLpn}
                                    onChange={(e) => setSearchLpn(e.target.value)}
                                    className="pl-8 bg-white text-xs h-9 font-mono border-slate-200"
                                />
                            </div>
                        </div>

                        <div className="sm:col-span-3 space-y-1">
                            <Label className="text-[11px] font-bold text-slate-700 uppercase">SKU / Produto</Label>
                            <Input
                                placeholder="Digite o SKU..."
                                value={searchSku}
                                onChange={(e) => setSearchSku(e.target.value)}
                                className="bg-white text-xs h-9 font-mono border-slate-200"
                            />
                        </div>

                        <div className="sm:col-span-4 space-y-1">
                            <Label className="text-[11px] font-bold text-slate-700 uppercase">Período da Movimentação</Label>
                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 h-9">
                                <Calendar size={14} className="text-slate-400 shrink-0" />
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="border-none shadow-none text-xs h-7 p-0 w-28 bg-transparent font-mono"
                                />
                                <span className="text-slate-300 text-xs">até</span>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="border-none shadow-none text-xs h-7 p-0 w-28 bg-transparent font-mono"
                                />
                            </div>
                        </div>

                        <div className="sm:col-span-2 flex items-center gap-1.5">
                            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 flex-1 shadow-2xs">
                                <Search size={14} className="mr-1.5" /> Pesquisar
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={handleClearFilters}
                                title="Limpar Filtros"
                                className="h-9 w-9 text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
                            >
                                <RotateCcw size={14} />
                            </Button>
                        </div>
                    </div>

                    {/* FILTROS AVANÇADOS */}
                    {showAdvancedFilters && (
                        <div className="pt-3 border-t border-slate-200/80 animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-[11px] font-bold text-slate-700 uppercase">Depositante</Label>
                                    <SearchableCustomerSelect
                                        value={selectedCustomer}
                                        onChange={(cust) => setSelectedCustomer(cust)}
                                        customers={customers}
                                        placeholder="Todos os Depositantes"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[11px] font-bold text-slate-700 uppercase">Lote Físico</Label>
                                    <Input
                                        placeholder="Digite o código do lote..."
                                        value={searchBatch}
                                        onChange={(e) => setSearchBatch(e.target.value)}
                                        className="bg-white text-xs h-9 font-mono border-slate-200"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[11px] font-bold text-slate-700 uppercase">NF-e / Documento Origem</Label>
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
                            </div>
                        </div>
                    )}
                </form>

                {/* TABELA DO KARDEX */}
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 backdrop-blur-sm z-10">
                            <TableRow>
                                {visibleColumns.createdAt && <TableHead>Data / Hora</TableHead>}
                                {visibleColumns.sku && <TableHead>SKU / Produto</TableHead>}
                                {visibleColumns.customer && <TableHead>Depositante</TableHead>}
                                {visibleColumns.lpn && <TableHead>LPN / Código HU</TableHead>}
                                {visibleColumns.batch && <TableHead>Lote / Validade</TableHead>}
                                {visibleColumns.type && <TableHead>Tipo de Evento</TableHead>}
                                {visibleColumns.quantityChange && <TableHead className="text-right">Variação Qtd</TableHead>}
                                {visibleColumns.balanceAfter && <TableHead className="text-right font-bold text-slate-900">Saldo Pós-Evento</TableHead>}
                                {visibleColumns.location && <TableHead>Endereço / Posição</TableHead>}
                                {visibleColumns.sourceDocument && <TableHead>Documento Origem</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading || isFetching ? (
                                <TableRow><TableCell colSpan={10} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : transactions.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="h-32 text-center text-slate-500">Nenhum evento registrado no Kardex para os filtros informados.</TableCell></TableRow>
                            ) : transactions.map((t) => {
                                const isPositive = t.quantityChange > 0;
                                return (
                                    <TableRow key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                        {/* DATA / HORA */}
                                        {visibleColumns.createdAt && (
                                            <TableCell className="text-xs font-mono text-slate-600 whitespace-nowrap">
                                                {t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : '-'}
                                            </TableCell>
                                        )}

                                        {/* SKU / PRODUTO */}
                                        {visibleColumns.sku && (
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold font-mono text-slate-900 text-xs">{t.productSku}</span>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[180px]" title={t.productDescription}>{t.productDescription}</span>
                                                </div>
                                            </TableCell>
                                        )}

                                        {/* DEPOSITANTE */}
                                        {visibleColumns.customer && (
                                            <TableCell className="text-xs text-slate-700 font-medium truncate max-w-[160px]" title={t.customerName}>
                                                {t.customerName}
                                            </TableCell>
                                        )}

                                        {/* LPN / HU SEPARADO */}
                                        {visibleColumns.lpn && (
                                            <TableCell>
                                                {t.lpn ? (
                                                    <span className="font-mono font-bold text-blue-700 text-xs">{t.lpn}</span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Geral / S/ LPN</span>
                                                )}
                                            </TableCell>
                                        )}

                                        {/* LOTE E VALIDADE SEPARADOS */}
                                        {visibleColumns.batch && (
                                            <TableCell className="text-xs font-mono text-slate-600">
                                                <div>Lote: {t.batch || '-'}</div>
                                                <div>Val: {t.expirationDate ? new Date(t.expirationDate).toLocaleDateString('pt-BR') : '-'}</div>
                                            </TableCell>
                                        )}

                                        {/* TIPO DE EVENTO */}
                                        {visibleColumns.type && <TableCell>{renderEventTypeBadge(t.type)}</TableCell>}

                                        {/* VARIAÇÃO QTD */}
                                        {visibleColumns.quantityChange && (
                                            <TableCell className={`text-right font-mono font-bold text-xs ${isPositive ? 'text-emerald-600' : t.quantityChange < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                                {isPositive ? `+${t.quantityChange.toLocaleString('pt-BR')}` : t.quantityChange.toLocaleString('pt-BR')}
                                            </TableCell>
                                        )}

                                        {/* SALDO PÓS-EVENTO */}
                                        {visibleColumns.balanceAfter && (
                                            <TableCell className="text-right font-mono font-bold text-xs text-slate-900 bg-slate-50/50">
                                                {t.balanceAfter?.toLocaleString('pt-BR')}
                                            </TableCell>
                                        )}

                                        {/* ENDEREÇO / POSIÇÃO */}
                                        {visibleColumns.location && (
                                            <TableCell>
                                                {t.locationPath ? (
                                                    <Badge variant="outline" className="bg-slate-50 font-mono text-slate-700 text-[10px] gap-1">
                                                        <MapPin size={12} className="text-blue-600" /> {t.locationPath}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">-</span>
                                                )}
                                            </TableCell>
                                        )}

                                        {/* DOCUMENTO ORIGEM */}
                                        {visibleColumns.sourceDocument && (
                                            <TableCell className="text-xs text-slate-600 font-mono">
                                                {t.sourceDocumentNumber || '-'}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                {totalCount > 0 && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0 text-xs text-slate-500">
                        <span>Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} registros</span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                            <span className="text-xs font-mono self-center text-slate-600 px-1">Página {page} de {totalPages || 1}</span>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}