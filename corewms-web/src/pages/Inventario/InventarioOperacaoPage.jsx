import { useState, useEffect, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { MapPin, Barcode, CheckCircle2, Loader2, Search, Layers, Boxes, RefreshCw } from 'lucide-react';
import { customInstance } from '@/api/orval-mutator';
import { toast } from 'sonner';

export default function InventarioOperacaoPage() {
    const [plans, setPlans] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTask, setActiveTask] = useState(null);
    const [countedQuantity, setCountedQuantity] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadPlans = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/cycle-count/plans', method: 'GET' });
            setPlans(res || []);
        } catch {
            toast.error('Erro ao carregar tarefas de inventário.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadPlans();
    }, []);

    // Concatena apenas tarefas de planos Aprovados/Em Contagem
    const activeTasks = useMemo(() => {
        if (!plans || plans.length === 0) return [];

        const approvedPlans = plans.filter(p => p.status === 'ApprovedForCounting' || p.status === 'InCounting');
        const tasks = [];

        approvedPlans.forEach(plan => {
            if (plan.tasks && plan.tasks.length > 0) {
                plan.tasks.forEach(t => {
                    if (t.status === 'Pending' || t.status === '1') {
                        tasks.push({
                            ...t,
                            planName: plan.name,
                            customerName: plan.customerName
                        });
                    }
                });
            }
        });

        if (!searchTerm.trim()) return tasks;
        const term = searchTerm.toLowerCase();

        return tasks.filter(t =>
            t.locationPath?.toLowerCase().includes(term) ||
            t.productSku?.toLowerCase().includes(term) ||
            t.productDescription?.toLowerCase().includes(term)
        );
    }, [plans, searchTerm]);

    const handleRecordCount = async () => {
        if (!activeTask || countedQuantity === '') {
            return toast.warning('Informe a quantidade física contada na posição.');
        }

        setIsSubmitting(true);
        try {
            await customInstance({
                url: `/api/cycle-count/tasks/${activeTask.id}/record-position`,
                method: 'POST',
                data: { countedQuantity: Number(countedQuantity) }
            });

            toast.success(`Contagem da posição ${activeTask.locationPath} registrada com sucesso!`);
            setActiveTask(null);
            setCountedQuantity('');
            await loadPlans();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao registrar contagem.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col space-y-5 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-200/80 rounded-xl shadow-2xs">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Barcode className="text-emerald-600" size={24} /> Operação de Inventário - Chão de Fábrica
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Consulte as posições liberadas pela gestão, dirija-se até o endereço e registre a contagem cega.
                    </p>
                </div>

                <Button onClick={loadPlans} variant="outline" size="sm" className="bg-white border-slate-200 text-slate-700 text-xs h-9">
                    <RefreshCw size={14} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
                </Button>
            </div>

            {/* TABELA DE TAREFAS */}
            <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Filtrar por Posição/Endereço ou SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-white text-xs h-9 font-mono border-slate-300"
                        />
                    </div>
                    <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-mono text-xs">
                        {activeTasks.length} Posições Liberadas para Contagem
                    </Badge>
                </div>

                <div className="overflow-auto max-h-[550px]">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead>Endereço / Posição</TableHead>
                                <TableHead>SKU / Descrição do Produto</TableHead>
                                <TableHead>Plano de Origem</TableHead>
                                <TableHead>Tipo Armazenamento</TableHead>
                                <TableHead className="text-center">Rodada</TableHead>
                                <TableHead className="text-right">Ação do Coletor</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : activeTasks.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-500">Nenhuma posição pendente de contagem no momento.</TableCell></TableRow>
                            ) : activeTasks.map((t) => (
                                <TableRow key={t.id} className="hover:bg-slate-50/60">
                                    <TableCell>
                                        <Badge variant="outline" className="bg-blue-50/60 text-blue-900 border-blue-200 font-mono text-xs gap-1">
                                            <MapPin size={13} className="text-blue-600" /> {t.locationPath}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-mono font-bold text-slate-900 text-xs">{t.productSku}</span>
                                            <span className="text-[10px] text-slate-400 truncate max-w-[220px]">{t.productDescription}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600 font-medium">{t.planName}</TableCell>
                                    <TableCell>
                                        {t.isDynamicStorage ? (
                                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] gap-1">
                                                <Boxes size={12} /> Blocado (Saldo Total)
                                            </Badge>
                                        ) : (
                                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] gap-1">
                                                <Layers size={12} /> Porta-Palete / HU
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center font-mono text-xs">
                                        <Badge variant="secondary">Rodada {t.currentRound || 1}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            onClick={() => { setActiveTask(t); setCountedQuantity(''); }}
                                            size="sm"
                                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 font-bold"
                                        >
                                            <Barcode size={14} className="mr-1.5" /> Contar Posição
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* MODAL APONTAMENTO CEGO POR POSIÇÃO */}
            <Dialog open={!!activeTask} onOpenChange={(open) => !open && setActiveTask(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Barcode className="text-blue-600" size={20} /> Contagem da Posição
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Endereço: <strong className="font-mono text-slate-900">{activeTask?.locationPath}</strong> | SKU: <strong className="font-mono text-slate-900">{activeTask?.productSku}</strong>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {activeTask?.isDynamicStorage && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center gap-2 font-medium">
                                <Boxes size={18} className="shrink-0 text-amber-600" />
                                <span>Armazenamento Blocado: Informe o <strong>Saldo Físico TOTAL</strong> do produto presente nesta posição.</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 uppercase">Quantidade Físico Contada *</label>
                            <Input
                                type="number"
                                autoFocus
                                placeholder="0"
                                value={countedQuantity}
                                onChange={(e) => setCountedQuantity(e.target.value)}
                                className="bg-white font-mono text-2xl font-bold text-center h-12 border-slate-300"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setActiveTask(null)} disabled={isSubmitting}>Cancelar</Button>
                        <Button onClick={handleRecordCount} disabled={isSubmitting || countedQuantity === ''} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                            Confirmar Contagem
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}