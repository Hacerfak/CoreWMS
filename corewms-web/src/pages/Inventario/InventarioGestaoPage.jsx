import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
    ClipboardCheck, Play, CheckCircle2,
    Loader2, FileText, ArrowDownLeft, ArrowUpRight, Plus, RefreshCw
} from 'lucide-react';
import { customInstance } from '@/api/orval-mutator';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { useGetApiProducts } from '@/api/generated/products/products';
import { useGetApiTopologyLocationsStorage } from '@/api/generated/topology/topology';
import { toast } from 'sonner';

export default function InventarioGestaoPage() {
    const [plans, setPlans] = useState([]);
    const [selectedPlanId, setSelectedPlanId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedTaskForFiscal, setSelectedTaskForFiscal] = useState(null);
    const [nfeNumber, setNfeNumber] = useState('');
    const [nfeNotes, setNfeNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form de Novo Plano
    const [newPlanName, setNewPlanName] = useState('');
    const [newCustomerId, setNewCustomerId] = useState('ALL');
    const [newProductId, setNewProductId] = useState('ALL');
    const [newBatch, setNewBatch] = useState('');
    const [newLocationId, setNewLocationId] = useState('ALL');

    // Apoio
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 100 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const { data: productsData } = useGetApiProducts({ PageSize: 100 });
    const products = productsData?.items || (Array.isArray(productsData) ? productsData : []);

    const { data: storageLocations = [] } = useGetApiTopologyLocationsStorage();

    const loadPlans = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/cycle-count/plans', method: 'GET' });
            const list = res || [];
            setPlans(list);
            if (list.length > 0 && !selectedPlanId) {
                setSelectedPlanId(list[0].id);
            }
        } catch {
            toast.error('Erro ao carregar planos de inventário.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadPlans();
    }, []);

    const selectedPlan = useMemo(() => {
        if (!plans || plans.length === 0) return null;
        if (!selectedPlanId) return plans[0];
        return plans.find(p => p.id === selectedPlanId) || plans[0];
    }, [plans, selectedPlanId]);

    // Criar Novo Plano em Rascunho
    const handleCreatePlan = async (e) => {
        if (e) e.preventDefault();
        if (!newPlanName.trim()) return toast.warning('Informe o nome do plano de inventário.');

        setIsSubmitting(true);
        try {
            const payload = {
                name: newPlanName.trim(),
                customerId: newCustomerId !== 'ALL' ? newCustomerId : null,
                productId: newProductId !== 'ALL' ? newProductId : null,
                batch: newBatch.trim() ? newBatch.trim() : null,
                locationId: newLocationId !== 'ALL' ? newLocationId : null
            };

            const res = await customInstance({
                url: '/api/cycle-count/plans',
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || 'Plano de inventário criado em modo Rascunho!');
            setIsCreateModalOpen(false);
            setNewPlanName('');
            setNewCustomerId('ALL');
            setNewProductId('ALL');
            setNewBatch('');
            setNewLocationId('ALL');
            await loadPlans();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao criar plano de inventário.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Aprovar e Liberar para Coletores (Draft -> ApprovedForCounting)
    const handleApprovePlan = async (planId) => {
        setIsSubmitting(true);
        try {
            await customInstance({ url: `/api/cycle-count/plans/${planId}/approve`, method: 'POST' });
            toast.success('Plano aprovado e liberado para contagem dos coletores!');
            await loadPlans();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao aprovar plano.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Solicitar Recontagem (Nova Rodada)
    const handleRequestRecount = async (taskId) => {
        try {
            const res = await customInstance({ url: `/api/cycle-count/tasks/${taskId}/recount`, method: 'POST' });
            toast.info(res?.message || 'Recontagem solicitada com sucesso.');
            await loadPlans();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao solicitar recontagem.');
        }
    };

    // Aplicar Ajuste Fiscal
    const handleApplyFiscalAdjustment = async () => {
        if (!selectedTaskForFiscal || !nfeNumber.trim()) {
            return toast.warning('Informe o número da Nota Fiscal de ajuste.');
        }

        setIsSubmitting(true);
        try {
            await customInstance({
                url: `/api/cycle-count/tasks/${selectedTaskForFiscal.id}/apply-fiscal-adjustment`,
                method: 'POST',
                data: {
                    fiscalDocumentId: '00000000-0000-0000-0000-000000000000',
                    fiscalDocumentNumber: nfeNumber.trim(),
                    notes: nfeNotes.trim()
                }
            });

            toast.success('Ajuste fiscal efetivado e saldo atualizado!');
            setSelectedTaskForFiscal(null);
            setNfeNumber('');
            setNfeNotes('');
            await loadPlans();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao aplicar ajuste fiscal.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isSurplus = selectedTaskForFiscal?.divergenceQuantity > 0;

    return (
        <div className="flex flex-col space-y-5 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-200/80 rounded-xl shadow-2xs">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <ClipboardCheck className="text-blue-600" size={24} /> Gestão & Conciliação de Inventários
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Crie inventários em rascunho, aprove a liberação para campo e trate as divergências fiscais (Remessa / Retorno Simbólico).
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button onClick={loadPlans} variant="outline" size="sm" className="bg-white border-slate-200 text-slate-700 text-xs h-9">
                        <RefreshCw size={14} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
                    </Button>
                    <Button onClick={() => setIsCreateModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 shadow-2xs">
                        <Plus size={16} className="mr-1.5" /> Novo Plano de Inventário
                    </Button>
                </div>
            </div>

            {/* LISTA DE CARDS DOS PLANOS */}
            {isLoading ? (
                <div className="h-32 bg-white border rounded-xl flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
            ) : plans.length === 0 ? (
                <div className="p-8 bg-white border border-slate-200/80 rounded-xl text-center text-slate-500 text-xs">
                    Nenhum plano de inventário cadastrado. Clique no botão acima para criar o primeiro rascunho.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {plans.map((p) => {
                        const isSelected = selectedPlan?.id === p.id;
                        const progressPercent = p.totalTasks > 0 ? Math.round((p.resolvedTasks / p.totalTasks) * 100) : 0;

                        return (
                            <Card
                                key={p.id}
                                onClick={() => setSelectedPlanId(p.id)}
                                className={`cursor-pointer transition-all border ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                                <CardHeader className="p-3.5 pb-2">
                                    <div className="flex items-center justify-between">
                                        <Badge variant="outline" className={`font-mono text-[10px] ${p.status === 'Draft' ? 'bg-amber-50 text-amber-900 border-amber-300' : p.status === 'ApprovedForCounting' ? 'bg-blue-50 text-blue-900 border-blue-300' : 'bg-emerald-50 text-emerald-900 border-emerald-300'}`}>
                                            {p.status}
                                        </Badge>
                                        <span className="text-xs font-bold text-blue-700 font-mono">{progressPercent}%</span>
                                    </div>
                                    <CardTitle className="text-xs font-bold text-slate-900 mt-2 truncate">{p.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-3.5 pt-0 text-[11px] text-slate-500 space-y-1">
                                    <div>Depositante: <strong className="text-slate-700">{p.customerName || 'Todos'}</strong></div>
                                    <div>Concluídas: <strong className="text-slate-900">{p.resolvedTasks}/{p.totalTasks} Posições</strong></div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* DETALHES E MATRIZ DO PLANO SELECIONADO */}
            {selectedPlan && (
                <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-slate-900">{selectedPlan.name}</h3>
                                <Badge variant="outline" className="font-mono text-xs">{selectedPlan.status}</Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Depositante: <strong className="text-slate-800">{selectedPlan.customerName || 'Todos'}</strong> | Mapeamento: <strong className="text-slate-800">{selectedPlan.totalTasks} Posições</strong>
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            {selectedPlan.status === 'Draft' && (
                                <Button onClick={() => handleApprovePlan(selectedPlan.id)} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9">
                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Play size={14} className="mr-1.5" />}
                                    Aprovar & Liberar para Coletores
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* MATRIZ DE CONCILIAÇÃO */}
                    <div className="overflow-auto max-h-[500px]">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead>Endereço / Posição</TableHead>
                                    <TableHead>SKU do Produto</TableHead>
                                    <TableHead className="text-right">Sistêmico (Esperado)</TableHead>
                                    <TableHead className="text-right">Físico (Contado)</TableHead>
                                    <TableHead className="text-right">Divergência</TableHead>
                                    <TableHead>Status Posição</TableHead>
                                    <TableHead>Ajuste Fiscal Pendente</TableHead>
                                    <TableHead className="text-right">Ações da Gestão</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedPlan.tasks?.map((t) => {
                                    const isDivergent = t.status === 'CountedWithDivergence';
                                    const divergence = t.divergenceQuantity ?? 0;

                                    return (
                                        <TableRow key={t.id} className={isDivergent ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'}>
                                            <TableCell className="font-mono font-bold text-xs text-slate-900">{t.locationPath}</TableCell>
                                            <TableCell className="font-mono text-xs">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-800">{t.productSku}</span>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[180px]">{t.productDescription}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs">{t.expectedQuantity?.toLocaleString('pt-BR')}</TableCell>
                                            <TableCell className="text-right font-mono font-bold text-xs">
                                                {t.countedQuantity !== null && t.countedQuantity !== undefined ? t.countedQuantity?.toLocaleString('pt-BR') : '-'}
                                            </TableCell>
                                            <TableCell className={`text-right font-mono font-bold text-xs ${divergence > 0 ? 'text-emerald-600' : divergence < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                                {divergence > 0 ? `+${divergence.toLocaleString('pt-BR')}` : divergence.toLocaleString('pt-BR')}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`text-[10px] ${t.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : isDivergent ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700'}`}>
                                                    {t.status === 'Resolved' ? '✅ Conciliado' : isDivergent ? '⚠️️ Divergente' : '⏳ Em Contagem'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {divergence > 0 ? (
                                                    <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] gap-1">
                                                        <ArrowDownLeft size={12} /> Sobra: Exige NF Remessa
                                                    </Badge>
                                                ) : divergence < 0 ? (
                                                    <Badge className="bg-rose-50 text-rose-800 border-rose-200 text-[10px] gap-1">
                                                        <ArrowUpRight size={12} /> Falta: Exige Retorno Simbólico
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Sem Ajuste</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                {isDivergent && (
                                                    <>
                                                        <Button
                                                            onClick={() => handleRequestRecount(t.id)}
                                                            size="sm"
                                                            variant="outline"
                                                            title="Solicitar Recontagem na Posição"
                                                            className="text-xs h-7 bg-white text-slate-700"
                                                        >
                                                            <RefreshCw size={12} className="mr-1" /> Recontar
                                                        </Button>

                                                        <Button
                                                            onClick={() => setSelectedTaskForFiscal({ ...t, divergenceQuantity: divergence })}
                                                            size="sm"
                                                            className="bg-slate-900 hover:bg-slate-800 text-white text-xs h-7"
                                                        >
                                                            <FileText size={12} className="mr-1" /> Tratar NF-e
                                                        </Button>
                                                    </>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* MODAL NOVO PLANO DE INVENTÁRIO */}
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Plus className="text-blue-600" size={20} /> Novo Plano de Inventário (Rascunho)
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Defina o nome e os filtros para delimitar o escopo das posições a serem contadas.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleCreatePlan} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Nome do Inventário *</Label>
                            <Input
                                placeholder="Ex: Inventário Mensal - Corredor A"
                                value={newPlanName}
                                onChange={(e) => setNewPlanName(e.target.value)}
                                className="bg-white text-xs border-slate-300"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Depositante</Label>
                            <Select value={newCustomerId} onValueChange={setNewCustomerId}>
                                <SelectTrigger className="bg-white text-xs border-slate-300"><SelectValue placeholder="Todos os Depositantes" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os Depositantes</SelectItem>
                                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Produto SKU</Label>
                            <Select value={newProductId} onValueChange={setNewProductId}>
                                <SelectTrigger className="bg-white text-xs border-slate-300"><SelectValue placeholder="Todos os SKUs" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os SKUs</SelectItem>
                                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.sku} - {p.description}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Lote Físico</Label>
                                <Input
                                    placeholder="Opcional..."
                                    value={newBatch}
                                    onChange={(e) => setNewBatch(e.target.value)}
                                    className="bg-white text-xs font-mono border-slate-300"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Posição Específica</Label>
                                <Select value={newLocationId} onValueChange={setNewLocationId}>
                                    <SelectTrigger className="bg-white text-xs border-slate-300"><SelectValue placeholder="Todas Posições" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Todas Posições</SelectItem>
                                        {storageLocations.slice(0, 50).map(l => <SelectItem key={l.id} value={l.id}>{l.fullPath}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting || !newPlanName.trim()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Gerar Rascunho
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL TRATAMENTO DE AJUSTE FISCAL */}
            <Dialog open={!!selectedTaskForFiscal} onOpenChange={(open) => !open && setSelectedTaskForFiscal(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <FileText className="text-blue-600" size={20} />
                            {isSurplus ? 'Vincular NF-e de Remessa (Sobra)' : 'Gerar/Registrar NF-e de Retorno Simbólico (Falta)'}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Ajuste fiscal para o SKU <strong className="font-mono text-slate-900">{selectedTaskForFiscal?.productSku}</strong> na posição <strong className="font-mono text-slate-900">{selectedTaskForFiscal?.locationPath}</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {isSurplus ? (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs font-medium space-y-1">
                                <div className="font-bold flex items-center gap-1"><ArrowDownLeft size={16} /> Sobra de Estoque (+{selectedTaskForFiscal?.divergenceQuantity})</div>
                                <p>Solicite ao depositante a emissão de uma <strong>NF-e de Remessa</strong> referente à sobra física encontrada e insira o número do documento abaixo.</p>
                            </div>
                        ) : (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-xs font-medium space-y-1">
                                <div className="font-bold flex items-center gap-1"><ArrowUpRight size={16} /> Falta de Estoque ({selectedTaskForFiscal?.divergenceQuantity})</div>
                                <p>Será vinculada a <strong>NF-e de Retorno Simbólico</strong> para devolver a propriedade do saldo inexistente ao depositante e efetuar a baixa sistêmica.</p>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700 uppercase">
                                {isSurplus ? 'Número da NF-e de Remessa Recebida *' : 'Número da NF-e de Retorno Simbólico *'}
                            </Label>
                            <Input
                                placeholder="Ex: 000.145.890"
                                value={nfeNumber}
                                onChange={(e) => setNfeNumber(e.target.value)}
                                className="bg-white font-mono text-xs border-slate-300"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Observações / Auditoria</Label>
                            <Input
                                placeholder="Justificativa técnica..."
                                value={nfeNotes}
                                onChange={(e) => setNfeNotes(e.target.value)}
                                className="bg-white text-xs border-slate-300"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedTaskForFiscal(null)} disabled={isSubmitting}>Cancelar</Button>
                        <Button onClick={handleApplyFiscalAdjustment} disabled={isSubmitting || !nfeNumber.trim()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                            Efetivar Ajuste Fiscal & Saldo
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}