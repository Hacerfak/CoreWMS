import { useState, useMemo } from 'react';
import { useGetApiInventoryBalances } from '@/api/generated/inventory/inventory';
import { useGetApiCustomers } from '@/api/generated/customers/customers';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Loader2, Download, Package, Search, Boxes, CheckCircle2,
    AlertTriangle, ShieldAlert, Warehouse, Truck, RotateCcw, FileText, X, Filter, ChevronDown
} from 'lucide-react';
import { downloadBackendCsv } from '@/lib/exportCsv';

// Seletor Pesquisável de Depositantes
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

export default function BalancoTab() {
    // FILTROS BÁSICOS
    const [searchSku, setSearchSku] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');
    const [searchNfe, setSearchNfe] = useState('');

    const [appliedFilters, setAppliedFilters] = useState({});
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const handleSearchSubmit = (e) => {
        if (e) e.preventDefault();
        setPage(1);

        setAppliedFilters({
            ...(searchSku.trim() && { Sku: searchSku.trim() }),
            ...(selectedCustomer !== 'ALL' && { CustomerId: selectedCustomer }),
            ...(searchNfe.trim() && { NfeNumber: searchNfe.trim() })
        });
    };

    const handleClearFilters = () => {
        setSearchSku('');
        setSelectedCustomer('ALL');
        setSearchNfe('');
        setPage(1);
        setAppliedFilters({});
    };

    const removeSingleFilter = (key) => {
        switch (key) {
            case 'Sku': setSearchSku(''); break;
            case 'CustomerId': setSelectedCustomer('ALL'); break;
            case 'NfeNumber': setSearchNfe(''); break;
            default: break;
        }

        const updated = { ...appliedFilters };
        delete updated[key];
        setAppliedFilters(updated);
        setPage(1);
    };

    const queryParams = {
        Page: page,
        PageSize: PAGE_SIZE,
        ...appliedFilters
    };

    const { data: apiResponse, isLoading, isFetching } = useGetApiInventoryBalances(queryParams);
    const balances = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const totals = useMemo(() => {
        return {
            physical: apiResponse?.totalPhysical ?? 0,
            expected: apiResponse?.totalExpected ?? 0,
            dock: apiResponse?.totalDock ?? 0,
            available: apiResponse?.totalAvailable ?? 0,
            allocated: apiResponse?.totalAllocated ?? 0,
            quarantine: apiResponse?.totalQuarantine ?? 0
        };
    }, [apiResponse]);

    const handleExport = () => {
        downloadBackendCsv('/api/inventory/balances/export', appliedFilters, 'balanco_estoque');
    };

    const activeFilterCountTotal = Object.keys(appliedFilters).length;

    return (
        <div className="flex flex-col space-y-4 h-full">
            {/* KPI CARDS RESUMIDOS (6 COLUNAS) */}
            <div className="grid grid-cols-6 gap-3 shrink-0">
                <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex items-center gap-3">
                    <div className="p-2 bg-slate-100 text-slate-700 rounded-lg shrink-0"><Boxes size={18} /></div>
                    <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block truncate">Físico Total</span>
                        <span className="text-base font-bold font-mono text-slate-900">{totals.physical.toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-700 rounded-lg shrink-0"><Truck size={18} /></div>
                    <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block truncate">Esperado (NF-e)</span>
                        <span className="text-base font-bold font-mono text-blue-700">{totals.expected.toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-800 rounded-lg shrink-0"><Warehouse size={18} /></div>
                    <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block truncate">Na Doca (Putaway)</span>
                        <span className="text-base font-bold font-mono text-amber-800">{totals.dock.toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg shrink-0"><CheckCircle2 size={18} /></div>
                    <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block truncate">Disponível</span>
                        <span className="text-base font-bold font-mono text-emerald-700">{totals.available.toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex items-center gap-3">
                    <div className="p-2 bg-purple-50 text-purple-700 rounded-lg shrink-0"><AlertTriangle size={18} /></div>
                    <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block truncate">Alocado</span>
                        <span className="text-base font-bold font-mono text-purple-700">{totals.allocated.toLocaleString('pt-BR')}</span>
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs flex items-center gap-3">
                    <div className="p-2 bg-rose-50 text-rose-700 rounded-lg shrink-0"><ShieldAlert size={18} /></div>
                    <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block truncate">Quarentena</span>
                        <span className="text-base font-bold font-mono text-rose-700">{totals.quarantine.toLocaleString('pt-BR')}</span>
                    </div>
                </div>
            </div>

            {/* TABELA E PAINEL DE FILTROS FIXO */}
            <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex-1 flex flex-col overflow-hidden">
                <form onSubmit={handleSearchSubmit} className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-700 font-mono uppercase">Filtros de Balanço</span>
                        <Button type="button" onClick={handleExport} variant="outline" size="sm" disabled={totalCount === 0} className="bg-white border-slate-200 text-slate-700 text-xs h-9">
                            <Download className="mr-1 h-3.5 w-3.5" /> Exportar CSV
                        </Button>
                    </div>

                    {/* FILTROS BÁSICOS */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className="sm:col-span-4 space-y-1">
                            <Label className="text-[11px] font-bold text-slate-700 uppercase">SKU / Descrição do Produto</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <Input
                                    placeholder="Digite SKU ou descrição..."
                                    value={searchSku}
                                    onChange={(e) => setSearchSku(e.target.value)}
                                    className="pl-8 bg-white text-xs h-9 font-mono border-slate-200"
                                />
                            </div>
                        </div>

                        <div className="sm:col-span-4 space-y-1">
                            <Label className="text-[11px] font-bold text-slate-700 uppercase">Depositante</Label>
                            <SearchableCustomerSelect
                                value={selectedCustomer}
                                onChange={(cust) => setSelectedCustomer(cust)}
                                customers={customers}
                                placeholder="Todos os Depositantes"
                            />
                        </div>

                        <div className="sm:col-span-2 space-y-1">
                            <Label className="text-[11px] font-bold text-slate-700 uppercase">NF-e / Chave</Label>
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

                    {/* BANNER DE FILTROS ATIVOS */}
                    {activeFilterCountTotal > 0 && (
                        <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/60 flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-200">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-blue-900 flex items-center gap-1 font-mono">
                                    <Filter size={13} className="text-blue-600" /> Filtros Ativos ({activeFilterCountTotal}):
                                </span>

                                {appliedFilters.Sku && (
                                    <Badge variant="outline" className="bg-white border-blue-300 text-blue-800 text-[11px] font-mono gap-1">
                                        SKU: {appliedFilters.Sku}
                                        <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => removeSingleFilter('Sku')} />
                                    </Badge>
                                )}

                                {appliedFilters.CustomerId && (
                                    <Badge variant="outline" className="bg-white border-blue-300 text-blue-800 text-[11px] gap-1">
                                        Depositante: {customers.find(c => c.id === appliedFilters.CustomerId)?.corporateName || 'Selecionado'}
                                        <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => removeSingleFilter('CustomerId')} />
                                    </Badge>
                                )}

                                {appliedFilters.NfeNumber && (
                                    <Badge variant="outline" className="bg-white border-blue-300 text-blue-800 text-[11px] font-mono gap-1">
                                        NF-e: {appliedFilters.NfeNumber}
                                        <X size={12} className="cursor-pointer hover:text-rose-600" onClick={() => removeSingleFilter('NfeNumber')} />
                                    </Badge>
                                )}
                            </div>

                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleClearFilters}
                                className="h-6 text-[11px] text-rose-700 hover:bg-rose-100 font-semibold"
                            >
                                Limpar Todos
                            </Button>
                        </div>
                    )}
                </form>

                {/* TABELA DE BALANÇO DE ESTOQUE */}
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 backdrop-blur-sm z-10">
                            <TableRow>
                                <TableHead>SKU / Produto</TableHead>
                                <TableHead>Depositante</TableHead>
                                <TableHead className="text-right text-blue-700">Esperado (NF-e)</TableHead>
                                <TableHead className="text-right text-amber-800">Na Doca</TableHead>
                                <TableHead className="text-right text-emerald-700">Disponível</TableHead>
                                <TableHead className="text-right text-purple-700">Alocado</TableHead>
                                <TableHead className="text-right text-rose-700">Quarentena</TableHead>
                                <TableHead className="text-right font-bold text-slate-900">Físico Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading || isFetching ? (
                                <TableRow><TableCell colSpan={8} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : balances.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500">Nenhum saldo encontrado para os filtros aplicados.</TableCell></TableRow>
                            ) : balances.map((b, idx) => (
                                <TableRow key={idx} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                <Package size={16} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold font-mono text-slate-900 text-xs">{b.productSku}</span>
                                                <span className="text-[10px] text-slate-400 truncate max-w-[220px]" title={b.productDescription}>{b.productDescription}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-700 font-medium">{b.customerName}</TableCell>
                                    <TableCell className="text-right font-mono text-xs text-blue-700 font-medium">{b.totalExpected?.toLocaleString('pt-BR')}</TableCell>
                                    <TableCell className="text-right font-mono font-bold text-xs text-amber-800">{b.totalDock?.toLocaleString('pt-BR')}</TableCell>
                                    <TableCell className="text-right font-mono font-bold text-xs text-emerald-700">{b.totalAvailable?.toLocaleString('pt-BR')}</TableCell>
                                    <TableCell className="text-right font-mono font-bold text-xs text-purple-700">{b.totalAllocated?.toLocaleString('pt-BR')}</TableCell>
                                    <TableCell className="text-right font-mono font-bold text-xs text-rose-700">{b.totalQuarantine?.toLocaleString('pt-BR')}</TableCell>
                                    <TableCell className="text-right font-mono font-bold text-xs text-slate-900 bg-slate-50/80">{b.totalPhysical?.toLocaleString('pt-BR')}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {totalCount > 0 && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0 text-xs text-slate-500">
                        <span>Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} SKUs</span>
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