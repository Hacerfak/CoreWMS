import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Package, Calendar, Clock } from 'lucide-react';
import {
    formatDatePtBr,
    formatCurrency,
    formatUnitRate,
    formatNumber
} from './billingUtils';

export default function VisaoPorNfeTab({
    nfes,
    expandedNfeKeys,
    toggleNfeExpand
}) {
    // Controla as datas expandidas dentro de cada NF-e (chave: "nfe_data")
    const [expandedDates, setExpandedDates] = useState([]);

    const toggleDateExpand = (dateKey) => {
        setExpandedDates(prev =>
            prev.includes(dateKey) ? prev.filter(k => k !== dateKey) : [...prev, dateKey]
        );
    };

    if (!nfes || nfes.length === 0) {
        return (
            <Card className="p-8 text-center text-slate-400 italic text-xs bg-white">
                Nenhuma NF-e de entrada identificada com cobranças neste ciclo.
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {nfes.map(nfeGroup => {
                const isExpandedNfe = expandedNfeKeys.includes(nfeGroup.nfeNumber);

                // Agrupa as ocorrências da NF-e por Data Civil
                const occurrencesByDate = useMemo(() => {
                    const map = {};
                    (nfeGroup.occurrences || []).forEach(occ => {
                        const dateStr = formatDatePtBr(occ.date);
                        if (!map[dateStr]) {
                            map[dateStr] = {
                                rawDate: occ.date,
                                formattedDate: dateStr,
                                totalAmount: 0,
                                totalVolume: 0,
                                items: []
                            };
                        }
                        map[dateStr].totalAmount += Number(occ.amount || 0);
                        map[dateStr].totalVolume += Number(occ.volume || 0);
                        map[dateStr].items.push(occ);
                    });

                    // Ordena cronologicamente (da entrada para os dias seguintes)
                    return Object.values(map).sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate));
                }, [nfeGroup.occurrences]);

                return (
                    <Card key={nfeGroup.nfeNumber} className="border-slate-200/80 bg-white shadow-2xs overflow-hidden transition-all">
                        {/* CABEÇALHO LIMPO DA NF-E */}
                        <div
                            onClick={() => toggleNfeExpand(nfeGroup.nfeNumber)}
                            className="p-4 bg-slate-50/70 hover:bg-slate-100/60 transition-colors border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                        >
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-slate-400 hover:text-slate-800 shrink-0"
                                >
                                    {isExpandedNfe ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </Button>

                                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
                                    <Package size={20} />
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-bold text-sm text-slate-900 font-mono">
                                            {nfeGroup.nfeNumber}
                                        </h3>
                                        <Badge variant="outline" className="text-[10px] bg-white font-mono">
                                            Entrada: {formatDatePtBr(nfeGroup.entryDate)}
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 font-mono">
                                            {occurrencesByDate.length} dia{occurrencesByDate.length !== 1 ? 's' : ''} apurado{occurrencesByDate.length !== 1 ? 's' : ''} ({nfeGroup.occurrences.length} lançamento{nfeGroup.occurrences.length !== 1 ? 's' : ''})
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Custódia e faturamento acumulado desta Nota Fiscal no ciclo
                                    </p>
                                </div>
                            </div>

                            {/* VALOR TOTAL ACUMULADO DA NF */}
                            <div className="text-right shrink-0">
                                <span className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Total Faturado da Nota</span>
                                <span className="text-lg font-bold font-mono text-emerald-700">
                                    {formatCurrency(nfeGroup.totalAmount)}
                                </span>
                            </div>
                        </div>

                        {/* DETALHAMENTO: CRONOLOGIA AGRUPADA POR DATA */}
                        {isExpandedNfe && (
                            <CardContent className="p-4 bg-white space-y-3">
                                <div className="flex items-center justify-between text-xs text-slate-600 font-medium pb-1 border-b border-slate-100">
                                    <span className="flex items-center gap-1.5 font-bold uppercase text-slate-700 text-[11px]">
                                        <Clock size={14} className="text-blue-600" /> Cronologia Diária de Faturamento da NF-e
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                        Clique no dia para expandir os serviços apurados
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    {occurrencesByDate.map(dayGroup => {
                                        const dateKey = `${nfeGroup.nfeNumber}_${dayGroup.formattedDate}`;
                                        const isDateExpanded = expandedDates.includes(dateKey);

                                        return (
                                            <div
                                                key={dateKey}
                                                className="border border-slate-200/90 rounded-xl overflow-hidden transition-all bg-white shadow-2xs"
                                            >
                                                {/* BARRA DO DIA */}
                                                <div
                                                    onClick={() => toggleDateExpand(dateKey)}
                                                    className="p-3 bg-slate-50/80 hover:bg-slate-100/70 transition-colors flex items-center justify-between cursor-pointer border-b border-slate-200/60"
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-800 shrink-0"
                                                        >
                                                            {isDateExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        </Button>

                                                        <div className="p-1.5 rounded-lg bg-white border border-slate-200 text-blue-600 shrink-0">
                                                            <Calendar size={13} />
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono font-bold text-xs text-slate-900">
                                                                {dayGroup.formattedDate}
                                                            </span>
                                                            <Badge variant="outline" className="text-[10px] bg-white font-mono text-slate-600">
                                                                {dayGroup.items.length} serviço{dayGroup.items.length !== 1 ? 's' : ''}
                                                            </Badge>
                                                        </div>
                                                    </div>

                                                    <div className="text-right">
                                                        <span className="text-[10px] text-slate-400 block uppercase font-mono">Subtotal do Dia</span>
                                                        <span className="font-mono font-bold text-xs text-emerald-700">
                                                            {formatCurrency(dayGroup.totalAmount)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* TABELA DE SERVIÇOS DO DIA (SEM A COLUNA REDUNDANTE DE VOLUME) */}
                                                {isDateExpanded && (
                                                    <div className="p-0 bg-white animate-in fade-in duration-150">
                                                        <Table>
                                                            <TableHeader className="bg-slate-50/60">
                                                                <TableRow>
                                                                    <TableHead className="text-[11px] w-48">Serviço / Categoria</TableHead>
                                                                    <TableHead className="text-[11px]">Descrição da Operação</TableHead>
                                                                    <TableHead className="text-[11px]">Composição & Tarifas</TableHead>
                                                                    <TableHead className="text-right text-[11px] w-32">Valor R$</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {dayGroup.items.map((occ, oIdx) => {
                                                                    const isAdValorem = occ.type.toLowerCase().includes('ad-valorem') || occ.type.toLowerCase().includes('seguro');

                                                                    return (
                                                                        <TableRow key={oIdx} className="hover:bg-slate-50/60 text-xs font-mono">
                                                                            <TableCell>
                                                                                <Badge className={`text-[10px] font-semibold border ${occ.type.includes('Recebimento') ? 'bg-blue-50 text-blue-800 border-blue-200' : (occ.type.includes('Armazenagem') ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200')}`}>
                                                                                    {occ.type}
                                                                                </Badge>
                                                                            </TableCell>
                                                                            <TableCell className="text-slate-700 font-sans font-medium">
                                                                                {occ.description}
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                <div className="flex gap-1.5 flex-wrap items-center">
                                                                                    {occ.detailedPacks.map((p, pIdx) => (
                                                                                        <Badge key={pIdx} variant="outline" className="text-[9px] bg-slate-50 text-slate-700 border-slate-300">
                                                                                            <strong>{formatNumber(p.volumeCount)}</strong>&nbsp;{p.packagingCode}
                                                                                            {isAdValorem ? (
                                                                                                p.baseCalculation > 0 && (
                                                                                                    <span className="text-slate-600 font-semibold ml-1">
                                                                                                        (Base: {formatCurrency(p.baseCalculation)})
                                                                                                    </span>
                                                                                                )
                                                                                            ) : (
                                                                                                p.unitValue > 0 && (
                                                                                                    <span className="text-emerald-700 ml-1">
                                                                                                        ({formatUnitRate(p.unitValue)})
                                                                                                    </span>
                                                                                                )
                                                                                            )}
                                                                                        </Badge>
                                                                                    ))}

                                                                                    {/* ALÍQUOTA DIÁRIA DESTACADA NO AD-VALOREM */}
                                                                                    {isAdValorem && occ.detailedPacks[0]?.unitValue > 0 && (
                                                                                        <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-800 border-emerald-200 font-mono">
                                                                                            Alíquota: {formatUnitRate(occ.detailedPacks[0].unitValue)}
                                                                                        </Badge>
                                                                                    )}
                                                                                </div>
                                                                            </TableCell>
                                                                            <TableCell className="text-right font-bold text-emerald-700">
                                                                                {formatCurrency(occ.amount)}
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    );
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        )}
                    </Card>
                );
            })}
        </div>
    );
}