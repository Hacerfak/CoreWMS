import { useState } from 'react';
import { useGetApiInventoryHandlingUnits } from '@/api/generated/inventory/inventory';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Download, Layers, MapPin } from 'lucide-react';
import { downloadBackendCsv } from '@/lib/exportCsv';

export default function HandlingUnitsTab() {
    const [searchLpn, setSearchLpn] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    const queryParams = {
        Lpn: searchLpn,
        Page: page,
        PageSize: PAGE_SIZE
    };

    const { data: apiResponse, isLoading, isFetching } = useGetApiInventoryHandlingUnits(queryParams);
    const hus = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const handleExport = () => {
        downloadBackendCsv('/api/inventory/handling-units/export', { Lpn: searchLpn }, 'unidades_manuseio_hus');
    };

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden h-full">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/50 shrink-0">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Buscar por Código LPN..."
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
                            <TableHead>LPN</TableHead>
                            <TableHead>Depositante / SKU</TableHead>
                            <TableHead>Endereço Físico</TableHead>
                            <TableHead>Lote / Validade</TableHead>
                            <TableHead className="text-right">Qtd Atual</TableHead>
                            <TableHead>Status / Qualidade</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading || isFetching ? (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : hus.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">Nenhuma HU encontrada.</TableCell></TableRow>
                        ) : hus.map((h) => (
                            <TableRow key={h.id} className="hover:bg-slate-50/50">
                                <TableCell>
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                            <Layers size={16} />
                                        </div>
                                        <span className="font-bold font-mono text-slate-900">{h.lpn}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-slate-800">{h.productSku}</span>
                                        <span className="text-xs text-slate-400">{h.customerName}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {h.locationPath ? (
                                        <Badge variant="outline" className="bg-slate-50 font-mono text-slate-700 gap-1">
                                            <MapPin size={12} className="text-blue-600" /> {h.locationPath}
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-slate-400 italic">Em trânsito</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-slate-600">
                                    <div>Lote: {h.batch || '-'}</div>
                                    <div>Val: {h.expirationDate ? new Date(h.expirationDate).toLocaleDateString('pt-BR') : '-'}</div>
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-slate-900 text-sm">
                                    {h.currentQuantity?.toLocaleString('pt-BR')} {h.packagingTypeCode}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1 w-fit">
                                        <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">{h.status}</Badge>
                                        <Badge className={h.qualityStatus === 'Available' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]' : 'bg-rose-100 text-rose-800 border-rose-200 text-[10px]'}>
                                            {h.qualityStatus}
                                        </Badge>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {totalCount > 0 && (
                <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0 text-xs text-slate-500">
                    <span>Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} HUs</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                    </div>
                </div>
            )}
        </div>
    );
}