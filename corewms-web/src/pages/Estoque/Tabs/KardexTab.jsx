import { useState } from 'react';
import { useGetApiInventoryKardex } from '@/api/generated/inventory/inventory';
import { useGetApiProducts } from '@/api/generated/products/products';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, Download, ScrollText, Calendar, ArrowUpRight, ArrowDownLeft, RefreshCcw } from 'lucide-react';
import { downloadBackendCsv } from '@/lib/exportCsv';

export default function KardexTab() {
    const [searchLpn, setSearchLpn] = useState('');
    const [selectedProduct, setSelectedProduct] = useState('ALL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const { data: productsData } = useGetApiProducts({ PageSize: 100 });
    const products = productsData?.items || (Array.isArray(productsData) ? productsData : []);

    const queryParams = {
        Lpn: searchLpn,
        Page: page,
        PageSize: PAGE_SIZE,
        ...(selectedProduct !== 'ALL' && { ProductId: selectedProduct }),
        ...(startDate && { StartDate: new Date(startDate).toISOString() }),
        ...(endDate && { EndDate: new Date(endDate).toISOString() })
    };

    const { data: apiResponse, isLoading, isFetching } = useGetApiInventoryKardex(queryParams);
    const transactions = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const handleExport = () => {
        const exportParams = {
            Lpn: searchLpn,
            ...(selectedProduct !== 'ALL' && { ProductId: selectedProduct }),
            ...(startDate && { StartDate: new Date(startDate).toISOString() }),
            ...(endDate && { EndDate: new Date(endDate).toISOString() })
        };
        downloadBackendCsv('/api/inventory/kardex/export', exportParams, 'kardex_extrato_movimentacoes');
    };

    const renderEventTypeBadge = (type) => {
        const typeStr = String(type);
        if (typeStr.includes('Receipt') || typeStr.includes('Inbound')) {
            return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-mono text-[10px] flex items-center gap-1 w-fit"><ArrowDownLeft size={12} /> Entrada / Recebimento</Badge>;
        }
        if (typeStr.includes('Outbound') || typeStr.includes('Ship')) {
            return <Badge className="bg-rose-50 text-rose-700 border-rose-200 font-mono text-[10px] flex items-center gap-1 w-fit"><ArrowUpRight size={12} /> Saída / Expedição</Badge>;
        }
        if (typeStr.includes('Hold') || typeStr.includes('Quality')) {
            return <Badge className="bg-amber-50 text-amber-800 border-amber-200 font-mono text-[10px] flex items-center gap-1 w-fit"><RefreshCcw size={12} /> Trava Qualidade</Badge>;
        }
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 font-mono text-[10px]">{typeStr}</Badge>;
    };

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex flex-col overflow-hidden h-full">
            {/* PAINEL DE FILTROS */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 shrink-0">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por LPN..."
                            value={searchLpn}
                            onChange={(e) => { setSearchLpn(e.target.value); setPage(1); }}
                            className="pl-9 bg-white text-xs h-9"
                        />
                    </div>

                    <div className="w-[200px]">
                        <Select value={selectedProduct} onValueChange={(v) => { setSelectedProduct(v); setPage(1); }}>
                            <SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="SKU do Produto" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os SKUs</SelectItem>
                                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.sku} - {p.description}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 h-9">
                        <Calendar size={14} className="text-slate-400 shrink-0" />
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                            className="border-none shadow-none text-xs h-7 p-0 w-28 bg-transparent font-mono"
                        />
                        <span className="text-slate-300 text-xs">até</span>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                            className="border-none shadow-none text-xs h-7 p-0 w-28 bg-transparent font-mono"
                        />
                    </div>
                </div>

                <Button onClick={handleExport} variant="outline" size="sm" disabled={totalCount === 0} className="bg-white border-slate-200 text-slate-700 text-xs h-9">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar CSV
                </Button>
            </div>

            {/* TABELA DO KARDEX */}
            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 backdrop-blur-sm z-10">
                        <TableRow>
                            <TableHead>Data / Hora</TableHead>
                            <TableHead>SKU / LPN</TableHead>
                            <TableHead>Tipo de Evento</TableHead>
                            <TableHead className="text-right">Variação Qtd</TableHead>
                            <TableHead className="text-right">Saldo Pós-Evento</TableHead>
                            <TableHead>Doc. Origem</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading || isFetching ? (
                            <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : transactions.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-500">Nenhum evento registrado no Kardex.</TableCell></TableRow>
                        ) : transactions.map((t) => {
                            const isPositive = t.quantityChange > 0;
                            return (
                                <TableRow key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="text-xs font-mono text-slate-600">
                                        {t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : '-'}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-bold font-mono text-slate-900 text-xs">{t.productSku}</span>
                                            {t.lpn && <span className="text-[10px] font-mono text-blue-600">LPN: {t.lpn}</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell>{renderEventTypeBadge(t.type)}</TableCell>
                                    <TableCell className={`text-right font-mono font-bold text-xs ${isPositive ? 'text-emerald-600' : t.quantityChange < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                        {isPositive ? `+${t.quantityChange}` : t.quantityChange}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-xs text-slate-800">
                                        {t.balanceAfter?.toLocaleString('pt-BR')}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-500 font-mono">
                                        {t.sourceDocumentNumber || '-'}
                                    </TableCell>
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
    );
}