import { useState } from 'react';
import { useGetApiInventoryKardex } from '@/api/generated/inventory/inventory';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Download } from 'lucide-react';
import { downloadBackendCsv } from '@/lib/exportCsv';

export default function KardexTab() {
    const [searchLpn, setSearchLpn] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const queryParams = {
        Lpn: searchLpn,
        Page: page,
        PageSize: PAGE_SIZE
    };

    const { data: apiResponse, isLoading, isFetching } = useGetApiInventoryKardex(queryParams);
    const transactions = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const handleExport = () => {
        downloadBackendCsv('/api/inventory/kardex/export', { Lpn: searchLpn }, 'kardex_extrato_movimentacoes');
    };

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden h-full">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50 shrink-0">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Filtrar movimentações por LPN..."
                        value={searchLpn}
                        onChange={(e) => { setSearchLpn(e.target.value); setPage(1); }}
                        className="pl-9 bg-white"
                    />
                </div>

                <Button onClick={handleExport} variant="outline" size="sm" disabled={totalCount === 0} className="bg-white border-slate-200 text-slate-700">
                    <Download className="mr-2 h-4 w-4" /> Exportar CSV Completo
                </Button>
            </div>

            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-sm z-10">
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
                            <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : transactions.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">Nenhum evento registrado no Kardex.</TableCell></TableRow>
                        ) : transactions.map((t) => {
                            const isPositive = t.quantityChange > 0;
                            return (
                                <TableRow key={t.id} className="hover:bg-slate-50/50">
                                    <TableCell className="text-xs font-mono text-slate-600">
                                        {t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : '-'}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-bold font-mono text-slate-900">{t.productSku}</span>
                                            {t.lpn && <span className="text-[10px] font-mono text-blue-600">LPN: {t.lpn}</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="bg-slate-50 text-slate-800 font-mono text-[10px]">
                                            {t.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className={`text-right font-mono font-bold text-sm ${isPositive ? 'text-emerald-600' : t.quantityChange < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                        {isPositive ? `+${t.quantityChange}` : t.quantityChange}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold text-slate-800">
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
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                    </div>
                </div>
            )}
        </div>
    );
}