import { useEffect, useState } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Plus, Pencil, Trash2, Search, Filter, Layers, FileCode, Sparkles, ChevronDown, ChevronRight, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const ORIGENS_MERCADORIA = [
    { value: 'ALL', label: 'Todas as Origens' },
    { value: '0', label: '0 - Nacional' },
    { value: '1', label: '1 - Estrangeira (Importação Direta)' },
    { value: '2', label: '2 - Estrangeira (Adquirida no Mercado Interno)' },
    { value: '3', label: '3 - Nacional com Conteúdo de Importação > 40%' },
    { value: '4', label: '4 - Nacional com Produção Conforme Processos Básicos' },
    { value: '5', label: '5 - Nacional com Conteúdo de Importação <= 40%' },
    { value: '6', label: '6 - Estrangeira (Importação Direta sem Similar Nacional)' },
    { value: '7', label: '7 - Estrangeira (Mercado Interno sem Similar Nacional)' },
    { value: '8', label: '8 - Nacional, Conteúdo de Importação > 70%' }
];

export default function FiscalOperationRulesPage() {
    const [rules, setRules] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [expandedRuleIds, setExpandedRuleIds] = useState({});

    // Modal da Regra Principal
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
    const [isSavingRule, setIsSavingRule] = useState(false);
    const [editingRule, setEditingRule] = useState(null);

    // Form Regra Principal
    const [description, setDescription] = useState('');
    const [finalidade, setFinalidade] = useState('1');
    const [cfopStateInternal, setCfopStateInternal] = useState('5906');
    const [cfopInterstate, setCfopInterstate] = useState('6906');

    // ICMS
    const [cstCsosnIcms, setCstCsosnIcms] = useState('400');
    const [modBcIcms, setModBcIcms] = useState('3');
    const [aliqIcms, setAliqIcms] = useState('0');
    const [reducaoBcIcms, setReducaoBcIcms] = useState('0');
    const [modBcIcmsSt, setModBcIcmsSt] = useState('4');
    const [mvaIcmsSt, setMvaIcmsSt] = useState('0');
    const [reducaoBcIcmsSt, setReducaoBcIcmsSt] = useState('0');
    const [aliqIcmsSt, setAliqIcmsSt] = useState('0');
    const [motivoDesoneracaoIcms, setMotivoDesoneracaoIcms] = useState('');
    const [aliqCreditoSimples, setAliqCreditoSimples] = useState('0');

    // IPI / PIS / COFINS
    const [cstIpi, setCstIpi] = useState('53');
    const [codigoEnquadramentoIpi, setCodigoEnquadramentoIpi] = useState('999');
    const [aliqIpi, setAliqIpi] = useState('0');
    const [cstPis, setCstPis] = useState('08');
    const [aliqPis, setAliqPis] = useState('0');
    const [cstCofins, setCstCofins] = useState('08');
    const [aliqCofins, setAliqCofins] = useState('0');

    // Reforma Tributária (IBS / CBS)
    const [cstIbs, setCstIbs] = useState('410');
    const [aliqIbs, setAliqIbs] = useState('0.10');
    const [cstCbs, setCstCbs] = useState('410');
    const [aliqCbs, setAliqCbs] = useState('0.90');
    const [classificacaoTributaria, setClassificacaoTributaria] = useState('410999');
    const [additionalNotes, setAdditionalNotes] = useState('');

    // Modal de Exceção
    const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
    const [selectedRuleForException, setSelectedRuleForException] = useState(null);
    const [editingException, setEditingException] = useState(null);
    const [isSavingException, setIsSavingException] = useState(false);

    // Form Exceção
    const [excDestinationState, setExcDestinationState] = useState('ALL');
    const [excNcmStart, setExcNcmStart] = useState('');
    const [excOrigin, setExcOrigin] = useState('ALL');
    const [excCfopInternal, setExcCfopInternal] = useState('');
    const [excCfopInter, setExcCfopInter] = useState('');
    const [excCstIcms, setExcCstIcms] = useState('');
    const [excAliqIcms, setExcAliqIcms] = useState('');
    const [excReducaoBcIcms, setExcReducaoBcIcms] = useState('');
    const [excCstIpi, setExcCstIpi] = useState('');
    const [excAliqIpi, setExcAliqIpi] = useState('');
    const [excCstPis, setExcCstPis] = useState('');
    const [excAliqPis, setExcAliqPis] = useState('');
    const [excCstCofins, setExcCstCofins] = useState('');
    const [excAliqCofins, setExcAliqCofins] = useState('');
    const [excNotes, setExcNotes] = useState('');

    const loadRules = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/fiscal/rules', method: 'GET' });
            setRules(res?.data || res || []);
        } catch {
            toast.error('Erro ao carregar naturezas de operação fiscal.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadRules();
    }, []);

    const toggleExpand = (ruleId) => {
        setExpandedRuleIds(prev => ({ ...prev, [ruleId]: !prev[ruleId] }));
    };

    const handleOpenRuleModal = (rule = null) => {
        if (rule) {
            setEditingRule(rule);
            setDescription(rule.description || '');
            setFinalidade(rule.finalidade?.toString() || '1');
            setCfopStateInternal(rule.cfopStateInternal || '5906');
            setCfopInterstate(rule.cfopInterstate || '6906');
            setCstCsosnIcms(rule.cstCsosnIcms || '400');
            setModBcIcms(rule.modBcIcms?.toString() || '3');
            setAliqIcms(rule.aliqIcms?.toString() || '0');
            setReducaoBcIcms(rule.reducaoBcIcms?.toString() || '0');
            setModBcIcmsSt(rule.modBcIcmsSt?.toString() || '4');
            setMvaIcmsSt(rule.mvaIcmsSt?.toString() || '0');
            setReducaoBcIcmsSt(rule.reducaoBcIcmsSt?.toString() || '0');
            setAliqIcmsSt(rule.aliqIcmsSt?.toString() || '0');
            setMotivoDesoneracaoIcms(rule.motivoDesoneracaoIcms?.toString() || '');
            setAliqCreditoSimples(rule.aliqCreditoSimples?.toString() || '0');
            setCstIpi(rule.cstIpi || '53');
            setCodigoEnquadramentoIpi(rule.codigoEnquadramentoIpi?.toString() || '999');
            setAliqIpi(rule.aliqIpi?.toString() || '0');
            setCstPis(rule.cstPis || '08');
            setAliqPis(rule.aliqPis?.toString() || '0');
            setCstCofins(rule.cstCofins || '08');
            setAliqCofins(rule.aliqCofins?.toString() || '0');
            setCstIbs(rule.cstIbs || '410');
            setAliqIbs(rule.aliqIbs?.toString() || '0.10');
            setCstCbs(rule.cstCbs || '410');
            setAliqCbs(rule.aliqCbs?.toString() || '0.90');
            setClassificacaoTributaria(rule.classificacaoTributaria || '410999');
            setAdditionalNotes(rule.additionalNotes || '');
        } else {
            setEditingRule(null);
            setDescription('');
            setFinalidade('1');
            setCfopStateInternal('5906');
            setCfopInterstate('6906');
            setCstCsosnIcms('400');
            setModBcIcms('3');
            setAliqIcms('0');
            setReducaoBcIcms('0');
            setModBcIcmsSt('4');
            setMvaIcmsSt('0');
            setReducaoBcIcmsSt('0');
            setAliqIcmsSt('0');
            setMotivoDesoneracaoIcms('');
            setAliqCreditoSimples('0');
            setCstIpi('53');
            setCodigoEnquadramentoIpi('999');
            setAliqIpi('0');
            setCstPis('08');
            setAliqPis('0');
            setCstCofins('08');
            setAliqCofins('0');
            setCstIbs('410');
            setAliqIbs('0.10');
            setCstCbs('410');
            setAliqCbs('0.90');
            setClassificacaoTributaria('410999');
            setAdditionalNotes('');
        }
        setIsRuleModalOpen(true);
    };

    const handleSaveRule = async (e) => {
        e.preventDefault();
        try {
            setIsSavingRule(true);
            const payload = {
                id: editingRule?.id,
                description,
                finalidade: Number(finalidade),
                cfopStateInternal,
                cfopInterstate,
                cstCsosnIcms,
                modBcIcms: Number(modBcIcms),
                aliqIcms: Number(aliqIcms),
                reducaoBcIcms: Number(reducaoBcIcms),
                modBcIcmsSt: Number(modBcIcmsSt),
                mvaIcmsSt: Number(mvaIcmsSt),
                reducaoBcIcmsSt: Number(reducaoBcIcmsSt),
                aliqIcmsSt: Number(aliqIcmsSt),
                motivoDesoneracaoIcms: motivoDesoneracaoIcms ? Number(motivoDesoneracaoIcms) : null,
                aliqCreditoSimples: Number(aliqCreditoSimples),
                cstIpi,
                codigoEnquadramentoIpi: Number(codigoEnquadramentoIpi),
                aliqIpi: Number(aliqIpi),
                cstPis,
                aliqPis: Number(aliqPis),
                cstCofins,
                aliqCofins: Number(aliqCofins),
                cstIbs,
                aliqIbs: Number(aliqIbs),
                cstCbs,
                aliqCbs: Number(aliqCbs),
                classificacaoTributaria,
                additionalNotes
            };

            await customInstance({
                url: '/api/fiscal/rules',
                method: 'POST',
                data: payload
            });

            toast.success(editingRule ? 'Natureza de Operação atualizada!' : 'Natureza de Operação cadastrada!');
            setIsRuleModalOpen(false);
            loadRules();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar natureza fiscal.');
        } finally {
            setIsSavingRule(false);
        }
    };

    const handleOpenExceptionModal = (rule, exc = null) => {
        setSelectedRuleForException(rule);
        if (exc) {
            setEditingException(exc);
            setExcDestinationState(exc.specificDestinationState || 'ALL');
            setExcNcmStart(exc.specificNcmStart || '');
            setExcOrigin(exc.specificOrigin !== null && exc.specificOrigin !== undefined ? exc.specificOrigin.toString() : 'ALL');
            setExcCfopInternal(exc.cfopStateInternal || '');
            setExcCfopInter(exc.cfopInterstate || '');
            setExcCstIcms(exc.cstCsosnIcms || '');
            setExcAliqIcms(exc.aliqIcms?.toString() || '');
            setExcReducaoBcIcms(exc.reducaoBcIcms?.toString() || '');
            setExcCstIpi(exc.cstIpi || '');
            setExcAliqIpi(exc.aliqIpi?.toString() || '');
            setExcCstPis(exc.cstPis || '');
            setExcAliqPis(exc.aliqPis?.toString() || '');
            setExcCstCofins(exc.cstCofins || '');
            setExcAliqCofins(exc.aliqCofins?.toString() || '');
            setExcNotes(exc.additionalNotes || '');
        } else {
            setEditingException(null);
            setExcDestinationState('ALL');
            setExcNcmStart('');
            setExcOrigin('ALL');
            setExcCfopInternal('');
            setExcCfopInter('');
            setExcCstIcms('');
            setExcAliqIcms('');
            setExcReducaoBcIcms('');
            setExcCstIpi('');
            setExcAliqIpi('');
            setExcCstPis('');
            setExcAliqPis('');
            setExcCstCofins('');
            setExcAliqCofins('');
            setExcNotes('');
        }
        setIsExceptionModalOpen(true);
    };

    const handleSaveException = async (e) => {
        e.preventDefault();
        try {
            setIsSavingException(true);
            const payload = {
                ruleId: selectedRuleForException.id,
                exceptionId: editingException?.id,
                specificDestinationState: excDestinationState === 'ALL' ? null : excDestinationState,
                specificNcmStart: excNcmStart ? excNcmStart.trim() : null,
                specificOrigin: excOrigin === 'ALL' ? null : Number(excOrigin),
                cfopStateInternal: excCfopInternal || null,
                cfopInterstate: excCfopInter || null,
                cstCsosnIcms: excCstIcms || null,
                aliqIcms: excAliqIcms ? Number(excAliqIcms) : null,
                reducaoBcIcms: excReducaoBcIcms ? Number(excReducaoBcIcms) : null,
                cstIpi: excCstIpi || null,
                aliqIpi: excAliqIpi ? Number(excAliqIpi) : null,
                cstPis: excCstPis || null,
                aliqPis: excAliqPis ? Number(excAliqPis) : null,
                cstCofins: excCstCofins || null,
                aliqCofins: excAliqCofins ? Number(excAliqCofins) : null,
                additionalNotes: excNotes || null
            };

            await customInstance({
                url: `/api/fiscal/rules/${selectedRuleForException.id}/exceptions`,
                method: 'POST',
                data: payload
            });

            toast.success('Linha de exceção salva com sucesso!');
            setIsExceptionModalOpen(false);
            loadRules();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar linha de exceção.');
        } finally {
            setIsSavingException(false);
        }
    };

    const handleDeleteException = async (ruleId, exceptionId) => {
        if (!confirm('Deseja realmente remover esta linha de exceção fiscal?')) return;
        try {
            await customInstance({
                url: `/api/fiscal/rules/${ruleId}/exceptions/${exceptionId}`,
                method: 'DELETE'
            });
            toast.success('Exceção fiscal excluída!');
            loadRules();
        } catch {
            toast.error('Erro ao excluir exceção fiscal.');
        }
    };

    const handleToggleActive = async (id) => {
        try {
            await customInstance({ url: `/api/fiscal/rules/${id}/toggle`, method: 'PATCH' });
            toast.success('Status da natureza atualizado!');
            loadRules();
        } catch {
            toast.error('Erro ao alterar status.');
        }
    };

    const handleDeleteRule = async (id) => {
        if (!confirm('Deseja realmente remover esta Natureza de Operação e todas as suas exceções?')) return;
        try {
            await customInstance({ url: `/api/fiscal/rules/${id}`, method: 'DELETE' });
            toast.success('Natureza de Operação excluída!');
            loadRules();
        } catch {
            toast.error('Erro ao excluir natureza fiscal.');
        }
    };

    const filteredRules = rules.filter(r =>
        r.description.toLowerCase().includes(search.toLowerCase()) ||
        r.cfopStateInternal.includes(search) ||
        r.cfopInterstate.includes(search)
    );

    const getFinalidadeBadge = (finalidade) => {
        switch (finalidade) {
            case 1: return <Badge className="bg-blue-100 text-blue-800">1 - NF-e Normal</Badge>;
            case 2: return <Badge className="bg-sky-100 text-sky-800">2 - Complementar</Badge>;
            case 3: return <Badge className="bg-amber-100 text-amber-800">3 - Ajuste</Badge>;
            case 4: return <Badge className="bg-purple-100 text-purple-800">4 - Devolução / Retorno</Badge>;
            case 5: return <Badge className="bg-emerald-100 text-emerald-800">5 - Nota de Crédito (RT)</Badge>;
            case 6: return <Badge className="bg-rose-100 text-rose-800">6 - Nota de Débito (RT)</Badge>;
            default: return <Badge variant="outline">Finalidade {finalidade}</Badge>;
        }
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Naturezas de Operação & Regras Fiscais</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Configure a matriz tributária universal (CFOP, ICMS, IPI, PIS/COFINS, IBS/CBS) e as linhas de exceção por UF, NCM e Origem.
                    </p>
                </div>
                <Button onClick={() => handleOpenRuleModal()} className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
                    <Plus className="mr-2 h-4 w-4" /> Nova Natureza de Operação
                </Button>
            </div>

            {/* TABELA PRINCIPAL */}
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
                    <Badge variant="secondary" className="font-mono">{filteredRules.length} Natureza(s)</Badge>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead>Descrição / Natureza</TableHead>
                                <TableHead className="text-center">Finalidade (finNFe)</TableHead>
                                <TableHead className="text-center">CFOP (Intra / Inter)</TableHead>
                                <TableHead className="text-center">Tributação Base (ICMS / IPI / PIS)</TableHead>
                                <TableHead className="text-center">Exceções</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-28 text-center text-slate-400 italic">
                                        Nenhuma natureza de operação cadastrada.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredRules.map(rule => {
                                    const isExpanded = !!expandedRuleIds[rule.id];
                                    const excCount = rule.exceptions?.length || 0;

                                    return (
                                        <>
                                            <TableRow key={rule.id} className="hover:bg-slate-50/50">
                                                <TableCell className="text-center">
                                                    <Button variant="ghost" size="sm" onClick={() => toggleExpand(rule.id)} className="h-7 w-7 p-0">
                                                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-bold text-slate-900 block text-xs">{rule.description}</span>
                                                    {rule.additionalNotes && (
                                                        <span className="text-[10px] text-slate-400 font-mono block max-w-xs truncate" title={rule.additionalNotes}>
                                                            {rule.additionalNotes}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {getFinalidadeBadge(rule.finalidade)}
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-xs font-bold text-slate-800">
                                                    <span className="text-blue-700">{rule.cfopStateInternal}</span> / <span className="text-purple-700">{rule.cfopInterstate}</span>
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-[11px] text-slate-600">
                                                    ICMS: <strong>{rule.cstCsosnIcms}</strong> | IPI: <strong>{rule.cstIpi}</strong> | PIS: <strong>{rule.cstPis}</strong>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={excCount > 0 ? 'secondary' : 'outline'} className="font-mono text-[10px]">
                                                        {excCount} exceção(ões)
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Switch checked={rule.isActive} onCheckedChange={() => handleToggleActive(rule.id)} />
                                                </TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button size="sm" variant="outline" onClick={() => handleOpenExceptionModal(rule)} className="h-7 text-[11px] border-orange-200 text-orange-800 hover:bg-orange-50">
                                                        <Plus size={12} className="mr-1 text-orange-600" /> Exceção
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => handleOpenRuleModal(rule)} className="h-7 w-7 p-0">
                                                        <Pencil className="h-3.5 w-3.5 text-slate-600" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => handleDeleteRule(rule.id)} className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>

                                            {/* LINHAS DE EXCEÇÃO EXPANDIDAS */}
                                            {isExpanded && (
                                                <TableRow className="bg-slate-50/80">
                                                    <TableCell colSpan={8} className="p-3 pl-12">
                                                        <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                                                                    <Filter size={13} className="text-orange-600" /> Exceções Tributárias Vinculadas ({excCount})
                                                                </span>
                                                                <Button size="sm" variant="outline" onClick={() => handleOpenExceptionModal(rule)} className="h-7 text-[11px]">
                                                                    <Plus size={12} className="mr-1" /> Nova Linha de Exceção
                                                                </Button>
                                                            </div>

                                                            {excCount === 0 ? (
                                                                <p className="text-xs text-slate-400 italic py-2">
                                                                    Nenhuma exceção cadastrada. Todos os itens seguirão as regras base da natureza.
                                                                </p>
                                                            ) : (
                                                                <Table>
                                                                    <TableHeader className="bg-slate-50/50">
                                                                        <TableRow>
                                                                            <TableHead>Condições (Gatilhos)</TableHead>
                                                                            <TableHead className="text-center">CFOP Substituto</TableHead>
                                                                            <TableHead className="text-center">ICMS</TableHead>
                                                                            <TableHead className="text-center">IPI</TableHead>
                                                                            <TableHead className="text-center">PIS / COFINS</TableHead>
                                                                            <TableHead className="text-right">Ações</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {rule.exceptions.map(exc => (
                                                                            <TableRow key={exc.id} className="text-xs">
                                                                                <TableCell className="font-mono space-x-1">
                                                                                    {exc.specificDestinationState && (
                                                                                        <Badge className="bg-blue-100 text-blue-800 text-[10px]">UF: {exc.specificDestinationState}</Badge>
                                                                                    )}
                                                                                    {exc.specificNcmStart && (
                                                                                        <Badge className="bg-amber-100 text-amber-800 text-[10px]">NCM: {exc.specificNcmStart}*</Badge>
                                                                                    )}
                                                                                    {exc.specificOrigin !== null && exc.specificOrigin !== undefined && (
                                                                                        <Badge className="bg-purple-100 text-purple-800 text-[10px]">Origem: {exc.specificOrigin}</Badge>
                                                                                    )}
                                                                                    {!exc.specificDestinationState && !exc.specificNcmStart && exc.specificOrigin === null && (
                                                                                        <Badge variant="outline" className="text-[10px]">Geral</Badge>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="text-center font-mono font-bold text-slate-700">
                                                                                    {exc.cfopStateInternal || exc.cfopInterstate ? (
                                                                                        <span>{exc.cfopStateInternal || '-'} / {exc.cfopInterstate || '-'}</span>
                                                                                    ) : (
                                                                                        <span className="text-slate-400 italic">Padrão</span>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="text-center font-mono">
                                                                                    {exc.cstCsosnIcms ? <strong>CST {exc.cstCsosnIcms} ({exc.aliqIcms || 0}%)</strong> : <span className="text-slate-400 italic">Padrão</span>}
                                                                                </TableCell>
                                                                                <TableCell className="text-center font-mono">
                                                                                    {exc.cstIpi ? <span>CST {exc.cstIpi}</span> : <span className="text-slate-400 italic">Padrão</span>}
                                                                                </TableCell>
                                                                                <TableCell className="text-center font-mono">
                                                                                    {exc.cstPis ? <span>PIS {exc.cstPis}</span> : <span className="text-slate-400 italic">Padrão</span>}
                                                                                </TableCell>
                                                                                <TableCell className="text-right space-x-1">
                                                                                    <Button size="sm" variant="ghost" onClick={() => handleOpenExceptionModal(rule, exc)} className="h-6 w-6 p-0">
                                                                                        <Pencil size={12} className="text-slate-600" />
                                                                                    </Button>
                                                                                    <Button size="sm" variant="ghost" onClick={() => handleDeleteException(rule.id, exc.id)} className="h-6 w-6 p-0 text-rose-600">
                                                                                        <Trash2 size={12} />
                                                                                    </Button>
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* MODAL NATUREZA DE OPERAÇÃO BASE */}
            <Dialog open={isRuleModalOpen} onOpenChange={setIsRuleModalOpen}>
                <DialogContent className="sm:max-w-3xl bg-white max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
                            <FileCode className="text-orange-600" size={20} />
                            {editingRule ? 'Editar Natureza de Operação' : 'Nova Natureza de Operação'}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Configure os parâmetros fiscais soberanos aplicados à emissão de NF-e.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveRule} className="space-y-4 py-2 text-xs">
                        {/* IDENTIFICAÇÃO BÁSICA */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2 space-y-1">
                                <Label>Descrição da Natureza de Operação *</Label>
                                <Input
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    required
                                    placeholder="Ex: Retorno de Mercadoria Depositada em Armazém Geral"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label>Finalidade da NF-e (finNFe) *</Label>
                                <Select value={finalidade} onValueChange={setFinalidade}>
                                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">1 - NF-e Normal</SelectItem>
                                        <SelectItem value="2">2 - NF-e Complementar</SelectItem>
                                        <SelectItem value="3">3 - NF-e de Ajuste</SelectItem>
                                        <SelectItem value="4">4 - Devolução / Retorno</SelectItem>
                                        <SelectItem value="5">5 - Nota de Crédito (RT)</SelectItem>
                                        <SelectItem value="6">6 - Nota de Débito (RT)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* TABS DE TRIBUTAÇÃO */}
                        <Tabs defaultValue="cfop" className="w-full">
                            <TabsList className="grid grid-cols-4 bg-slate-100">
                                <TabsTrigger value="cfop">CFOP / ICMS</TabsTrigger>
                                <TabsTrigger value="ipi">IPI</TabsTrigger>
                                <TabsTrigger value="pis">PIS / COFINS</TabsTrigger>
                                <TabsTrigger value="rt">Reforma (IBS/CBS)</TabsTrigger>
                            </TabsList>

                            {/* TAB CFOP & ICMS */}
                            <TabsContent value="cfop" className="space-y-3 pt-2">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label>CFOP Interno (Dentro Estado) *</Label>
                                        <Input value={cfopStateInternal} onChange={e => setCfopStateInternal(e.target.value)} maxLength={4} className="font-mono" required />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>CFOP Interestadual *</Label>
                                        <Input value={cfopInterstate} onChange={e => setCfopInterstate(e.target.value)} maxLength={4} className="font-mono" required />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
                                    <div className="space-y-1">
                                        <Label>CST / CSOSN ICMS *</Label>
                                        <Input value={cstCsosnIcms} onChange={e => setCstCsosnIcms(e.target.value)} maxLength={3} className="font-mono" placeholder="400" required />
                                    </div>

                                    <div className="space-y-1">
                                        <Label>Modalidade BC (modBC)</Label>
                                        <Select value={modBcIcms} onValueChange={setModBcIcms}>
                                            <SelectTrigger className="bg-white font-mono"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="0">0 - Margem Valor Agregado</SelectItem>
                                                <SelectItem value="1">1 - Pauta</SelectItem>
                                                <SelectItem value="2">2 - Preço Tabelado</SelectItem>
                                                <SelectItem value="3">3 - Valor da Operação</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1">
                                        <Label>Alíquota ICMS (%)</Label>
                                        <Input type="number" step="0.01" value={aliqIcms} onChange={e => setAliqIcms(e.target.value)} className="font-mono" />
                                    </div>

                                    <div className="space-y-1">
                                        <Label>Redução BC ICMS (%)</Label>
                                        <Input type="number" step="0.01" value={reducaoBcIcms} onChange={e => setReducaoBcIcms(e.target.value)} className="font-mono" />
                                    </div>
                                </div>
                            </TabsContent>

                            {/* TAB IPI */}
                            <TabsContent value="ipi" className="space-y-3 pt-2">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <Label>CST IPI *</Label>
                                        <Input value={cstIpi} onChange={e => setCstIpi(e.target.value)} maxLength={2} className="font-mono" placeholder="53" required />
                                        <span className="text-[10px] text-slate-400">53=Não Tributado, 50=Tributado</span>
                                    </div>

                                    <div className="space-y-1">
                                        <Label>Cód. Enquadramento IPI (cEnq)</Label>
                                        <Input type="number" value={codigoEnquadramentoIpi} onChange={e => setCodigoEnquadramentoIpi(e.target.value)} className="font-mono" placeholder="999" />
                                    </div>

                                    <div className="space-y-1">
                                        <Label>Alíquota IPI (%)</Label>
                                        <Input type="number" step="0.01" value={aliqIpi} onChange={e => setAliqIpi(e.target.value)} className="font-mono" />
                                    </div>
                                </div>
                            </TabsContent>

                            {/* TAB PIS & COFINS */}
                            <TabsContent value="pis" className="space-y-3 pt-2">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="space-y-1">
                                        <Label>CST PIS *</Label>
                                        <Input value={cstPis} onChange={e => setCstPis(e.target.value)} maxLength={2} className="font-mono" placeholder="08" required />
                                    </div>

                                    <div className="space-y-1">
                                        <Label>Alíquota PIS (%)</Label>
                                        <Input type="number" step="0.01" value={aliqPis} onChange={e => setAliqPis(e.target.value)} className="font-mono" />
                                    </div>

                                    <div className="space-y-1">
                                        <Label>CST COFINS *</Label>
                                        <Input value={cstCofins} onChange={e => setCstCofins(e.target.value)} maxLength={2} className="font-mono" placeholder="08" required />
                                    </div>

                                    <div className="space-y-1">
                                        <Label>Alíquota COFINS (%)</Label>
                                        <Input type="number" step="0.01" value={aliqCofins} onChange={e => setAliqCofins(e.target.value)} className="font-mono" />
                                    </div>
                                </div>
                            </TabsContent>

                            {/* TAB REFORMA TRIBUTÁRIA (2026) */}
                            <TabsContent value="rt" className="space-y-3 pt-2">
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    <div className="space-y-1">
                                        <Label>CST IBS</Label>
                                        <Input value={cstIbs} onChange={e => setCstIbs(e.target.value)} maxLength={3} className="font-mono" placeholder="410" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Alíquota IBS (%)</Label>
                                        <Input type="number" step="0.01" value={aliqIbs} onChange={e => setAliqIbs(e.target.value)} className="font-mono" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>CST CBS</Label>
                                        <Input value={cstCbs} onChange={e => setCstCbs(e.target.value)} maxLength={3} className="font-mono" placeholder="410" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Alíquota CBS (%)</Label>
                                        <Input type="number" step="0.01" value={aliqCbs} onChange={e => setAliqCbs(e.target.value)} className="font-mono" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>Classif. Trib (cClassTrib)</Label>
                                        <Input value={classificacaoTributaria} onChange={e => setClassificacaoTributaria(e.target.value)} maxLength={6} className="font-mono" placeholder="410999" />
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>

                        <div className="space-y-1 pt-2 border-t">
                            <Label>Observações Fiscais Padrão (infCpl)</Label>
                            <Input
                                value={additionalNotes}
                                onChange={e => setAdditionalNotes(e.target.value)}
                                className="font-mono text-xs"
                                placeholder="Texto inserido nos Dados Adicionais da NF-e"
                            />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsRuleModalOpen(false)} disabled={isSavingRule}>Cancelar</Button>
                            <Button type="submit" disabled={isSavingRule} className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
                                {isSavingRule ? 'Salvando...' : 'Salvar Natureza de Operação'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL LINHA DE EXCEÇÃO (UF, NCM, ORIGEM) */}
            <Dialog open={isExceptionModalOpen} onOpenChange={setIsExceptionModalOpen}>
                <DialogContent className="sm:max-w-xl bg-white max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
                            <Filter className="text-orange-600" size={18} />
                            {editingException ? 'Editar Linha de Exceção' : 'Nova Linha de Exceção Fiscal'}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Regra vinculada a: <strong>{selectedRuleForException?.description}</strong>
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveException} className="space-y-4 py-2 text-xs">
                        {/* GATILHOS DA EXCEÇÃO */}
                        <div className="p-3 bg-orange-50/60 border border-orange-200 rounded-xl space-y-3">
                            <span className="font-bold text-orange-950 uppercase text-[10px] block">
                                Gatilhos de Disparo da Exceção
                            </span>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label>UF Destino</Label>
                                    <Select value={excDestinationState} onValueChange={setExcDestinationState}>
                                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">Todas as UFs</SelectItem>
                                            {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <Label>Início NCM (Ex: 2204)</Label>
                                    <Input
                                        value={excNcmStart}
                                        onChange={e => setExcNcmStart(e.target.value)}
                                        className="font-mono bg-white"
                                        placeholder="Em branco = Todos"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label>Origem da Mercadoria</Label>
                                    <Select value={excOrigin} onValueChange={setExcOrigin}>
                                        <SelectTrigger className="bg-white truncate"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {ORIGENS_MERCADORIA.map(o => (
                                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {/* SOBREPOSIÇÃO DE IMPOSTOS */}
                        <div className="space-y-3">
                            <span className="font-bold text-slate-700 uppercase text-[10px] block">
                                Sobrescrever Campos da Matriz (Em branco = Mantém Padrão)
                            </span>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label>CFOP Interno Específico</Label>
                                    <Input value={excCfopInternal} onChange={e => setExcCfopInternal(e.target.value)} className="font-mono" placeholder="Ex: 5907" />
                                </div>
                                <div>
                                    <Label>CFOP Interestadual Específico</Label>
                                    <Input value={excCfopInter} onChange={e => setExcCfopInter(e.target.value)} className="font-mono" placeholder="Ex: 6907" />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                                <div>
                                    <Label>CST ICMS Substituto</Label>
                                    <Input value={excCstIcms} onChange={e => setExcCstIcms(e.target.value)} className="font-mono" placeholder="Ex: 00" />
                                </div>
                                <div>
                                    <Label>Alíquota ICMS (%)</Label>
                                    <Input type="number" step="0.01" value={excAliqIcms} onChange={e => setExcAliqIcms(e.target.value)} className="font-mono" />
                                </div>
                                <div>
                                    <Label>Redução BC (%)</Label>
                                    <Input type="number" step="0.01" value={excReducaoBcIcms} onChange={e => setExcReducaoBcIcms(e.target.value)} className="font-mono" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
                                <div>
                                    <Label>CST IPI</Label>
                                    <Input value={excCstIpi} onChange={e => setExcCstIpi(e.target.value)} className="font-mono" placeholder="50" />
                                </div>
                                <div>
                                    <Label>Alíquota IPI (%)</Label>
                                    <Input type="number" step="0.01" value={excAliqIpi} onChange={e => setExcAliqIpi(e.target.value)} className="font-mono" />
                                </div>
                                <div>
                                    <Label>CST PIS</Label>
                                    <Input value={excCstPis} onChange={e => setExcCstPis(e.target.value)} className="font-mono" placeholder="01" />
                                </div>
                                <div>
                                    <Label>Alíquota PIS (%)</Label>
                                    <Input type="number" step="0.01" value={excAliqPis} onChange={e => setExcAliqPis(e.target.value)} className="font-mono" />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsExceptionModalOpen(false)} disabled={isSavingException}>Cancelar</Button>
                            <Button type="submit" disabled={isSavingException} className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
                                {isSavingException ? 'Salvando...' : 'Salvar Exceção'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}