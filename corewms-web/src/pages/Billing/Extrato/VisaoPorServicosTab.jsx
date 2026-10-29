import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Layers, Sparkles, Trash2, DollarSign } from 'lucide-react';
import {
    formatDatePtBr,
    formatNotesWithLocalTime,
    formatCurrency,
    formatUnitRate,
    formatNumber,
    extractNfeNumber,
    aggregatePackagingRows
} from './billingUtils';

export default function VisaoPorServicosTab({
    services,
    expandedServiceIds,
    toggleServiceExpand,
    expandedItemDetailId,
    setExpandedItemDetailId,
    isDraft,
    setItemToDelete
}) {
    if (!services || services.length === 0) {
        return (
            <Card className="p-8 text-center text-slate-400 italic text-xs bg-white">
                Nenhum serviço identificado com faturamento para os filtros informados.
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {services.map(serviceGroup => {
                const isExpanded = expandedServiceIds.includes(serviceGroup.serviceId);
                const isAdValorem = serviceGroup.category === 'ad_valorem';

                return (
                    <Card key={serviceGroup.serviceId} className="border-slate-200/80 bg-white shadow-2xs overflow-hidden transition-all">
                        {/* CABEÇALHO DO SERVIÇO (APENAS IDENTIFICAÇÃO E TOTAL COBRADO NO CICLO) */}
                        <div
                            onClick={() => toggleServiceExpand(serviceGroup.serviceId)}
                            className="p-4 bg-slate-50/70 hover:bg-slate-100/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer border-b"
                        >
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-slate-400 hover:text-slate-800 shrink-0"
                                >
                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </Button>

                                <div className={`p-2.5 rounded-xl shrink-0 border ${isAdValorem ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : (serviceGroup.isDaily ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200')}`}>
                                    {isAdValorem ? <DollarSign size={18} /> : <Layers size={18} />}
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-bold text-sm text-slate-900">{serviceGroup.serviceName}</h3>
                                        <Badge className={`text-[10px] font-semibold border ${serviceGroup.isDaily ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
                                            {serviceGroup.isDaily ? '⚡ Diário Automático' : '📦 Evento Operacional'}
                                        </Badge>
                                        <span className="text-xs text-slate-400 font-mono">
                                            ({serviceGroup.items.length} lançamento{serviceGroup.items.length !== 1 ? 's' : ''})
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        {isAdValorem
                                            ? 'Seguro cobrado sobre o valor patrimonial das mercadorias sob custódia'
                                            : (serviceGroup.isDaily ? 'Apuração contínua de permanência diária no armazém' : 'Tarifação por movimentação física / handling de embalagens')}
                                    </p>
                                </div>
                            </div>

                            {/* TOTAL COBRADO NO CICLO */}
                            <div className="text-right shrink-0">
                                <span className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Total Cobrado no Ciclo</span>
                                <span className="font-mono font-extrabold text-base text-emerald-700">
                                    {formatCurrency(serviceGroup.totalAmount)}
                                </span>
                            </div>
                        </div>

                        {/* LISTA LIMPA DE LANÇAMENTOS POR NOTA FISCAL */}
                        {isExpanded && (
                            <CardContent className="p-0 border-t bg-white animate-in fade-in duration-200">
                                <Table>
                                    <TableHeader className="bg-slate-50/80">
                                        <TableRow>
                                            <TableHead className="w-8"></TableHead>
                                            <TableHead className="w-28 text-xs">Data Cobrança</TableHead>
                                            <TableHead className="w-36 text-xs">Doc. Origem</TableHead>
                                            <TableHead className="text-xs">Descrição / Operação</TableHead>
                                            <TableHead className="text-right text-xs w-36">Valor R$</TableHead>
                                            <TableHead className="text-xs">Observações</TableHead>
                                            <TableHead className="text-right w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {serviceGroup.items.map(item => {
                                            const isItemDetailExpanded = expandedItemDetailId === item.id;
                                            const docNum = extractNfeNumber(item);
                                            const aggregatedPacks = aggregatePackagingRows(item.statementDataJson, item.quantityTotal, item.serviceTotal, isAdValorem);
                                            const hasStatement = Boolean(item.statementDataJson);

                                            return (
                                                <React.Fragment key={item.id}>
                                                    <TableRow className="hover:bg-slate-50/60 font-mono text-xs">
                                                        <TableCell>
                                                            {hasStatement && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setExpandedItemDetailId(isItemDetailExpanded ? null : item.id)}
                                                                    className="h-6 w-6 p-0 text-slate-400 hover:text-slate-800"
                                                                    title="Ver decomposição por embalagem"
                                                                >
                                                                    {isItemDetailExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-slate-600">
                                                            {formatDatePtBr(item.chargeDate)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {docNum && docNum !== 'Estoque Consolidado' ? (
                                                                <Badge variant="outline" className="text-[10px] font-mono bg-blue-50 text-blue-800 border-blue-200">
                                                                    {docNum}
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-[10px] text-slate-400 font-sans italic">Consolidado</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="font-sans text-slate-800 font-medium">
                                                            {item.description}
                                                        </TableCell>

                                                        {/* VALOR COBRADO */}
                                                        <TableCell className="text-right font-bold text-emerald-700">
                                                            {formatCurrency(item.serviceTotal)}
                                                        </TableCell>

                                                        <TableCell className="text-slate-500 font-sans text-[11px] truncate max-w-xs" title={item.manualNotes}>
                                                            {formatNotesWithLocalTime(item.manualNotes)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {isDraft && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setItemToDelete(item)}
                                                                    className="h-6 w-6 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                                    title="Excluir lançamento"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>

                                                    {/* TABELA EXPANDIDA COM A TARIFICAÇÃO E COMPOSIÇÃO CONSOLIDADA */}
                                                    {isItemDetailExpanded && hasStatement && (
                                                        <TableRow className="bg-slate-50/80">
                                                            <TableCell colSpan={7} className="p-3">
                                                                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                                                                    <div className="flex items-center justify-between border-b pb-1 text-xs">
                                                                        <span className="font-bold uppercase text-slate-700 flex items-center gap-1 font-sans">
                                                                            <Sparkles size={13} className="text-emerald-600" />
                                                                            {isAdValorem
                                                                                ? 'Base de Cálculo Patrimonial & Alíquota de Seguro por Embalagem'
                                                                                : 'Tarifação Consolidada por Tipo de Embalagem'}
                                                                        </span>
                                                                        <span className="font-mono text-[10px] text-slate-400">Data Ref: {formatDatePtBr(item.chargeDate)}</span>
                                                                    </div>
                                                                    <div className="max-h-48 overflow-y-auto">
                                                                        <Table>
                                                                            <TableHeader className="bg-slate-50">
                                                                                <TableRow>
                                                                                    <TableHead className="text-[10px]">Tipo</TableHead>
                                                                                    <TableHead className="text-[10px]">Descrição da Embalagem</TableHead>
                                                                                    <TableHead className="text-right text-[10px]">Volumes</TableHead>
                                                                                    {isAdValorem ? (
                                                                                        <>
                                                                                            <TableHead className="text-right text-[10px]">Base em Estoque (R$)</TableHead>
                                                                                            <TableHead className="text-right text-[10px]">Alíquota Diária</TableHead>
                                                                                        </>
                                                                                    ) : (
                                                                                        <TableHead className="text-right text-[10px]">Tarifa Unitária (R$)</TableHead>
                                                                                    )}
                                                                                    <TableHead className="text-right text-[10px]">Subtotal (R$)</TableHead>
                                                                                </TableRow>
                                                                            </TableHeader>
                                                                            <TableBody>
                                                                                {aggregatedPacks.map((rec, rIdx) => (
                                                                                    <TableRow key={rIdx} className="text-xs font-mono">
                                                                                        <TableCell>
                                                                                            <Badge variant="outline" className="text-[10px] font-bold">
                                                                                                {rec.packagingCode}
                                                                                            </Badge>
                                                                                        </TableCell>
                                                                                        <TableCell className="text-slate-700">
                                                                                            {rec.description}
                                                                                        </TableCell>
                                                                                        <TableCell className="text-right font-bold text-slate-900">
                                                                                            {formatNumber(rec.volumeCount)}
                                                                                        </TableCell>

                                                                                        {isAdValorem ? (
                                                                                            <>
                                                                                                <TableCell className="text-right font-bold text-slate-800">
                                                                                                    {formatCurrency(rec.baseCalculation)}
                                                                                                </TableCell>
                                                                                                <TableCell className="text-right text-emerald-800 font-bold">
                                                                                                    {formatUnitRate(rec.unitValue)}
                                                                                                </TableCell>
                                                                                            </>
                                                                                        ) : (
                                                                                            <TableCell className="text-right font-bold text-slate-800">
                                                                                                {formatUnitRate(rec.unitValue)}
                                                                                            </TableCell>
                                                                                        )}

                                                                                        <TableCell className="text-right font-bold text-emerald-700">
                                                                                            {formatCurrency(rec.totalValue)}
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                ))}
                                                                            </TableBody>
                                                                        </Table>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        )}
                    </Card>
                );
            })}
        </div>
    );
}