import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, Save, Filter, Layers, Sparkles, CheckCircle2,
    Loader2, AlertCircle, FileCode
} from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const ORIGENS_MERCADORIA = [
    { value: 'ALL', label: 'Todas as Origens (Geral)' },
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

const MOTIVOS_DESONERACAO = [
    { value: 'NONE', label: 'Manter da Regra Base' },
    { value: '1', label: '1 - Táxi' },
    { value: '2', label: '2 - Deficiente Físico' },
    { value: '3', label: '3 - Produtor Agropecuário' },
    { value: '4', label: '4 - Frotista / Locadora' },
    { value: '5', label: '5 - Diplomático / Consular' },
    { value: '6', label: '6 - Utilitários e Motocicletas da Amazônia Ocidental e ALC' },
    { value: '7', label: '7 - SUFRAMA' },
    { value: '8', label: '8 - Venda a Órgãos Públicos' },
    { value: '9', label: '9 - Outros' },
    { value: '12', label: '12 - Fomento Agropecuário' },
    { value: '90', label: '90 - Solicitado pelo Fisco' }
];

export default function CreateOrEditRuleExceptionPage() {
    const { ruleId, exceptionId } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(exceptionId);

    const [activeTab, setActiveTab] = useState('gatilhos');
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [parentRule, setParentRule] = useState(null);

    // --- ABA 1: GATILHOS DE DISPARO ---
    const [specificDestinationState, setSpecificDestinationState] = useState('ALL');
    const [specificNcmStart, setSpecificNcmStart] = useState('');
    const [specificOrigin, setSpecificOrigin] = useState('ALL');

    // --- ABA 2: CFOP & ICMS SUBSTITUTO ---
    const [cfopStateInternal, setCfopStateInternal] = useState('');
    const [cfopInterstate, setCfopInterstate] = useState('');
    const [cstCsosnIcms, setCstCsosnIcms] = useState('');
    const [modBcIcms, setModBcIcms] = useState('NONE');
    const [aliqIcms, setAliqIcms] = useState('');
    const [reducaoBcIcms, setReducaoBcIcms] = useState('');
    const [aliqCreditoSimples, setAliqCreditoSimples] = useState('');
    const [motivoDesoneracaoIcms, setMotivoDesoneracaoIcms] = useState('NONE');

    // --- ABA 3: ICMS-ST (SUBSTITUIÇÃO TRIBUTÁRIA) ---
    const [modBcIcmsSt, setModBcIcmsSt] = useState('NONE');
    const [mvaIcmsSt, setMvaIcmsSt] = useState('');
    const [reducaoBcIcmsSt, setReducaoBcIcmsSt] = useState('');
    const [aliqIcmsSt, setAliqIcmsSt] = useState('');

    // --- ABA 4: IPI, PIS & COFINS ---
    const [cstIpi, setCstIpi] = useState('');
    const [codigoEnquadramentoIpi, setCodigoEnquadramentoIpi] = useState('');
    const [aliqIpi, setAliqIpi] = useState('');
    const [cstPis, setCstPis] = useState('');
    const [aliqPis, setAliqPis] = useState('');
    const [cstCofins, setCstCofins] = useState('');
    const [aliqCofins, setAliqCofins] = useState('');

    // --- ABA 5: REFORMA TRIBUTÁRIA (2026 - IBS/CBS) ---
    const [cstIbs, setCstIbs] = useState('');
    const [aliqIbs, setAliqIbs] = useState('');
    const [cstCbs, setCstCbs] = useState('');
    const [aliqCbs, setAliqCbs] = useState('');
    const [classificacaoTributaria, setClassificacaoTributaria] = useState('');

    // --- ABA 6: OBSERVAÇÕES ESPECÍFICAS ---
    const [additionalNotes, setAdditionalNotes] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoadingInitial(true);
                const ruleRes = await customInstance({ url: `/api/fiscal/rules/${ruleId}`, method: 'GET' });
                const rule = ruleRes?.data || ruleRes;
                setParentRule(rule);

                if (isEditing) {
                    const existingExc = rule.exceptions?.find(e => e.id === exceptionId);
                    if (existingExc) {
                        setSpecificDestinationState(existingExc.specificDestinationState || 'ALL');
                        setSpecificNcmStart(existingExc.specificNcmStart || '');
                        setSpecificOrigin(existingExc.specificOrigin !== null && existingExc.specificOrigin !== undefined ? existingExc.specificOrigin.toString() : 'ALL');

                        setCfopStateInternal(existingExc.cfopStateInternal || '');
                        setCfopInterstate(existingExc.cfopInterstate || '');
                        setCstCsosnIcms(existingExc.cstCsosnIcms || '');
                        setModBcIcms(existingExc.modBcIcms !== null && existingExc.modBcIcms !== undefined ? existingExc.modBcIcms.toString() : 'NONE');
                        setAliqIcms(existingExc.aliqIcms !== null && existingExc.aliqIcms !== undefined ? existingExc.aliqIcms.toString() : '');
                        setReducaoBcIcms(existingExc.reducaoBcIcms !== null && existingExc.reducaoBcIcms !== undefined ? existingExc.reducaoBcIcms.toString() : '');
                        setAliqCreditoSimples(existingExc.aliqCreditoSimples !== null && existingExc.aliqCreditoSimples !== undefined ? existingExc.aliqCreditoSimples.toString() : '');
                        setMotivoDesoneracaoIcms(existingExc.motivoDesoneracaoIcms ? existingExc.motivoDesoneracaoIcms.toString() : 'NONE');

                        setModBcIcmsSt(existingExc.modBcIcmsSt !== null && existingExc.modBcIcmsSt !== undefined ? existingExc.modBcIcmsSt.toString() : 'NONE');
                        setMvaIcmsSt(existingExc.mvaIcmsSt !== null && existingExc.mvaIcmsSt !== undefined ? existingExc.mvaIcmsSt.toString() : '');
                        setReducaoBcIcmsSt(existingExc.reducaoBcIcmsSt !== null && existingExc.reducaoBcIcmsSt !== undefined ? existingExc.reducaoBcIcmsSt.toString() : '');
                        setAliqIcmsSt(existingExc.aliqIcmsSt !== null && existingExc.aliqIcmsSt !== undefined ? existingExc.aliqIcmsSt.toString() : '');

                        setCstIpi(existingExc.cstIpi || '');
                        setCodigoEnquadramentoIpi(existingExc.codigoEnquadramentoIpi ? existingExc.codigoEnquadramentoIpi.toString() : '');
                        setAliqIpi(existingExc.aliqIpi !== null && existingExc.aliqIpi !== undefined ? existingExc.aliqIpi.toString() : '');

                        setCstPis(existingExc.cstPis || '');
                        setAliqPis(existingExc.aliqPis !== null && existingExc.aliqPis !== undefined ? existingExc.aliqPis.toString() : '');

                        setCstCofins(existingExc.cstCofins || '');
                        setAliqCofins(existingExc.aliqCofins !== null && existingExc.aliqCofins !== undefined ? existingExc.aliqCofins.toString() : '');

                        setCstIbs(existingExc.cstIbs || '');
                        setAliqIbs(existingExc.aliqIbs !== null && existingExc.aliqIbs !== undefined ? existingExc.aliqIbs.toString() : '');

                        setCstCbs(existingExc.cstCbs || '');
                        setAliqCbs(existingExc.aliqCbs !== null && existingExc.aliqCbs !== undefined ? existingExc.aliqCbs.toString() : '');

                        setClassificacaoTributaria(existingExc.classificacaoTributaria || '');
                        setAdditionalNotes(existingExc.additionalNotes || '');
                    } else {
                        toast.error('Linha de exceção não encontrada nesta regra.');
                        navigate(`/fiscal/regras/${ruleId}`);
                    }
                }
            } catch {
                toast.error('Erro ao carregar dados da regra fiscal.');
                navigate(`/fiscal/regras/${ruleId}`);
            } finally {
                setIsLoadingInitial(false);
            }
        };

        loadData();
    }, [ruleId, exceptionId]);

    const handleSave = async (e) => {
        e?.preventDefault();

        if (cfopStateInternal && cfopStateInternal.length !== 4) {
            setActiveTab('cfop_icms');
            return toast.error('CFOP Interno deve conter 4 dígitos.');
        }
        if (cfopInterstate && cfopInterstate.length !== 4) {
            setActiveTab('cfop_icms');
            return toast.error('CFOP Interestadual deve conter 4 dígitos.');
        }

        try {
            setIsSaving(true);
            const payload = {
                ruleId,
                exceptionId: isEditing ? exceptionId : null,
                specificDestinationState: specificDestinationState === 'ALL' ? null : specificDestinationState,
                specificNcmStart: specificNcmStart ? specificNcmStart.trim() : null,
                specificOrigin: specificOrigin === 'ALL' ? null : Number(specificOrigin),
                cfopStateInternal: cfopStateInternal.trim() || null,
                cfopInterstate: cfopInterstate.trim() || null,
                cstCsosnIcms: cstCsosnIcms.trim() || null,
                modBcIcms: modBcIcms !== 'NONE' ? Number(modBcIcms) : null,
                aliqIcms: aliqIcms ? parseFloat(aliqIcms) : null,
                reducaoBcIcms: reducaoBcIcms ? parseFloat(reducaoBcIcms) : null,
                modBcIcmsSt: modBcIcmsSt !== 'NONE' ? Number(modBcIcmsSt) : null,
                mvaIcmsSt: mvaIcmsSt ? parseFloat(mvaIcmsSt) : null,
                reducaoBcIcmsSt: reducaoBcIcmsSt ? parseFloat(reducaoBcIcmsSt) : null,
                aliqIcmsSt: aliqIcmsSt ? parseFloat(aliqIcmsSt) : null,
                motivoDesoneracaoIcms: motivoDesoneracaoIcms !== 'NONE' ? Number(motivoDesoneracaoIcms) : null,
                aliqCreditoSimples: aliqCreditoSimples ? parseFloat(aliqCreditoSimples) : null,
                cstIpi: cstIpi.trim() || null,
                codigoEnquadramentoIpi: codigoEnquadramentoIpi ? parseInt(codigoEnquadramentoIpi, 10) : null,
                aliqIpi: aliqIpi ? parseFloat(aliqIpi) : null,
                cstPis: cstPis.trim() || null,
                aliqPis: aliqPis ? parseFloat(aliqPis) : null,
                cstCofins: cstCofins.trim() || null,
                aliqCofins: aliqCofins ? parseFloat(aliqCofins) : null,
                cstIbs: cstIbs.trim() || null,
                aliqIbs: aliqIbs ? parseFloat(aliqIbs) : null,
                cstCbs: cstCbs.trim() || null,
                aliqCbs: aliqCbs ? parseFloat(aliqCbs) : null,
                classificacaoTributaria: classificacaoTributaria.trim() || null,
                additionalNotes: additionalNotes.trim() || null
            };

            await customInstance({
                url: `/api/fiscal/rules/${ruleId}/exceptions`,
                method: 'POST',
                data: payload
            });

            toast.success(isEditing ? 'Linha de exceção atualizada com sucesso!' : 'Linha de exceção cadastrada com sucesso!');
            navigate(`/fiscal/regras/${ruleId}`);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar linha de exceção.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoadingInitial) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando detalhes da linha de exceção...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/fiscal/regras/${ruleId}`)} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar à Regra
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900">
                                {isEditing ? 'Editar Linha de Exceção Fiscal' : 'Nova Linha de Exceção Fiscal'}
                            </h1>
                            <Badge className="bg-orange-100 text-orange-800 border-orange-200 font-mono text-xs">
                                {specificDestinationState !== 'ALL' ? `UF: ${specificDestinationState}` : 'Geral'}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Regra Vinculada: <strong className="text-slate-800">{parentRule?.description}</strong> (CFOP {parentRule?.cfopStateInternal} / {parentRule?.cfopInterstate})
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => navigate(`/fiscal/regras/${ruleId}`)} disabled={isSaving}>
                        Cancelar
                    </Button>

                    <Button onClick={handleSave} disabled={isSaving} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9 px-5">
                        {isSaving ? (
                            <>
                                <Loader2 className="animate-spin h-4 w-4 mr-2" /> Salvando Exceção...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" /> Salvar Exceção
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* CARD INFORMATIVO */}
            <div className="p-4 bg-orange-50/60 border border-orange-200 rounded-xl text-xs text-orange-950 flex items-start gap-3">
                <AlertCircle size={18} className="text-orange-600 shrink-0 mt-0.5" />
                <div>
                    <strong className="block mb-0.5">Comportamento da Matriz de Exceção:</strong>
                    Os campos deixados em branco herdarão automaticamente os valores padrão da Natureza de Operação base ({parentRule?.description}). Preencha apenas os tributos, alíquotas ou CFOPs que devam sobrescrever o cálculo para este gatilho.
                </div>
            </div>

            {/* FORMULÁRIO COM ABAS */}
            <form onSubmit={handleSave} className="flex-1 min-h-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full space-y-4">
                    <TabsList className="bg-white border border-slate-200/80 p-1 rounded-xl shadow-xs justify-start h-12 w-full gap-2 overflow-x-auto">
                        <TabsTrigger value="gatilhos" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <Filter size={15} /> 1. Gatilhos de Disparo
                        </TabsTrigger>
                        <TabsTrigger value="cfop_icms" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <Layers size={15} /> 2. CFOP & ICMS Substituto
                        </TabsTrigger>
                        <TabsTrigger value="icms_st" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <Layers size={15} /> 3. Substituição Tributária (ST)
                        </TabsTrigger>
                        <TabsTrigger value="ipi_pis" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <Sparkles size={15} /> 4. IPI, PIS & COFINS
                        </TabsTrigger>
                        <TabsTrigger value="reforma" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <CheckCircle2 size={15} /> 5. Reforma (IBS/CBS 2026)
                        </TabsTrigger>
                        <TabsTrigger value="observacoes" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <FileCode size={15} /> 6. Observações & Resumo
                        </TabsTrigger>
                    </TabsList>

                    {/* ABA 1: GATILHOS DE DISPARO */}
                    <TabsContent value="gatilhos" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Filter size={16} className="text-orange-600" /> Condições para Disparo da Exceção
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <p className="text-xs text-slate-500">
                                    A exceção será aplicada automaticamente durante a emissão da NF-e sempre que o produto e o destino coincidirem com os critérios abaixo:
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Estado de Destino (UF)</Label>
                                        <Select value={specificDestinationState} onValueChange={setSpecificDestinationState}>
                                            <SelectTrigger className="bg-white text-xs h-10"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">Todas as UFs (Válido Nacionalmente)</SelectItem>
                                                {ESTADOS_BR.map(uf => (
                                                    <SelectItem key={uf} value={uf}>UF: {uf}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span className="text-[10px] text-slate-400">Selecione uma UF específica para criar regras interestaduais sob medida.</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Prefixo ou NCM Completo</Label>
                                        <Input
                                            value={specificNcmStart}
                                            onChange={e => setSpecificNcmStart(e.target.value)}
                                            placeholder="Ex: 2204 ou 82119200"
                                            className="font-mono text-xs bg-white h-10"
                                        />
                                        <span className="text-[10px] text-slate-400">Em branco aplica para qualquer NCM. Informe 2, 4 ou 8 dígitos.</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Origem da Mercadoria</Label>
                                        <Select value={specificOrigin} onValueChange={setSpecificOrigin}>
                                            <SelectTrigger className="bg-white text-xs h-10 truncate"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {ORIGENS_MERCADORIA.map(o => (
                                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span className="text-[10px] text-slate-400">Gatilho pelo código de origem da tabela do produto (0=Nacional, 1=Importado, etc).</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 2: CFOP & ICMS SUBSTITUTO */}
                    <TabsContent value="cfop_icms" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Layers size={16} className="text-orange-600" /> Sobrescrita de CFOP & ICMS Normal
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CFOP Interno Específico</Label>
                                        <Input
                                            value={cfopStateInternal}
                                            onChange={e => setCfopStateInternal(e.target.value.replace(/\D/g, ''))}
                                            maxLength={4}
                                            placeholder={`Padrão Regra Base: ${parentRule?.cfopStateInternal || '5906'}`}
                                            className="font-mono text-xs bg-white h-9 font-bold text-blue-700"
                                        />
                                        <span className="text-[10px] text-slate-400">Deixe em branco para manter o CFOP interno padrão da regra.</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CFOP Interestadual Específico</Label>
                                        <Input
                                            value={cfopInterstate}
                                            onChange={e => setCfopInterstate(e.target.value.replace(/\D/g, ''))}
                                            maxLength={4}
                                            placeholder={`Padrão Regra Base: ${parentRule?.cfopInterstate || '6906'}`}
                                            className="font-mono text-xs bg-white h-9 font-bold text-purple-700"
                                        />
                                        <span className="text-[10px] text-slate-400">Deixe em branco para manter o CFOP interestadual padrão da regra.</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100 pt-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST ou CSOSN Substituto</Label>
                                        <Input
                                            value={cstCsosnIcms}
                                            onChange={e => setCstCsosnIcms(e.target.value)}
                                            maxLength={3}
                                            placeholder={`Padrão: ${parentRule?.cstCsosnIcms || '400'}`}
                                            className="font-mono text-xs bg-white h-9 font-bold"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Modalidade BC ICMS (modBC)</Label>
                                        <Select value={modBcIcms} onValueChange={setModBcIcms}>
                                            <SelectTrigger className="bg-white text-xs h-9 font-mono"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">Manter da Regra Base</SelectItem>
                                                <SelectItem value="0">0 - Margem Valor Agregado (%)</SelectItem>
                                                <SelectItem value="1">1 - Pauta (Valor)</SelectItem>
                                                <SelectItem value="2">2 - Preço Tabelado Máximo</SelectItem>
                                                <SelectItem value="3">3 - Valor da Operação</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota ICMS Específica (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqIcms}
                                            onChange={e => setAliqIcms(e.target.value)}
                                            placeholder={`Padrão: ${parentRule?.aliqIcms || '0'}%`}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">% Redução BC ICMS Específica</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={reducaoBcIcms}
                                            onChange={e => setReducaoBcIcms(e.target.value)}
                                            placeholder={`Padrão: ${parentRule?.reducaoBcIcms || '0'}%`}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota Crédito Simples (pCredSN %)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqCreditoSimples}
                                            onChange={e => setAliqCreditoSimples(e.target.value)}
                                            placeholder="Ex: 2.82"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Motivo da Desoneração ICMS</Label>
                                        <Select value={motivoDesoneracaoIcms} onValueChange={setMotivoDesoneracaoIcms}>
                                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {MOTIVOS_DESONERACAO.map(m => (
                                                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 3: ICMS-ST (SUBSTITUIÇÃO TRIBUTÁRIA) */}
                    <TabsContent value="icms_st" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Layers size={16} className="text-orange-600" /> Substituição Tributária (ICMS-ST) Específica
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Modalidade BC ST (modBCST)</Label>
                                        <Select value={modBcIcmsSt} onValueChange={setModBcIcmsSt}>
                                            <SelectTrigger className="bg-white text-xs h-9 font-mono"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">Manter da Regra Base</SelectItem>
                                                <SelectItem value="0">0 - Preço Tabelado / Máximo Sugerido</SelectItem>
                                                <SelectItem value="1">1 - Lista Negativa</SelectItem>
                                                <SelectItem value="2">2 - Lista Positiva</SelectItem>
                                                <SelectItem value="3">3 - Lista Neutra</SelectItem>
                                                <SelectItem value="4">4 - Margem Valor Agregado (%)</SelectItem>
                                                <SelectItem value="5">5 - Pauta</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">% Margem Valor Adicionado (MVA ST)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={mvaIcmsSt}
                                            onChange={e => setMvaIcmsSt(e.target.value)}
                                            placeholder="Ex: 40.00"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">% Redução Base de Cálculo ST</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={reducaoBcIcmsSt}
                                            onChange={e => setReducaoBcIcmsSt(e.target.value)}
                                            placeholder="Ex: 10.00"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota ICMS ST (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqIcmsSt}
                                            onChange={e => setAliqIcmsSt(e.target.value)}
                                            placeholder="Ex: 18.00"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 4: IPI, PIS & COFINS */}
                    <TabsContent value="ipi_pis" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Sparkles size={16} className="text-orange-600" /> IPI Substituto
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST IPI</Label>
                                        <Input
                                            value={cstIpi}
                                            onChange={e => setCstIpi(e.target.value)}
                                            maxLength={2}
                                            placeholder={`Padrão: ${parentRule?.cstIpi || '53'}`}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Cód. Enquadramento IPI (cEnq)</Label>
                                        <Input
                                            type="number"
                                            value={codigoEnquadramentoIpi}
                                            onChange={e => setCodigoEnquadramentoIpi(e.target.value)}
                                            placeholder="Ex: 999"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota IPI (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqIpi}
                                            onChange={e => setAliqIpi(e.target.value)}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Sparkles size={16} className="text-orange-600" /> PIS & COFINS Substitutos
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST PIS</Label>
                                        <Input
                                            value={cstPis}
                                            onChange={e => setCstPis(e.target.value)}
                                            maxLength={2}
                                            placeholder={`Padrão: ${parentRule?.cstPis || '08'}`}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota PIS (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqPis}
                                            onChange={e => setAliqPis(e.target.value)}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST COFINS</Label>
                                        <Input
                                            value={cstCofins}
                                            onChange={e => setCstCofins(e.target.value)}
                                            maxLength={2}
                                            placeholder={`Padrão: ${parentRule?.cstCofins || '08'}`}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota COFINS (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqCofins}
                                            onChange={e => setAliqCofins(e.target.value)}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 5: REFORMA TRIBUTÁRIA (2026) */}
                    <TabsContent value="reforma" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <CheckCircle2 size={16} className="text-orange-600" /> Reforma Tributária (IBS & CBS 2026) Específica
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST IBS</Label>
                                        <Input
                                            value={cstIbs}
                                            onChange={e => setCstIbs(e.target.value)}
                                            maxLength={3}
                                            placeholder="410"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota IBS (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqIbs}
                                            onChange={e => setAliqIbs(e.target.value)}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST CBS</Label>
                                        <Input
                                            value={cstCbs}
                                            onChange={e => setCstCbs(e.target.value)}
                                            maxLength={3}
                                            placeholder="410"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota CBS (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqCbs}
                                            onChange={e => setAliqCbs(e.target.value)}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Classif. Trib (cClassTrib)</Label>
                                        <Input
                                            value={classificacaoTributaria}
                                            onChange={e => setClassificacaoTributaria(e.target.value)}
                                            maxLength={6}
                                            placeholder="410999"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 6: OBSERVAÇÕES & RESUMO */}
                    <TabsContent value="observacoes" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <FileCode size={16} className="text-orange-600" /> Informações Complementares Específicas desta Exceção
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-800">
                                        Observações Fiscais no DANFE (infCpl)
                                    </Label>
                                    <textarea
                                        rows={4}
                                        value={additionalNotes}
                                        onChange={e => setAdditionalNotes(e.target.value)}
                                        placeholder="Texto específico a ser impresso no DANFE quando esta exceção for acionada (ex: artigo de benefício fiscal interestadual, termo de acordo, etc)..."
                                        className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>

                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                                    <span className="font-bold text-slate-800 uppercase text-[10px] block tracking-wider">
                                        Espelho de Disparo da Exceção:
                                    </span>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-700 font-mono">
                                        <div>
                                            <span className="text-[10px] text-slate-400 block uppercase">UF Destino</span>
                                            <strong>{specificDestinationState}</strong>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400 block uppercase">Filtro NCM</span>
                                            <strong>{specificNcmStart || 'Todos os NCMs'}</strong>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400 block uppercase">Origem</span>
                                            <strong>{specificOrigin !== 'ALL' ? `Origem ${specificOrigin}` : 'Todas as Origens'}</strong>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </form>
        </div>
    );
}