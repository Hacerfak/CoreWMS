import { useEffect, useState } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    Plus, Pencil, Trash2, FileText, Search, ShieldCheck, Sparkles, Filter, Layers, ArrowUpCircle
} from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export default function FiscalOperationRulesPage() {
    const [rules, setRules] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingRule, setEditingRule] = useState(null);

    // Form
    const [description, setDescription] = useState('');
    const [operationType, setOperationType] = useState('1');
    const [cfopStateInternal, setCfopStateInternal] = useState('');
    const [cfopInterstate, setCfopInterstate] = useState('');
    const [cstCsosnIcms, setCstCsosnIcms] = useState('400');
    const [cstPisCofins, setCstPisCofins] = useState('08');
    const [cstIpi, setCstIpi] = useState('53');
    const [cstIbs, setCstIbs] = useState('00');
    const [aliqIbs, setAliqIbs] = useState('0.10');
    const [cstCbs, setCstCbs] = useState('00');
    const [aliqCbs, setAliqCbs] = useState('0.90');
    const [additionalNotes, setAdditionalNotes] = useState('');

    // Exceções
    const [specificCustomerId, setSpecificCustomerId] = useState('ALL');
    const [specificDestinationState, setSpecificDestinationState] = useState('ALL');
    const [specificNcmStart, setSpecificNcmStart] = useState('');
    const [priority, setPriority] = useState('10');

    const loadRules = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/fiscal/rules', method: 'GET' });
            setRules(res || []);
        } catch {
            toast.error('Erro ao carregar regras operacionais fiscais.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadRules();
        customInstance({ url: '/api/customers/summary', method: 'GET' })
            .then(res => setCustomers(res || []))
            .catch(() => { });
    }, []);

    const handleOpenModal = (rule = null) => {
        if (rule) {
            setEditingRule(rule);
            setDescription(rule.description);
            setOperationType(rule.operationType.toString());
            setCfopStateInternal(rule.cfopStateInternal);
            setCfopInterstate(rule.cfopInterstate);
            setCstCsosnIcms(rule.cstCsosnIcms);
            setCstPisCofins(rule.cstPisCofins);
            setCstIpi(rule.cstIpi);
            setCstIbs(rule.cstIbs || '00');
            setAliqIbs(rule.aliqIbs?.toString() || '0.10');
            setCstCbs(rule.cstCbs || '00');
            setAliqCbs(rule.aliqCbs?.toString() || '0.90');
            setAdditionalNotes(rule.additionalNotes || '');
            setSpecificCustomerId(rule.specificCustomerId || 'ALL');
            setSpecificDestinationState(rule.specificDestinationState || 'ALL');
            setSpecificNcmStart(rule.specificNcmStart || '');
            setPriority(rule.priority?.toString() || '10');
        } else {
            setEditingRule(null);
            setDescription('');
            setOperationType('1');
            setCfopStateInternal('5906');
            setCfopInterstate('6906');
            setCstCsosnIcms('400');
            setCstPisCofins('08');
            setCstIpi('53');
            setCstIbs('00');
            setAliqIbs('0.10');
            setCstCbs('00');
            setAliqCbs('0.90');
            setAdditionalNotes('');
            setSpecificCustomerId('ALL');
            setSpecificDestinationState('ALL');
            setSpecificNcmStart('');
            setPriority('10');
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            const payload = {
                id: editingRule?.id,
                description,
                operationType: Number(operationType),
                cfopStateInternal,
                cfopInterstate,
                cstCsosnIcms,
                cstPisCofins,
                cstIpi,
                cstIbs,
                aliqIbs: Number(aliqIbs),
                cstCbs,
                aliqCbs: Number(aliqCbs),
                additionalNotes,
                specificCustomerId: specificCustomerId === 'ALL' ? null : specificCustomerId,
                specificDestinationState: specificDestinationState === 'ALL' ? null : specificDestinationState,
                specificNcmStart: specificNcmStart ? specificNcmStart.trim() : null,
                priority: Number(priority)
            };

            await customInstance({
                url: '/api/fiscal/rules',
                method: 'POST',
                data: payload
            });

            toast.success(editingRule ? 'Regra fiscal atualizada!' : 'Regra fiscal cadastrada com sucesso!');
            setIsModalOpen(false);
            loadRules();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar regra fiscal.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (id) => {
        try {
            await customInstance({ url: `/api/fiscal/rules/${id}/toggle`, method: 'PATCH' });
            toast.success('Status da regra atualizado!');
            loadRules();
        } catch {
            toast.error('Erro ao alterar status da regra.');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Deseja realmente remover esta regra fiscal?')) return;
        try {
            await customInstance({ url: `/api/fiscal/rules/${id}`, method: 'DELETE' });
            toast.success('Regra fiscal excluída!');
            loadRules();
        } catch {
            toast.error('Erro ao excluir regra fiscal.');
        }
    };

    const filteredRules = rules.filter(r =>
        r.description.toLowerCase().includes(search.toLowerCase()) ||
        r.cfopStateInternal.includes(search) ||
        r.cfopInterstate.includes(search)
    );

    const getOpTypeBadge = (type) => {
        switch (type) {
            case 1: return <Badge className="bg-blue-100 text-blue-800">5906 - Retorno Físico</Badge>;
            case 2: return <Badge className="bg-purple-100 text-purple-800">5907 - Retorno Simbólico</Badge>;
            case 3: return <Badge className="bg-orange-100 text-orange-800">5923 - Remessa p/ Conta e Ordem</Badge>;
            default: return <Badge variant="outline">Operação {type}</Badge>;
        }
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Regras de Operação Fiscal (CFOP / SEFAZ)</h1>
                    <p className="text-sm text-slate-500 mt-1">Configure naturezas de operação, regras gerais e exceções por Depositante, UF e NCM.</p>
                </div>
                <Button onClick={() => handleOpenModal()} className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
                    <Plus className="mr-2 h-4 w-4" /> Nova Regra Fiscal
                </Button>
            </div>

            {/* TABELA */}
            <Card className="border-slate-200/80 bg-white shadow-xs">
                <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por descrição ou CFOP..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white text-xs"
                        />
                    </div>
                    <Badge variant="secondary" className="font-mono">{filteredRules.length} Regra(s)</Badge>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-12 text-center">Prioridade</TableHead>
                                <TableHead>Descrição / Operação</TableHead>
                                <TableHead className="text-center">CFOP (Intra / Inter)</TableHead>
                                <TableHead className="text-center">CST ICMS / PIS</TableHead>
                                <TableHead>Condições de Exceção</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRules.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="h-28 text-center text-slate-400 italic">Nenhuma regra fiscal cadastrada.</TableCell></TableRow>
                            ) : (
                                filteredRules.map(rule => (
                                    <TableRow key={rule.id} className="hover:bg-slate-50/50">
                                        <TableCell className="text-center font-mono font-bold text-orange-700">
                                            <Badge variant="outline" className="bg-orange-50 border-orange-200">{rule.priority}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-bold text-slate-900 block text-xs">{rule.description}</span>
                                            {getOpTypeBadge(rule.operationType)}
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-xs font-bold text-slate-800">
                                            <span className="text-blue-700">{rule.cfopStateInternal}</span> / <span className="text-purple-700">{rule.cfopInterstate}</span>
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-xs text-slate-600">
                                            ICMS: <strong>{rule.cstCsosnIcms}</strong> | PIS: <strong>{rule.cstPisCofins}</strong>
                                        </TableCell>
                                        <TableCell className="text-xs font-mono">
                                            {rule.specificCustomerName || rule.specificDestinationState || rule.specificNcmStart ? (
                                                <div className="space-y-0.5">
                                                    {rule.specificCustomerName && <Badge className="bg-emerald-100 text-emerald-800 text-[10px] block truncate max-w-[150px]">Dep: {rule.specificCustomerName}</Badge>}
                                                    {rule.specificDestinationState && <Badge className="bg-blue-100 text-blue-800 text-[10px] block">UF: {rule.specificDestinationState}</Badge>}
                                                    {rule.specificNcmStart && <Badge className="bg-amber-100 text-amber-800 text-[10px] block">NCM: {rule.specificNcmStart}*</Badge>}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 italic text-[11px]">Regra Geral (Geral da Empresa)</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Switch checked={rule.isActive} onCheckedChange={() => handleToggleActive(rule.id)} />
                                        </TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <Button size="sm" variant="ghost" onClick={() => handleOpenModal(rule)}>
                                                <Pencil className="h-4 w-4 text-slate-600" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => handleDelete(rule.id)} className="text-rose-600 hover:bg-rose-50">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* MODAL FORMULÁRIO */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-2xl bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 font-bold">
                            {editingRule ? 'Editar Regra Operacional Fiscal' : 'Nova Regra Operacional Fiscal'}
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="space-y-4 py-2 text-xs">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2 space-y-1">
                                <Label>Descrição da Regra *</Label>
                                <Input value={description} onChange={e => setDescription(e.target.value)} required placeholder="Ex: Devolução Simbólica SP" />
                            </div>

                            <div className="space-y-1">
                                <Label>Tipo de Operação *</Label>
                                <Select value={operationType} onValueChange={setOperationType}>
                                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">1 - Retorno Físico ao Depositante</SelectItem>
                                        <SelectItem value="2">2 - Retorno Simbólico (Venda)</SelectItem>
                                        <SelectItem value="3">3 - Remessa por Conta e Ordem</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* CFOPS & TRIBUTOS */}
                        <div className="p-3 bg-slate-50 border rounded-xl space-y-3">
                            <span className="font-bold text-slate-800 uppercase text-[10px] block">Configuração de CFOPs e Enquadramento</span>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                    <Label>CFOP Interno (Dentro Estado)</Label>
                                    <Input value={cfopStateInternal} onChange={e => setCfopStateInternal(e.target.value)} className="font-mono" placeholder="5906" />
                                </div>
                                <div>
                                    <Label>CFOP Interestadual</Label>
                                    <Input value={cfopInterstate} onChange={e => setCfopInterstate(e.target.value)} className="font-mono" placeholder="6906" />
                                </div>
                                <div>
                                    <Label>CST / CSOSN ICMS</Label>
                                    <Input value={cstCsosnIcms} onChange={e => setCstCsosnIcms(e.target.value)} className="font-mono" placeholder="400" />
                                </div>
                                <div>
                                    <Label>CST PIS/COFINS</Label>
                                    <Input value={cstPisCofins} onChange={e => setCstPisCofins(e.target.value)} className="font-mono" placeholder="08" />
                                </div>
                            </div>
                        </div>

                        {/* REGRAS DE EXCEÇÃO */}
                        <div className="p-3 bg-orange-50/50 border border-orange-200 rounded-xl space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-orange-900 uppercase text-[10px] flex items-center gap-1">
                                    <Filter size={13} /> Condições de Exceção (Filtros de Aplicação)
                                </span>
                                <span className="text-[10px] text-orange-700">Deixe em "Todos" para atuar como Regra Geral</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <Label>Depositante Específico</Label>
                                    <Select value={specificCustomerId} onValueChange={setSpecificCustomerId}>
                                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">Todos os Depositantes</SelectItem>
                                            {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label>UF Destino Específica</Label>
                                    <Select value={specificDestinationState} onValueChange={setSpecificDestinationState}>
                                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">Todas as UFs</SelectItem>
                                            {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label>Início NCM (Ex: 2204)</Label>
                                    <Input value={specificNcmStart} onChange={e => setSpecificNcmStart(e.target.value)} className="font-mono" placeholder="Opcional" />
                                </div>
                            </div>

                            <div className="pt-2 border-t border-orange-200/60 flex items-center gap-3">
                                <Label className="text-slate-800 shrink-0">Prioridade de Aplicação:</Label>
                                <Input type="number" value={priority} onChange={e => setPriority(e.target.value)} className="w-24 bg-white font-mono" />
                                <span className="text-[10px] text-slate-500">Regras de prioridade mais alta (ex: 100) ganham de regras gerais (ex: 10).</span>
                            </div>
                        </div>

                        <div>
                            <Label>Observações Fiscais Padrão (infCpl)</Label>
                            <Input value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} className="font-mono text-xs" placeholder="Texto automático inserido nos Dados Adicionais da NF-e" />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSaving}>Cancelar</Button>
                            <Button type="submit" disabled={isSaving} className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
                                {isSaving ? 'Salvando...' : 'Salvar Regra Fiscal'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}       