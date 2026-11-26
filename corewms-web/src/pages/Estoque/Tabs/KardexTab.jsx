import { useState, useMemo, useEffect } from 'react';
import { useGetApiInventoryKardex } from '@/api/generated/inventory/inventory';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Loader2, Download,
    ArrowUpRight, ArrowDownLeft, RefreshCcw,
    RotateCcw, MapPin, CheckCircle2, Columns, GitMerge, Split
} from 'lucide-react';
import { downloadBackendCsv } from '@/lib/exportCsv';

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

export default function KardexTab({ appliedFilters = {}, filterVersion = 0 }) {
    const canViewInventory = useHasPermission(['inventory:view', 'inventory:manage']);

    const [visibleColumns, setVisibleColumns] = useState({
        createdAt: true, sku: true, customer: true, lpn: true, batch: true,
        type: true, quantityChange: true, balanceAfter: true, location: true, sourceDocument: true
    });

    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    useEffect(() => {
        setPage(1);
    }, [filterVersion]);

    const queryParams = { Page: page, PageSize: PAGE_SIZE, ...appliedFilters };
    const { data: apiResponse, isLoading, isFetching } = useGetApiInventoryKardex(
        queryParams,
        { query: { enabled: canViewInventory } }
    );
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

    const toggleColumn = (columnId) => {
        setVisibleColumns(prev => ({ ...prev, [columnId]: !prev[columnId] }));
    };

    const handleExport = () => {
        if (!canViewInventory) return;
        downloadBackendCsv('/api/inventory/kardex/export', appliedFilters, 'kardex_extrato_movimentacoes');
    };

    const renderEventTypeBadge = (type) => {
        const typeStr = String(type);
        switch (typeStr) {
            case 'Inbound_Receipt':
            case '1':
                return (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <ArrowDownLeft size={12} /> Entrada
                    </Badge>
                );
            case 'Inventory_Adjustment_In':
            case '2':
                return (
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-300 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <ArrowDownLeft size={12} /> Ajuste Entrada (+)
                    </Badge>
                );
            case 'Internal_Move':
            case '3':
                return (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <MapPin size={12} /> Movimentação Interna
                    </Badge>
                );
            case 'Quality_Hold':
            case '4':
                return (
                    <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <RefreshCcw size={12} /> Retenção Qualidade
                    </Badge>
                );
            case 'Quality_Release':
            case '5':
                return (
                    <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <CheckCircle2 size={12} /> Liberação Qualidade
                    </Badge>
                );
            case 'Outbound_Closed':
            case 'Outbound_FullPallet':
            case '6':
                return (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <ArrowUpRight size={12} /> Saída Fechada
                    </Badge>
                );
            case 'Outbound_FullBox':
            case '7':
                return (
                    <Badge className="bg-purple-50 text-purple-700 border-purple-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <ArrowUpRight size={12} /> Saída Fechada
                    </Badge>
                );
            case 'Outbound_Fractional':
            case '8':
                return (
                    <Badge className="bg-orange-100 text-orange-800 border-orange-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <ArrowUpRight size={12} /> Saída Fracionada
                    </Badge>
                );
            case 'Inventory_Adjustment_Out':
            case '9':
                return (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <ArrowUpRight size={12} /> Ajuste Saída (-)
                    </Badge>
                );
            case 'Hu_Merge':
            case '10':
                return (
                    <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <GitMerge size={12} /> Agrupamento (Merge)
                    </Badge>
                );
            case 'Hu_Split':
            case '11':
                return (
                    <Badge className="bg-cyan-100 text-cyan-800 border-cyan-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <Split size={12} /> Transbordo (Split)
                    </Badge>
                );
            case 'Outbound_Shipment_Revert':
            case '12':
                return (
                    <Badge className="bg-teal-100 text-teal-800 border-teal-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <RotateCcw size={12} /> Estorno Expedição
                    </Badge>
                );
            case 'Inbound_Receipt_Rollback':
            case '13':
                return (
                    <Badge className="bg-red-100 text-red-800 border-red-200 font-mono text-[10px] flex items-center gap-1 w-fit">
                        <RotateCcw size={12} /> Estorno Recebimento
                    </Badge>
                );
            default:
                return <Badge variant="outline" className="bg-slate-50 text-slate-700 font-mono text-[10px]">{typeStr}</Badge>;
        }
    };

    return (
        <div className="flex flex-col space-y-4 h-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
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

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button type="button" variant="outline" className="text-xs font-semibold h-9 bg-white border-slate-200 cursor-pointer">
                                    <Columns size={14} className="mr-1.5 text-slate-600" />Colunas
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-3 bg-white border border-slate-200 shadow-xl rounded-xl space-y-2">
                                <span className="text-xs font-bold text-slate-800 block border-b pb-1">Exibir Colunas</span>
                                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                    {KARDEX_COLUMN_DEFINITIONS.map(col => (
                                        <label key={col.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 p-1 rounded">
                                            <Checkbox checked={visibleColumns[col.id]} onCheckedChange={() => toggleColumn(col.id)} />
                                            <span>{col.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {canViewInventory && (
                        <Button type="button" onClick={handleExport} variant="outline" size="sm" disabled={totalCount === 0} className="bg-white border-slate-200 text-slate-700 text-xs h-9 cursor-pointer">
                            <Download className="mr-1 h-3.5 w-3.5" /> CSV
                        </Button>
                    )}
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10 backdrop-blur-sm">
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
                                <TableRow><TableCell colSpan={10} className="h-32 text-center text-slate-500">Nenhuma movimentação encontrada para os filtros aplicados.</TableCell></TableRow>
                            ) : transactions.map((t) => {
                                const isPositive = (t.quantityChange || 0) > 0;
                                const isNegative = (t.quantityChange || 0) < 0;

                                return (
                                    <TableRow key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                        {visibleColumns.createdAt && (
                                            <TableCell className="text-xs font-mono text-slate-600">
                                                {t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : '-'}
                                            </TableCell>
                                        )}

                                        {visibleColumns.sku && (
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold font-mono text-slate-900 text-xs">{t.productSku}</span>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[200px]" title={t.productDescription}>{t.productDescription}</span>
                                                </div>
                                            </TableCell>
                                        )}

                                        {visibleColumns.customer && (
                                            <TableCell className="text-xs text-slate-700 font-medium">{t.customerName}</TableCell>
                                        )}

                                        {visibleColumns.lpn && (
                                            <TableCell>
                                                {t.handlingUnitLpn ? (
                                                    <span className="font-mono font-bold text-purple-700 text-xs">{t.handlingUnitLpn}</span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">-</span>
                                                )}
                                            </TableCell>
                                        )}

                                        {visibleColumns.batch && (
                                            <TableCell className="text-xs font-mono text-slate-600">
                                                <div>Lote: {t.batch || '-'}</div>
                                                <div>Val: {formatCivilDate(t.expirationDate)}</div>
                                            </TableCell>
                                        )}

                                        {visibleColumns.type && (
                                            <TableCell>{renderEventTypeBadge(t.type)}</TableCell>
                                        )}

                                        {visibleColumns.quantityChange && (
                                            <TableCell className={`text-right font-mono font-bold text-xs ${isPositive ? 'text-emerald-700' : isNegative ? 'text-rose-700' : 'text-slate-600'}`}>
                                                {isPositive ? `+${t.quantityChange?.toLocaleString('pt-BR')}` : t.quantityChange?.toLocaleString('pt-BR')}
                                            </TableCell>
                                        )}

                                        {visibleColumns.balanceAfter && (
                                            <TableCell className="text-right font-mono font-bold text-xs text-slate-900 bg-slate-50/50">
                                                {t.balanceAfter?.toLocaleString('pt-BR')}
                                            </TableCell>
                                        )}

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