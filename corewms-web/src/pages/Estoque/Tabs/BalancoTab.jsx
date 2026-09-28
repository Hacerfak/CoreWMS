import { useState, useMemo } from 'react';
import { useGetApiInventoryBalances } from '@/api/generated/inventory/inventory';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { useGetApiProducts } from '@/api/generated/products/products';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Package, Search, Boxes, CheckCircle2, AlertTriangle, ShieldAlert, Warehouse, Truck } from 'lucide-react';
import { downloadBackendCsv } from '@/lib/exportCsv';

export default function BalancoTab() {
    const [page, setPage] = useState(1);
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');
    const [selectedProduct, setSelectedProduct] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const PAGE_SIZE = 20;

    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 100 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const { data: productsData } = useGetApiProducts({ PageSize: 100 });
    const products = productsData?.items || (Array.isArray(productsData) ? productsData : []);

    const queryParams = {
        Page: page,
        PageSize: PAGE_SIZE,
        ...(selectedCustomer !== 'ALL' && { CustomerId: selectedCustomer }),
        ...(selectedProduct !== 'ALL' && { ProductId: selectedProduct })
    };

    const { data: apiResponse, isLoading, isFetching } = useGetApiInventoryBalances(queryParams);
    const rawBalances = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    // Filtro adicional no client side para busca rápida por texto
    const balances = useMemo(() => {
        if (!searchTerm.trim()) return rawBalances;
        const term = searchTerm.toLowerCase();
        return rawBalances.filter(b =>
            b.productSku?.toLowerCase().includes(term) ||
            b.customerName?.toLowerCase().includes(term)
        );
    }, [rawBalances, searchTerm]);

    // Cálculo das métricas resumidas da página atual
    const totals = useMemo(() => {
        return balances.reduce((acc, b) => ({
            expected: acc.expected + (b.totalExpected || 0),
            dock: acc.dock + (b.totalDock || 0),
            available: acc.available + (b.totalAvailable || 0),
            allocated: acc.allocated + (b.totalAllocated || 0),
            quarantine: acc.quarantine + (b.totalQuarantine || 0),
            physical: acc.physical + (b.totalPhysical || 0)
        }), { expected: 0, dock: 0, available: 0, allocated: 0, quarantine: 0, physical: 0 });
    }, [balances]);

    const handleExport = () => {
        const exportParams = {
            ...(selectedCustomer !== 'ALL' && { CustomerId: selectedCustomer }),
            ...(selectedProduct !== 'ALL' && { ProductId: selectedProduct })
        };
        downloadBackendCsv('/api/inventory/balances/export', exportParams, 'balanco_estoque');
    };

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

            {/* TABELA E BARRA DE FILTROS */}
            <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 shrink-0">
                    <div className="flex flex-wrap items-center gap-3 flex-1">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar por SKU ou Depositante..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-white text-xs h-9"
                            />
                        </div>

                        <div className="w-[220px]">
                            <Select value={selectedCustomer} onValueChange={(v) => { setSelectedCustomer(v); setPage(1); }}>
                                <SelectTrigger className="bg-white h-9 text-xs">
                                    <SelectValue placeholder="Depositante" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os Depositantes</SelectItem>
                                    {customers.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="w-[220px]">
                            <Select value={selectedProduct} onValueChange={(v) => { setSelectedProduct(v); setPage(1); }}>
                                <SelectTrigger className="bg-white h-9 text-xs">
                                    <SelectValue placeholder="SKU do Produto" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os SKUs</SelectItem>
                                    {products.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.sku} - {p.description}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Button onClick={handleExport} variant="outline" size="sm" disabled={totalCount === 0} className="bg-white border-slate-200 text-slate-700 text-xs">
                        <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar CSV
                    </Button>
                </div>

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
                                <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500">Nenhum saldo encontrado no estoque.</TableCell></TableRow>
                            ) : balances.map((b, idx) => (
                                <TableRow key={idx} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                                <Package size={16} />
                                            </div>
                                            <span className="font-bold font-mono text-slate-900 text-xs">{b.productSku}</span>
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