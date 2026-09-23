import { useEffect, useState } from 'react';
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
    Plus, Loader2, CheckCircle2, ChevronDown, ChevronRight, FileText
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

    const loadCycleDetails = async () => {
        try {
            setIsLoading(true);
            const [cycleRes, servicesRes] = await Promise.all([
                customInstance({ url: `/api/billing/cycles/${cycleId}`, method: 'GET' }),
                customInstance({ url: '/api/billing/services', method: 'GET' })
            ]);

            setCycle(cycleRes);
            setServices(servicesRes || []);
        } catch (error) {
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
            toast.success('Ciclo recalculado com sucesso!');
            loadCycleDetails();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao recalcular ciclo.');
            setIsLoading(false);
        }
    };

    // Fechar Ciclo
    const handleCloseCycle = async () => {
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

    if (isLoading && !cycle) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
        );
    }

    const isDraft = cycle?.status === 'Draft';

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/billing/tarifas-ciclos')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                                Extrato de Faturamento - {cycle?.customerName}
                            </h1>
                            <Badge className={`text-xs ${isDraft ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                                {isDraft ? '🟢 Aberto (Rascunho)' : '🔒 Encerrado'}
                            </Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Competência: <strong className="font-mono text-slate-800">{cycle?.referenceMonth}</strong> ({new Date(cycle?.startDate).toLocaleDateString('pt-BR')} a {new Date(cycle?.endDate).toLocaleDateString('pt-BR')})
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button onClick={handleExport} variant="outline" size="sm" className="bg-white">
                        <Download className="mr-2 h-4 w-4" /> Exportar CSV
                    </Button>

                    {isDraft && (
                        <>
                            <Button onClick={handleRecalculateCycle} variant="outline" size="sm" className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50">
                                <RefreshCw className="mr-2 h-4 w-4" /> Recalcular Motor
                            </Button>
                            <Button onClick={() => setIsManualModalOpen(true)} variant="outline" size="sm" className="bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                                <Plus className="mr-2 h-4 w-4" /> Lançamento Manual
                            </Button>
                            <Button onClick={handleCloseCycle} size="sm" className="bg-slate-900 hover:bg-slate-800 text-white">
                                <Lock className="mr-2 h-4 w-4" /> Encerrar Faturamento
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* CARD DE RESUMO FINANCEIRO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-slate-200/80 bg-white">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-slate-500 uppercase">Valor Total Acumulado</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold font-mono text-emerald-700">R$ {cycle?.totalAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></CardContent>
                </Card>
                <Card className="border-slate-200/80 bg-white">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-slate-500 uppercase">Serviços Apurados</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold font-mono text-slate-900">{cycle?.items?.length || 0} Itens</p></CardContent>
                </Card>
                <Card className="border-slate-200/80 bg-white">
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-slate-500 uppercase">Status do Ciclo</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold text-slate-800">{isDraft ? 'Aberto para Ajustes' : 'Congelado para ERP'}</p></CardContent>
                </Card>
            </div>

            {/* TABELA DO EXTRATO */}
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/80">
                        <TableRow>
                            <TableHead className="w-10"></TableHead>
                            <TableHead>Serviço / Descrição</TableHead>
                            <TableHead className="text-right">Volume / Quantidade</TableHead>
                            <TableHead className="text-right">Valor Total R$</TableHead>
                            <TableHead>Anotações Manuais</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {cycle?.items?.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="h-28 text-center text-slate-500">Nenhum item bilhetado para este ciclo.</TableCell></TableRow>
                        ) : cycle?.items?.map((item) => {
                            const isExpanded = expandedItemId === item.id;
                            const hasStatement = Boolean(item.statementDataJson);
                            let parsedStatement = [];
                            try {
                                if (hasStatement) parsedStatement = JSON.parse(item.statementDataJson);
                            } catch { }

                            return (
                                <>
                                    <TableRow key={item.id} className="hover:bg-slate-50/60">
                                        <TableCell>
                                            {hasStatement && (
                                                <Button
                                                    variant="ghost" size="sm"
                                                    onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                                                    className="h-6 w-6 p-0 text-slate-500"
                                                >
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </Button>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-semibold text-slate-900 text-xs">
                                            <div className="flex items-center gap-2">
                                                <FileText size={14} className="text-emerald-600 shrink-0" />
                                                <span>{item.serviceName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs font-bold text-slate-800">
                                            {item.quantityTotal?.toLocaleString('pt-BR')}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-emerald-700 text-sm">
                                            R$ {item.serviceTotal?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500 italic">
                                            {item.manualNotes || '-'}
                                        </TableCell>
                                    </TableRow>

                                    {/* DETALHE DO JSON EXPANDIDO */}
                                    {isExpanded && hasStatement && (
                                        <TableRow key={`${item.id}-detail`} className="bg-slate-50/80">
                                            <TableCell colSpan={5} className="p-4">
                                                <div className="p-3 bg-white border rounded-lg shadow-inner text-xs space-y-2 max-h-60 overflow-y-auto">
                                                    <p className="font-bold text-slate-700 border-b pb-1">Detalhamento das Ocorrências ({parsedStatement.length} registros):</p>
                                                    <pre className="font-mono text-[10px] text-slate-600 whitespace-pre-wrap">
                                                        {JSON.stringify(parsedStatement, null, 2)}
                                                    </pre>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* MODAL DE LANÇAMENTO MANUAL */}
            <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Plus className="text-emerald-600" size={20} /> Apontamento Manual de Serviço
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Adicione serviços extras executados no período (ex: horas extras, pallet de descarte, manuseio especial).
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveManualItem} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Serviço Logístico *</Label>
                            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                                <SelectTrigger className="bg-white"><SelectValue placeholder="Escolha o serviço..." /></SelectTrigger>
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
                                placeholder="Ex: Mão de obra extra para etiquetagem de promoção"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="bg-white text-xs"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Quantidade Total *</Label>
                                <Input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(Number(e.target.value))}
                                    className="bg-white font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Valor Total R$ *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={totalValue}
                                    onChange={(e) => setTotalValue(Number(e.target.value))}
                                    className="bg-white font-mono text-xs"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Observações Manuais</Label>
                            <Input
                                placeholder="Aprovado por e-mail pelo cliente"
                                value={manualNotes}
                                onChange={(e) => setManualNotes(e.target.value)}
                                className="bg-white text-xs"
                            />
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsManualModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Gravar Lançamento
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}