import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { downloadBackendCsv } from '@/lib/exportCsv';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
    ArrowLeft, Receipt, Calendar, Download, Lock, RefreshCw,
    Plus, Loader2, CheckCircle2, ChevronDown, ChevronRight, FileText,
    TrendingUp, ShieldCheck, Sparkles, AlertCircle, Building2
} from 'lucide-react';
import { toast } from 'sonner';

export default function ExtratoFaturamentoPage() {
    const { id: cycleId } = useParams();
    const navigate = useNavigate();

    const [cycle, setCycle] = useState(null);
    const [services, setServices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedItemId, setExpandedItemId] = useState(null);

    // Modal de Lançamento Manual
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [totalValue, setTotalValue] = useState(0);
    const [manualNotes, setManualNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Utilitário para formatar datas UTC sem retroceder o dia devido ao fuso horário
    const formatDatePtBr = (dateValue) => {
        if (!dateValue) return '-';
        if (typeof dateValue === 'string') {
            const clean = dateValue.split('T')[0];
            const parts = clean.split('-');
            if (parts.length === 3) {
                const [year, month, day] = parts;
                return `${day}/${month}/${year}`;
            }
        }
        return new Date(dateValue).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };

    const loadCycleDetails = async () => {
        try {
            setIsLoading(true);
            const [cycleRes, servicesRes] = await Promise.all([
                customInstance({ url: `/api/billing/cycles/${cycleId}`, method: 'GET' }),
                customInstance({ url: '/api/billing/services', method: 'GET' })
            ]);

            setCycle(cycleRes);
            setServices(Array.isArray(servicesRes) ? servicesRes : []);
        } catch {
            toast.error('Erro ao carregar detalhes do ciclo de faturamento.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (cycleId) loadCycleDetails();
    }, [cycleId]);

    // Recalcular Ciclo Automático
    const handleRecalculateCycle = async () => {
        if (!cycle) return;
        try {
            setIsLoading(true);
            await customInstance({
                url: '/api/billing/cycles/generate',
                method: 'POST',
                data: {
                    customerId: cycle.customerId,
                    referenceMonth: cycle.referenceMonth,
                    startDate: cycle.startDate,
                    endDate: cycle.endDate
                }
            });
            toast.success('Motor executado! Diárias recalculadas e apontamentos operacionais preservados.');
            loadCycleDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao recalcular ciclo.');
            setIsLoading(false);
        }
    };

    // Fechar Ciclo
    const handleCloseCycle = async () => {
        if (!confirm('Deseja realmente encerrar este ciclo de faturamento? Após o fechamento, o extrato fica congelado para envio ao ERP.')) return;
        try {
            await customInstance({ url: `/api/billing/cycles/${cycleId}/close`, method: 'POST' });
            toast.success('Ciclo de faturamento encerrado e congelado com sucesso!');
            loadCycleDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao fechar ciclo.');
        }
    };

    // Lançamento Manual
    const handleSaveManualItem = async (e) => {
        e.preventDefault();
        if (!selectedServiceId || !description) return;

        try {
            setIsSubmitting(true);
            await customInstance({
                url: `/api/billing/cycles/${cycleId}/items/manual`,
                method: 'POST',
                data: {
                    billingServiceId: selectedServiceId,
                    description: description.trim(),
                    quantityTotal: Number(quantity),
                    serviceTotal: Number(totalValue),
                    manualNotes: manualNotes.trim()
                }
            });

            toast.success('Lançamento manual adicionado ao extrato!');
            setIsManualModalOpen(false);
            setSelectedServiceId('');
            setDescription('');
            setQuantity(1);
            setTotalValue(0);
            setManualNotes('');
            loadCycleDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao gravar lançamento manual.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExport = () => {
        downloadBackendCsv(`/api/billing/cycles/${cycleId}/export`, {}, `extrato_faturamento_${cycle?.referenceMonth?.replace('/', '_')}`);
    };

    // KPIs Analíticos da Fatura
    const metrics = useMemo(() => {
        if (!cycle?.items) return { dailyTotal: 0, eventsTotal: 0, manualTotal: 0 };

        let dailyTotal = 0;
        let eventsTotal = 0;
        let manualTotal = 0;

        cycle.items.forEach(i => {
            const val = Number(i.serviceTotal) || 0;
            if (i.manualNotes && !i.statementDataJson) {
                manualTotal += val;
            } else if (i.description?.includes('Expedição') || i.description?.includes('Stretch') || i.description?.includes('Recebimento') || i.description?.includes('NF')) {
                eventsTotal += val;
            } else {
                dailyTotal += val;
            }
        });

        return { dailyTotal, eventsTotal, manualTotal };
    }, [cycle]);

    if (isLoading && !cycle) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando extrato de faturamento analítico...</p>
            </div>
        );
    }

    const isDraft = cycle?.status === 'Draft' || cycle?.status === '1';

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/billing/tarifas-ciclos')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold tracking-tight text-slate-900">
                                Extrato de Faturamento - {cycle?.customerName}
                            </h1>
                            <Badge className={`text-xs ${isDraft ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                                {isDraft ? '🟢 Aberto (Acumulando)' : '🔒 Fatura Congelada'}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Competência Contábil: <strong className="font-mono text-slate-800">{cycle?.referenceMonth}</strong> ({formatDatePtBr(cycle?.startDate)} a {formatDatePtBr(cycle?.endDate)})
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button onClick={handleExport} variant="outline" size="sm" className="bg-white text-slate-700 h-9 font-medium">
                        <Download className="mr-1.5 h-4 w-4 text-slate-500" /> Exportar CSV
                    </Button>

                    {isDraft && (
                        <>
                            <Button onClick={handleRecalculateCycle} variant="outline" size="sm" className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 h-9 font-semibold">
                                <RefreshCw className="mr-1.5 h-4 w-4" /> Recalcular Motor
                            </Button>
                            <Button onClick={() => setIsManualModalOpen(true)} variant="outline" size="sm" className="bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 h-9 font-semibold">
                                <Plus className="mr-1.5 h-4 w-4" /> Lançamento Extra
                            </Button>
                            <Button onClick={handleCloseCycle} size="sm" className="bg-slate-900 hover:bg-slate-800 text-white h-9 font-semibold">
                                <Lock className="mr-1.5 h-4 w-4" /> Fechar Ciclo
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* CARDS DE RESUMO FINANCEIRO ANALÍTICO */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-emerald-200 bg-emerald-50/30 shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-emerald-800 uppercase flex items-center justify-between">
                            <span>Total Geral da Fatura</span>
                            <TrendingUp size={16} className="text-emerald-700" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-emerald-800">
                            {(cycle?.totalAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        <span className="text-[10px] text-emerald-600 font-mono">{cycle?.items?.length || 0} lançamentos consolidados</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Diárias (Armaz. / Seguro)</span>
                            <Calendar size={16} className="text-purple-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-purple-800">
                            {metrics.dailyTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        <span className="text-[10px] text-slate-400">Apuração contínua noturna</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Eventos (Entrada / Saída)</span>
                            <Receipt size={16} className="text-blue-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-blue-800">
                            {metrics.eventsTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        <span className="text-[10px] text-slate-400">Handling In/Out e Stretch</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Lançamentos Avulsos</span>
                            <Plus size={16} className="text-amber-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-amber-800">
                            {metrics.manualTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        <span className="text-[10px] text-slate-400">Serviços adicionais manuais</span>
                    </CardContent>
                </Card>
            </div>

            {/* TABELA DO EXTRATO CONSOLIDADO */}
            <Card className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <CardHeader className="p-4 border-b bg-slate-50/60 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                        <FileText size={16} className="text-emerald-600" /> Extrato Analítico dos Serviços Prestados
                    </CardTitle>
                    <span className="text-[11px] text-slate-500 font-mono">
                        Clique na seta lateral para visualizar as ocorrências detalhadas de cada item
                    </span>
                </CardHeader>

                <CardContent className="p-0 overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-10"></TableHead>
                                <TableHead>Serviço / Descrição da Operação</TableHead>
                                <TableHead className="text-right">Volume / Quantidade</TableHead>
                                <TableHead className="text-right">Valor Total R$</TableHead>
                                <TableHead>Observações / Justificativas</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {cycle?.items?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-28 text-center text-xs text-slate-400 italic">
                                        Nenhum serviço bilhetado neste ciclo até o momento.
                                    </TableCell>
                                </TableRow>
                            ) : cycle?.items?.map((item) => {
                                const isExpanded = expandedItemId === item.id;
                                const hasStatement = Boolean(item.statementDataJson);
                                let parsedStatement = [];

                                if (hasStatement) {
                                    try {
                                        const parsed = JSON.parse(item.statementDataJson);
                                        parsedStatement = Array.isArray(parsed) ? parsed : [parsed];
                                    } catch {
                                        parsedStatement = [];
                                    }
                                }

                                return (
                                    <>
                                        <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                            <TableCell>
                                                {hasStatement && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                                                        className="h-6 w-6 p-0 text-slate-400 hover:text-slate-800"
                                                    >
                                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    </Button>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs font-semibold text-slate-900">
                                                <div className="flex items-center gap-2">
                                                    <FileText size={14} className="text-emerald-600 shrink-0" />
                                                    <span>{item.description || item.serviceName}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs font-bold text-slate-800">
                                                {(item.quantityTotal || 0).toLocaleString('pt-BR')}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold text-emerald-700 text-sm">
                                                {(item.serviceTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-500 italic">
                                                {item.manualNotes || '-'}
                                            </TableCell>
                                        </TableRow>

                                        {/* TABELA DE OCORRÊNCIAS EXPANDIDA */}
                                        {isExpanded && hasStatement && (
                                            <TableRow key={`${item.id}-detail`} className="bg-slate-50/80">
                                                <TableCell colSpan={5} className="p-4">
                                                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                                                        <div className="flex items-center justify-between border-b pb-2">
                                                            <span className="font-bold text-xs uppercase text-slate-800 flex items-center gap-1.5">
                                                                <Sparkles size={14} className="text-emerald-600" />
                                                                Detalhamento Analítico das Ocorrências ({parsedStatement.length} registros apurados)
                                                            </span>
                                                            <Badge variant="outline" className="font-mono text-[10px]">Rastreabilidade Contratual</Badge>
                                                        </div>

                                                        <div className="border border-slate-100 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                                                            <Table>
                                                                <TableHeader className="bg-slate-50">
                                                                    <TableRow>
                                                                        <TableHead className="text-xs">Data / Referência</TableHead>
                                                                        <TableHead className="text-xs">Tipo de Volume</TableHead>
                                                                        <TableHead className="text-xs">Identificador / Ordem / Detalhes</TableHead>
                                                                        <TableHead className="text-right text-xs">Quantidade</TableHead>
                                                                        <TableHead className="text-right text-xs">Valor R$</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {parsedStatement.map((rec, rIdx) => (
                                                                        <TableRow key={rIdx} className="hover:bg-slate-50/50 text-xs font-mono">
                                                                            <TableCell className="text-slate-600">{rec.DATA || rec.CreatedAt || '-'}</TableCell>
                                                                            <TableCell className="font-bold text-slate-800">{rec.TIPO_VOLUME || rec.PackagingCode || '-'}</TableCell>
                                                                            <TableCell className="text-slate-700">{rec.DESCRICAO || (rec.OrderNumber ? `Pedido #${rec.OrderNumber}` : (rec.InboundOrderId ? `NF Entrada #${rec.InboundOrderId}` : 'Apuração Operacional'))}</TableCell>
                                                                            <TableCell className="text-right font-bold text-slate-900">{rec.VOLUME || rec.VolumeCount || rec.QUANTIDADE || 1}</TableCell>
                                                                            <TableCell className="text-right font-bold text-emerald-700">
                                                                                {(rec.VALOR_TOTAL || rec.VALOR_DIARIA || rec.TotalAmount || item.serviceTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
                                    </>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* MODAL DE LANÇAMENTO MANUAL EXTRA */}
            <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Plus className="text-emerald-600" size={20} /> Lançamento Extra no Ciclo
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Adicione serviços ad-hoc executados no período (ex: descarte de paletes, etiquetagem especial, horas extras).
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveManualItem} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Serviço Logístico *</Label>
                            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                                <SelectTrigger className="bg-white text-xs h-9"><SelectValue placeholder="Escolha o serviço..." /></SelectTrigger>
                                <SelectContent>
                                    {services.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Descrição / Justificativa *</Label>
                            <Input
                                placeholder="Ex: Mão de obra extra para re-etiquetagem"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="bg-white text-xs h-9"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Quantidade Total *</Label>
                                <Input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(Number(e.target.value))}
                                    className="bg-white font-mono text-xs h-9"
                                    min="1"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Valor Total R$ *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={totalValue}
                                    onChange={(e) => setTotalValue(Number(e.target.value))}
                                    className="bg-white font-mono text-xs h-9"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Observações Manuais (Auditoria)</Label>
                            <Input
                                placeholder="Aprovado por e-mail pelo cliente"
                                value={manualNotes}
                                onChange={(e) => setManualNotes(e.target.value)}
                                className="bg-white text-xs h-9"
                            />
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsManualModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                                Gravar Lançamento
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}