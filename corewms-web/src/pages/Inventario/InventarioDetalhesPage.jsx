import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    ArrowLeft, CheckCircle2, Play, RefreshCw, FileText,
    ArrowDownLeft, ArrowUpRight, Loader2, BarChart2, Trash2, RotateCcw, AlertTriangle, ChevronDown, ChevronUp, User, CheckCheck
} from 'lucide-react';
import { customInstance } from '@/api/orval-mutator';
import { renderPlanStatusBadge } from './InventarioGestaoPage';
import { toast } from 'sonner';

export default function InventarioDetalhesPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [plan, setPlan] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTaskForFiscal, setSelectedTaskForFiscal] = useState(null);
    const [nfeNumber, setNfeNumber] = useState('');
    const [nfeNotes, setNfeNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Controle de Linhas Expandidas
    const [expandedTaskIds, setExpandedTaskIds] = useState([]);

    // Modais de Confirmação
    const [isCancelPlanModalOpen, setIsCancelPlanModalOpen] = useState(false);
    const [isDeletePlanModalOpen, setIsDeletePlanModalOpen] = useState(false);
    const [isClosePlanModalOpen, setIsClosePlanModalOpen] = useState(false);

    const loadPlanDetails = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: `/api/cycle-count/plans/${id}`, method: 'GET' });
            setPlan(res || null);
        } catch {
            toast.error('Erro ao carregar detalhes do plano.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { if (id) loadPlanDetails(); }, [id]);

    const toggleExpandTask = (taskId) => {
        if (expandedTaskIds.includes(taskId)) {
            setExpandedTaskIds(expandedTaskIds.filter(i => i !== taskId));
        } else {
            setExpandedTaskIds([...expandedTaskIds, taskId]);
        }
    };

    const handleApprove = async () => {
        try {
            await customInstance({ url: `/api/cycle-count/plans/${id}/approve`, method: 'POST' });
            toast.success('Plano aprovado e liberado para os coletores!');
            await loadPlanDetails();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao aprovar.');
        }
    };

    const handleConfirmClosePlan = async () => {
        setIsSubmitting(true);
        try {
            await customInstance({ url: `/api/cycle-count/plans/${id}/close`, method: 'POST' });
            toast.success('Inventário encerrado com sucesso!');
            setIsClosePlanModalOpen(false);
            await loadPlanDetails();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao encerrar inventário.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmCancelPlan = async () => {
        setIsSubmitting(true);
        try {
            await customInstance({ url: `/api/cycle-count/plans/${id}/cancel`, method: 'POST' });
            toast.info('Plano cancelado e retornado para Rascunho.');
            setIsCancelPlanModalOpen(false);
            await loadPlanDetails();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao cancelar plano.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmDeletePlan = async () => {
        setIsSubmitting(true);
        try {
            await customInstance({ url: `/api/cycle-count/plans/${id}`, method: 'DELETE' });
            toast.success('Plano excluído com sucesso.');
            setIsDeletePlanModalOpen(false);
            navigate('/inventario/gestao');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao excluir plano.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRequestRecount = async (taskId) => {
        try {
            await customInstance({ url: `/api/cycle-count/tasks/${taskId}/recount`, method: 'POST' });
            toast.success('Recontagem solicitada! A tarefa anterior foi arquivada como Recontada e o plano retornou para "Em Contagem".');
            await loadPlanDetails();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao solicitar recontagem.');
        }
    };

    const handleApplyFiscalAdjustment = async () => {
        if (!selectedTaskForFiscal || !nfeNumber.trim()) return toast.warning('Informe o número da NF-e.');
        setIsSubmitting(true);
        try {
            await customInstance({
                url: `/api/cycle-count/tasks/${selectedTaskForFiscal.id}/apply-fiscal-adjustment`,
                method: 'POST',
                data: { fiscalDocumentNumber: nfeNumber.trim(), notes: nfeNotes.trim() }
            });
            toast.success('Ajuste fiscal efetuado!');
            setSelectedTaskForFiscal(null);
            setNfeNumber('');
            setNfeNotes('');
            await loadPlanDetails();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao aplicar ajuste.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
    if (!plan) return <div className="p-8 text-center text-slate-500">Plano de inventário não encontrado.</div>;

    const accuracyRate = plan.totalTasks > 0 ? Math.round((plan.resolvedTasks / plan.totalTasks) * 100) : 0;
    const isSurplus = selectedTaskForFiscal?.divergenceQuantity > 0;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-wrap items-center justify-between bg-white p-5 border rounded-xl shadow-2xs gap-3">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" onClick={() => navigate('/inventario/gestao')} className="bg-white"><ArrowLeft size={16} /></Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900">{plan.name}</h1>
                            {renderPlanStatusBadge(plan.status)}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong>{plan.customerName || 'Todos os Depositantes'}</strong> | Mapeamento: <strong>{plan.totalTasks} Posições</strong>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {plan.status === 'Draft' && (
                        <>
                            <Button onClick={handleApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9">
                                <Play size={14} className="mr-1.5" /> Aprovar & Liberar
                            </Button>
                            <Button onClick={() => setIsDeletePlanModalOpen(true)} variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs h-9">
                                <Trash2 size={14} className="mr-1.5" /> Excluir Plano
                            </Button>
                        </>
                    )}

                    {plan.status === 'InReview' && (
                        <Button onClick={() => setIsClosePlanModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9">
                            <CheckCheck size={16} className="mr-1.5" /> Encerrar Inventário
                        </Button>
                    )}

                    {(plan.status === 'ApprovedForCounting' || plan.status === 'InCounting' || plan.status === 'InReview') && (
                        <Button onClick={() => setIsCancelPlanModalOpen(true)} variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50 text-xs h-9">
                            <RotateCcw size={14} className="mr-1.5" /> Cancelar Plano (Voltar p/ Rascunho)
                        </Button>
                    )}

                    <Button onClick={loadPlanDetails} variant="outline" size="sm" className="bg-white"><RefreshCw size={14} /></Button>
                </div>
            </div>

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-white border-slate-200">
                    <CardHeader className="p-4 pb-1"><CardTitle className="text-xs font-bold text-slate-400 uppercase">Acuracidade (IRA)</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-1"><span className="text-2xl font-bold font-mono text-blue-700">{accuracyRate}%</span></CardContent>
                </Card>
                <Card className="bg-white border-slate-200">
                    <CardHeader className="p-4 pb-1"><CardTitle className="text-xs font-bold text-slate-400 uppercase">Posições Conciliadas</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-1"><span className="text-2xl font-bold font-mono text-emerald-700">{plan.resolvedTasks} / {plan.totalTasks}</span></CardContent>
                </Card>
                <Card className="bg-white border-slate-200">
                    <CardHeader className="p-4 pb-1"><CardTitle className="text-xs font-bold text-slate-400 uppercase">Divergências Pendentes</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-1"><span className="text-2xl font-bold font-mono text-amber-700">{plan.divergentTasks || 0}</span></CardContent>
                </Card>
            </div>

            {/* MATRIZ DE CONCILIAÇÃO */}
            <div className="bg-white border rounded-xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b pb-3">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><BarChart2 size={16} className="text-blue-600" /> Matriz de Conciliação e Detalhamento das Rodadas</h2>
                </div>

                <div className="overflow-auto max-h-[550px]">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead>Endereço / Posição</TableHead>
                                <TableHead>SKU do Produto</TableHead>
                                <TableHead className="text-right">Sistêmico (Esperado)</TableHead>
                                <TableHead className="text-right">Físico (Contado)</TableHead>
                                <TableHead className="text-right">Divergência</TableHead>
                                <TableHead>Status Posição</TableHead>
                                <TableHead className="text-center">Detalhes Rodadas</TableHead>
                                <TableHead>Ajuste Fiscal Pendente</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {plan.tasks?.map((t) => {
                                const isFinishedDivergent = t.status === 'CountedWithDivergence';
                                const isResolved = t.status === 'Resolved';
                                const isRecounted = t.status === 'Recounted';
                                const isExpanded = expandedTaskIds.includes(t.id);

                                const hasCount = t.countedQuantity !== null && t.countedQuantity !== undefined;
                                const divergence = isFinishedDivergent || isResolved ? (t.divergenceQuantity ?? 0) : 0;

                                return (
                                    <>
                                        <TableRow key={t.id} className={isFinishedDivergent ? 'bg-amber-50/40' : isRecounted ? 'bg-slate-100/50 opacity-60' : 'hover:bg-slate-50/50'}>
                                            <TableCell className="font-mono font-bold text-xs text-slate-900">{t.locationPath}</TableCell>
                                            <TableCell className="font-mono text-xs">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-800">{t.productSku}</span>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[180px]">{t.productDescription}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs">{t.expectedQuantity?.toLocaleString('pt-BR')}</TableCell>
                                            <TableCell className="text-right font-mono font-bold text-xs">
                                                {hasCount ? t.countedQuantity?.toLocaleString('pt-BR') : '-'}
                                            </TableCell>

                                            <TableCell className={`text-right font-mono font-bold text-xs ${!hasCount || (!isFinishedDivergent && !isResolved) ? 'text-slate-400' : divergence > 0 ? 'text-emerald-600' : divergence < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                                {!hasCount || (!isFinishedDivergent && !isResolved) ? '-' : divergence > 0 ? `+${divergence.toLocaleString('pt-BR')}` : divergence.toLocaleString('pt-BR')}
                                            </TableCell>

                                            <TableCell>
                                                <Badge className={`text-[10px] ${isResolved ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : isFinishedDivergent ? 'bg-amber-100 text-amber-800 border-amber-200' : isRecounted ? 'bg-slate-200 text-slate-700 border-slate-300' : t.status === 'InCounting' ? 'bg-amber-50 text-amber-900 border-amber-300 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
                                                    {isResolved ? '✅ Conciliado' : isFinishedDivergent ? '⚠️ Divergente' : isRecounted ? '🔄 Recontada' : t.status === 'InCounting' ? '⏳ Em Contagem' : '⏳ Pendente'}
                                                </Badge>
                                            </TableCell>

                                            {/* BOTÃO EXPANDIR DETALHES DAS RODADAS */}
                                            <TableCell className="text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => toggleExpandTask(t.id)}
                                                    className="h-7 text-[11px] font-medium text-blue-700 hover:bg-blue-50 gap-1"
                                                >
                                                    Rodadas {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                </Button>
                                            </TableCell>

                                            <TableCell>
                                                {isFinishedDivergent && divergence > 0 ? (
                                                    <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] gap-1"><ArrowDownLeft size={12} /> Sobra: Exige NF Remessa</Badge>
                                                ) : isFinishedDivergent && divergence < 0 ? (
                                                    <Badge className="bg-rose-50 text-rose-800 border-rose-200 text-[10px] gap-1"><ArrowUpRight size={12} /> Falta: Exige Retorno Simbólico</Badge>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Sem Ajuste</span>
                                                )}
                                            </TableCell>

                                            <TableCell className="text-right space-x-1">
                                                {isFinishedDivergent && (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            onClick={() => handleRequestRecount(t.id)}
                                                            size="sm"
                                                            variant="outline"
                                                            className="text-xs h-7 bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                                                            title="Criar nova tarefa de recontagem preservando o histórico desta"
                                                        >
                                                            <RotateCcw size={12} className="mr-1" /> Recontar
                                                        </Button>

                                                        <Button
                                                            onClick={() => setSelectedTaskForFiscal({ ...t, divergenceQuantity: divergence })}
                                                            size="sm"
                                                            className="bg-slate-900 text-white text-xs h-7 hover:bg-slate-800"
                                                        >
                                                            <FileText size={12} className="mr-1" /> Tratar NF-e
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>

                                        {/* DETALHAMENTO DE OPERADORES POR RODADA */}
                                        {isExpanded && (
                                            <TableRow key={`${t.id}-expanded`} className="bg-slate-50/80 border-b">
                                                <TableCell colSpan={9} className="p-4">
                                                    <div className="bg-white p-3 border border-slate-200 rounded-lg space-y-2">
                                                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                                            <BarChart2 size={13} className="text-blue-600" /> Detalhamento de Operadores e Contagens
                                                        </h4>

                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                            <div className="p-2.5 rounded-md border bg-slate-50/50 space-y-1 text-xs">
                                                                <div className="font-bold text-slate-800 flex items-center justify-between">
                                                                    <span>Rodada 1</span>
                                                                    <Badge variant="outline" className="text-[10px] bg-white font-mono">
                                                                        {t.countRound1 !== null && t.countRound1 !== undefined ? `${t.countRound1.toLocaleString('pt-BR')} UN` : 'Não contada'}
                                                                    </Badge>
                                                                </div>
                                                                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                                                    <User size={12} className="text-slate-400" />
                                                                    <span>Operador: <strong className="text-slate-700">{t.userRound1Name || '-'}</strong></span>
                                                                </div>
                                                            </div>

                                                            <div className="p-2.5 rounded-md border bg-slate-50/50 space-y-1 text-xs">
                                                                <div className="font-bold text-slate-800 flex items-center justify-between">
                                                                    <span>Rodada 2</span>
                                                                    <Badge variant="outline" className="text-[10px] bg-white font-mono">
                                                                        {t.countRound2 !== null && t.countRound2 !== undefined ? `${t.countRound2.toLocaleString('pt-BR')} UN` : 'Não contada'}
                                                                    </Badge>
                                                                </div>
                                                                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                                                    <User size={12} className="text-slate-400" />
                                                                    <span>Operador: <strong className="text-slate-700">{t.userRound2Name || '-'}</strong></span>
                                                                </div>
                                                            </div>

                                                            <div className="p-2.5 rounded-md border bg-slate-50/50 space-y-1 text-xs">
                                                                <div className="font-bold text-slate-800 flex items-center justify-between">
                                                                    <span>Rodada 3</span>
                                                                    <Badge variant="outline" className="text-[10px] bg-white font-mono">
                                                                        {t.countRound3 !== null && t.countRound3 !== undefined ? `${t.countRound3.toLocaleString('pt-BR')} UN` : 'Não contada'}
                                                                    </Badge>
                                                                </div>
                                                                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                                                    <User size={12} className="text-slate-400" />
                                                                    <span>Operador: <strong className="text-slate-700">{t.userRound3Name || '-'}</strong></span>
                                                                </div>
                                                            </div>
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
                </div>
            </div>

            {/* MODAL TRATAMENTO FISCAL */}
            <Dialog open={!!selectedTaskForFiscal} onOpenChange={(open) => !open && setSelectedTaskForFiscal(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2"><FileText size={20} className="text-blue-600" /> {isSurplus ? 'Vincular NF-e de Remessa (Sobra)' : 'NF-e de Retorno Simbólico (Falta)'}</DialogTitle>
                        <DialogDescription className="text-xs">SKU: <strong className="font-mono">{selectedTaskForFiscal?.productSku}</strong> na posição <strong className="font-mono">{selectedTaskForFiscal?.locationPath}</strong>.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold uppercase">{isSurplus ? 'Número da NF-e de Remessa *' : 'Número da NF-e de Retorno Simbólico *'}</Label>
                            <Input placeholder="Ex: 000.145.890" value={nfeNumber} onChange={(e) => setNfeNumber(e.target.value)} className="font-mono text-xs" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Observações</Label>
                            <Input placeholder="Justificativa..." value={nfeNotes} onChange={(e) => setNfeNotes(e.target.value)} className="text-xs" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedTaskForFiscal(null)}>Cancelar</Button>
                        <Button onClick={handleApplyFiscalAdjustment} disabled={isSubmitting || !nfeNumber.trim()} className="bg-blue-600 text-white font-bold">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* CONFIRMAÇÃO ENCERRAR PLANO */}
            <AlertDialog open={isClosePlanModalOpen} onOpenChange={setIsClosePlanModalOpen}>
                <AlertDialogContent className="bg-white sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 flex items-center gap-2"><CheckCheck className="text-emerald-600" size={20} /> Encerrar Inventário?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-500">Todas as posições foram validadas. O inventário passará para o status Encerrado.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="pt-2">
                        <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmClosePlan} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Sim, Encerrar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* CONFIRMAÇÃO CANCELAR PLANO */}
            <AlertDialog open={isCancelPlanModalOpen} onOpenChange={setIsCancelPlanModalOpen}>
                <AlertDialogContent className="bg-white sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 flex items-center gap-2"><AlertTriangle className="text-amber-600" size={20} /> Cancelar Inventário?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-500">Deseja cancelar o plano e retornar para Rascunho? Todas as contagens e atribuições em andamento serão resetadas.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="pt-2">
                        <AlertDialogCancel disabled={isSubmitting}>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmCancelPlan} disabled={isSubmitting} className="bg-amber-600 text-white font-bold">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Sim, Cancelar Plano
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* CONFIRMAÇÃO EXCLUIR PLANO */}
            <AlertDialog open={isDeletePlanModalOpen} onOpenChange={setIsDeletePlanModalOpen}>
                <AlertDialogContent className="bg-white sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 flex items-center gap-2"><Trash2 className="text-rose-600" size={20} /> Excluir Rascunho de Inventário?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-500">Esta ação é irreversível. O plano e todas as posições mapeadas serão permanentemente removidos.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="pt-2">
                        <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDeletePlan} disabled={isSubmitting} className="bg-rose-600 text-white font-bold">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Sim, Excluir Plano
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}