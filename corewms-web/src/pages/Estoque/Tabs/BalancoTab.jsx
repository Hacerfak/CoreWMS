import { useState } from 'react';
import { useGetApiInventoryBalances } from '@/api/generated/inventory/inventory';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { useGetApiProducts } from '@/api/generated/products/products';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, Package } from 'lucide-react';
import { downloadBackendCsv } from '@/lib/exportCsv';

export default function BalancoTab() {
    const [page, setPage] = useState(1);
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');
    const [selectedProduct, setSelectedProduct] = useState('ALL');
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
    const balances = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const handleExport = () => {
        const exportParams = {
            ...(selectedCustomer !== 'ALL' && { CustomerId: selectedCustomer }),
            ...(selectedProduct !== 'ALL' && { ProductId: selectedProduct })
        };
        downloadBackendCsv('/api/inventory/balances/export', exportParams, 'balanco_estoque');
    };

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden h-full">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50 shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="w-[240px]">
                        <Select value={selectedCustomer} onValueChange={(v) => { setSelectedCustomer(v); setPage(1); }}>
                            <SelectTrigger className="bg-white h-9">
                                <SelectValue placeholder="Filtrar por Depositante" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Depositantes</SelectItem>
                                {customers.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-[240px]">
                        <Select value={selectedProduct} onValueChange={(v) => { setSelectedProduct(v); setPage(1); }}>
                            <SelectTrigger className="bg-white h-9">
                                <SelectValue placeholder="Filtrar por Produto SKU" />
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

                <Button onClick={handleExport} variant="outline" size="sm" disabled={totalCount === 0} className="bg-white border-slate-200 text-slate-700">
                    <Download className="mr-2 h-4 w-4" /> Exportar CSV Completo
                </Button>
            </div>

            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-sm z-10">
                        <TableRow>
                            <TableHead>SKU / Produto</TableHead>
                            <TableHead>Depositante</TableHead>
                            <TableHead className="text-right">Esperado (Docas)</TableHead>
                            <TableHead className="text-right text-emerald-700">Disponível</TableHead>
                            <TableHead className="text-right text-amber-700">Alocado</TableHead>
                            <TableHead className="text-right text-rose-700">Quarentena</TableHead>
                            <TableHead className="text-right font-bold text-slate-900">Físico Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading || isFetching ? (
                            <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : balances.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="h-24 text-center text-slate-500">Nenhum saldo encontrado no estoque.</TableCell></TableRow>
                        ) : balances.map((b, idx) => (
                            <TableRow key={idx} className="hover:bg-slate-50/50">
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                            <Package size={16} />
                                        </div>
                                        <span className="font-bold font-mono text-slate-900">{b.productSku}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-sm text-slate-700 font-medium">{b.customerName}</TableCell>
                                <TableCell className="text-right font-mono text-slate-500">{b.totalExpected?.toLocaleString('pt-BR')}</TableCell>
                                <TableCell className="text-right font-mono font-bold text-emerald-700">{b.totalAvailable?.toLocaleString('pt-BR')}</TableCell>
                                <TableCell className="text-right font-mono font-bold text-amber-700">{b.totalAllocated?.toLocaleString('pt-BR')}</TableCell>
                                <TableCell className="text-right font-mono font-bold text-rose-700">{b.totalQuarantine?.toLocaleString('pt-BR')}</TableCell>
                                <TableCell className="text-right font-mono font-bold text-slate-900 bg-slate-50">{b.totalPhysical?.toLocaleString('pt-BR')}</TableCell>
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
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                    </div>
                </div>
            )}
        </div>
    );
}