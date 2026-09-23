import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { customInstance } from '@/api/orval-mutator';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { useGetApiProducts } from '@/api/generated/products/products';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    ClipboardCheck, Plus, Play, CheckCircle2, AlertTriangle,
    ShieldAlert, Loader2, RefreshCw, Barcode, Layers, MapPin, Search
} from 'lucide-react';
import { toast } from 'sonner';

// Schema de Criação do Plano
const planSchema = z.object({
    name: z.string().min(1, 'Informe o nome do plano de inventário.'),
    customerId: z.string().optional(),
    productId: z.string().optional(),
    batch: z.string().optional()
});

export default function InventarioPage() {
    const [plans, setPlans] = useState([]);
    const [selectedPlan, setSelectedCustomerPlan] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCountModalOpen, setIsCountModalOpen] = useState(false);
    const [activeTask, setActiveTask] = useState(null);

    // Form de Contagem
    const [countedQuantity, setCountedQuantity] = useState(0);
    const [scannedLpn, setScannedLpn] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Listas de Apoio
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const { data: productsData } = useGetApiProducts({ PageSize: 500 });
    const products = productsData?.items || (Array.isArray(productsData) ? productsData : []);

    const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(planSchema),
        defaultValues: { name: '', customerId: 'ALL', productId: 'ALL', batch: '' }
    });

    const loadPlans = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/cycle-count/plans', method: 'GET' });
            setPlans(res || []);
            if (res && res.length > 0 && !selectedPlan) {
                setSelectedCustomerPlan(res[0]);
            } else if (selectedPlan) {
                const updated = res.find(p => p.id === selectedPlan.id);
                if (updated) setSelectedCustomerPlan(updated);
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

    // Criar Novo Plano
    const onCreatePlan = async (data) => {
        try {
            setIsSubmitting(true);
            const payload = {
                name: data.name.trim(),
                customerId: data.customerId !== 'ALL' ? data.customerId : null,
                productId: data.productId !== 'ALL' ? data.productId : null,
                batch: data.batch ? data.batch.trim() : null
            };

            const res = await customInstance({
                url: '/api/cycle-count/plans',
                method: 'POST',
                data: payload
            });

            toast.success(`Plano criado com sucesso! ${res.tasksGenerated} tarefas geradas.`);
            setIsCreateModalOpen(false);
            reset();
            loadPlans();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao criar plano de inventário.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Iniciar Plano
    const handleStartPlan = async (planId) => {
        try {
            await customInstance({ url: `/api/cycle-count/plans/${planId}/start`, method: 'POST' });
            toast.success('Plano de inventário iniciado!');
            loadPlans();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao iniciar plano.');
        }
    };

    // Escalar para Modo Estrito (Desmanche LPN)
    const handleEscalateTask = async (taskId) => {
        try {
            await customInstance({ url: `/api/cycle-count/tasks/${taskId}/escalate`, method: 'POST' });
            toast.success('Tarefa escalada para contagem estrita de LPN (Desmanche)!');
            loadPlans();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao escalar tarefa.');
        }
    };

    // Submeter Contagem do Coletor
    const handleRecordCount = async () => {
        if (!activeTask) return;

        try {
            setIsSubmitting(true);
            if (activeTask.isStrictLpnMode) {
                if (!scannedLpn) return toast.error('Bipe ou digite o código LPN.');
                await customInstance({
                    url: `/api/cycle-count/tasks/${activeTask.id}/record-lpn`,
                    method: 'POST',
                    data: { lpn: scannedLpn }
                });
                toast.success(`LPN '${scannedLpn}' gravado!`);
                setScannedLpn('');
            } else {
                await customInstance({
                    url: `/api/cycle-count/tasks/${activeTask.id}/record-volumetric`,
                    method: 'POST',
                    data: { countedQuantity: Number(countedQuantity) }
                });
                toast.success('Contagem volumétrica registrada!');
                setIsCountModalOpen(false);
            }
            loadPlans();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao registrar contagem.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <ClipboardCheck className="text-blue-600" size={26} /> Inventário Cíclico & Acurácia
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Crie contagens programadas, audite divergências em múltiplas rodadas e gerencie o desmanche estrito de LPNs.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button onClick={loadPlans} variant="outline" size="sm" className="bg-white">
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                    <Button onClick={() => setIsCreateModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                        <Plus size={16} className="mr-1.5" /> Novo Plano de Inventário
                    </Button>
                </div>
            </div>

            {/* SELEÇÃO DO PLANO */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {plans.map((p) => {
                    const isSelected = selectedPlan?.id === p.id;
                    const progressPercent = p.totalTasks > 0 ? Math.round((p.resolvedTasks / p.totalTasks) * 100) : 0;

                    return (
                        <Card
                            key={p.id}
                            onClick={() => setSelectedCustomerPlan(p)}
                            className={`cursor-pointer transition-all border ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                        >
                            <CardHeader className="p-4 pb-2">
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline" className="font-mono text-[10px] bg-slate-50">{p.status}</Badge>
                                    <span className="text-xs font-bold text-blue-700 font-mono">{progressPercent}% Concluído</span>
                                </div>
                                <CardTitle className="text-sm font-bold text-slate-900 mt-2 truncate">{p.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0 text-xs text-slate-500 space-y-1">
                                <div>Depositante: <strong className="text-slate-700">{p.customerName || 'Todos'}</strong></div>
                                <div>Tarefas: <strong className="text-slate-900">{p.resolvedTasks}/{p.totalTasks} Concluídas</strong></div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* DETALHES DO PLANO SELECIONADO */}
            {selectedPlan && (
                <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm p-5 space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                Tarefas de Contagem - {selectedPlan.name}
                            </h2>
                            <p className="text-xs text-slate-500">Acompanhe a evolução de cada endereço e aplique as rodadas de auditoria.</p>
                        </div>

                        {selectedPlan.status === 'Scheduled' && (
                            <Button onClick={() => handleStartPlan(selectedPlan.id)} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                <Play size={14} className="mr-1.5" /> Iniciar Inventário
                            </Button>
                        )}
                    </div>

                    <Table>
                        <TableHeader className="bg-slate-50/80">
                            <TableRow>
                                <TableHead>Endereço / Localização</TableHead>
                                <TableHead>SKU do Produto</TableHead>
                                <TableHead className="text-center">Qtd Esperada</TableHead>
                                <TableHead className="text-center">Rodada Atual</TableHead>
                                <TableHead>Modo de Contagem</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right w-44">Ações do Coletor / Gestor</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {selectedPlan.tasks?.map((t) => (
                                <TableRow key={t.id} className="hover:bg-slate-50/60">
                                    <TableCell>
                                        <Badge variant="outline" className="bg-slate-50 font-mono text-slate-800 gap-1 text-xs">
                                            <MapPin size={12} className="text-blue-600" /> {t.locationPath}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-bold font-mono text-slate-900 text-xs">{t.productSku}</TableCell>
                                    <TableCell className="text-center font-mono font-bold text-slate-700 text-xs">{t.expectedQuantity}</TableCell>
                                    <TableCell className="text-center font-mono font-semibold text-slate-900 text-xs">
                                        <Badge variant="secondary" className="bg-slate-100 text-slate-800">Rodada {t.currentRound}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`text-[10px] ${t.isStrictLpnMode ? 'bg-purple-100 text-purple-900 border-purple-200' : 'bg-slate-100 text-slate-700'}`}>
                                            {t.isStrictLpnMode ? '🔍 Estrito (Desmanche LPN)' : '📦 Volumétrico'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`text-[10px] px-2 py-0.5 border ${t.status === 'Resolved' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                            t.status === 'Escalated_To_Manager' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-blue-50 text-blue-800 border-blue-200'
                                            }`}>
                                            {t.status === 'Resolved' ? '✅ Concluído' :
                                                t.status === 'Escalated_To_Manager' ? '⚠️ Divergente (Gestor)' : '⏳ Pendente'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {t.status !== 'Resolved' && (
                                                <Button
                                                    onClick={() => { setActiveTask(t); setIsCountModalOpen(true); }}
                                                    size="sm" variant="outline" className="h-7 text-xs bg-white text-blue-700 border-blue-200"
                                                >
                                                    <Barcode size={13} className="mr-1" /> Contar
                                                </Button>
                                            )}

                                            {t.status === 'Escalated_To_Manager' && (
                                                <Button
                                                    onClick={() => handleEscalateTask(t.id)}
                                                    size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                                                >
                                                    <ShieldAlert size={13} className="mr-1" /> Exigir LPN
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* MODAL CRIAR PLANO DE INVENTÁRIO */}
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <ClipboardCheck className="text-blue-600" size={20} /> Novo Plano de Inventário
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Filtre os itens que farão parte da contagem programada.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit(onCreatePlan)} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Nome do Plano *</Label>
                            <Input
                                placeholder="Ex: Inventário Cíclico Semanal - Zona A"
                                onChange={(e) => setValue('name', e.target.value, { shouldValidate: true })}
                                className="bg-white text-xs"
                            />
                            {errors.name && <p className="text-[10px] text-rose-500">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Depositante (Opcional)</Label>
                            <Select value={watch('customerId')} onValueChange={(v) => setValue('customerId', v)}>
                                <SelectTrigger className="bg-white text-xs"><SelectValue placeholder="Todos os Depositantes" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os Depositantes</SelectItem>
                                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Produto SKU (Opcional)</Label>
                            <Select value={watch('productId')} onValueChange={(v) => setValue('productId', v)}>
                                <SelectTrigger className="bg-white text-xs"><SelectValue placeholder="Todos os Produtos" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os SKUs</SelectItem>
                                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.sku} - {p.description}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Gerar Tarefas
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL EXECUÇÃO DA CONTAGEM (COLETOR/INSPETOR) */}
            <Dialog open={isCountModalOpen} onOpenChange={setIsCountModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Barcode className="text-blue-600" size={20} /> Apontamento do Coletor (Rodada {activeTask?.currentRound})
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Endereço: <strong className="font-mono text-slate-800">{activeTask?.locationPath}</strong> | Produto: <strong className="font-mono text-slate-800">{activeTask?.productSku}</strong>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {activeTask?.isStrictLpnMode ? (
                            <div className="space-y-2">
                                <Badge className="bg-purple-100 text-purple-900 border-purple-200 text-xs w-full justify-center py-1">
                                    🔍 MODO ESTRITO: Bipe cada LPN individualmente
                                </Badge>
                                <Label className="text-xs font-semibold text-slate-700">Código LPN do Palete *</Label>
                                <Input
                                    placeholder="Bipe o LPN..."
                                    value={scannedLpn}
                                    onChange={(e) => setScannedLpn(e.target.value)}
                                    className="bg-white font-mono text-sm"
                                />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-700">Quantidade Volumétrica Contada *</Label>
                                <Input
                                    type="number"
                                    placeholder="0"
                                    value={countedQuantity}
                                    onChange={(e) => setCountedQuantity(e.target.value)}
                                    className="bg-white font-mono text-lg font-bold text-center h-12"
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCountModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                        <Button onClick={handleRecordCount} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                            Gravar Contagem
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}