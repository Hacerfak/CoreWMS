import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, Save, Plus, Pencil, Trash2, Filter,
    Layers, FileCode, Sparkles, CheckCircle2, Loader2, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

const MOTIVOS_DESONERACAO = [
    { value: 'NONE', label: 'Sem Desoneração' },
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

export default function CreateOrEditFiscalRulePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(id);

    const [activeTab, setActiveTab] = useState('identificacao');
    const [isLoadingData, setIsLoadingData] = useState(isEditing);
    const [isSaving, setIsSaving] = useState(false);

    // --- ABA 1: IDENTIFICAÇÃO & CFOP ---
    const [description, setDescription] = useState('');
    const [finalidade, setFinalidade] = useState('1');
    const [cfopStateInternal, setCfopStateInternal] = useState('5906');
    const [cfopInterstate, setCfopInterstate] = useState('6906');

    // --- ABA 2: ICMS & ICMS-ST ---
    const [cstCsosnIcms, setCstCsosnIcms] = useState('400');
    const [modBcIcms, setModBcIcms] = useState('3');
    const [aliqIcms, setAliqIcms] = useState('0');
    const [reducaoBcIcms, setReducaoBcIcms] = useState('0');
    const [aliqCreditoSimples, setAliqCreditoSimples] = useState('0');
    const [motivoDesoneracaoIcms, setMotivoDesoneracaoIcms] = useState('NONE');

    // ICMS ST
    const [modBcIcmsSt, setModBcIcmsSt] = useState('4');
    const [mvaIcmsSt, setMvaIcmsSt] = useState('0');
    const [reducaoBcIcmsSt, setReducaoBcIcmsSt] = useState('0');
    const [aliqIcmsSt, setAliqIcmsSt] = useState('0');

    // --- ABA 3: IPI, PIS & COFINS ---
    const [cstIpi, setCstIpi] = useState('53');
    const [codigoEnquadramentoIpi, setCodigoEnquadramentoIpi] = useState('999');
    const [aliqIpi, setAliqIpi] = useState('0');
    const [cstPis, setCstPis] = useState('08');
    const [aliqPis, setAliqPis] = useState('0');
    const [cstCofins, setCstCofins] = useState('08');
    const [aliqCofins, setAliqCofins] = useState('0');

    // --- ABA 4: REFORMA TRIBUTÁRIA (2026 - IBS/CBS) ---
    const [cstIbs, setCstIbs] = useState('410');
    const [aliqIbs, setAliqIbs] = useState('0.10');
    const [cstCbs, setCstCbs] = useState('410');
    const [aliqCbs, setAliqCbs] = useState('0.90');
    const [classificacaoTributaria, setClassificacaoTributaria] = useState('410999');

    // --- ABA 5: OBSERVAÇÕES FISCAIS ---
    const [additionalNotes, setAdditionalNotes] = useState('');

    // --- ABA 6: EXCEÇÕES VINCULADAS ---
    const [exceptions, setExceptions] = useState([]);

    const loadRule = async () => {
        if (!id) return;
        try {
            setIsLoadingData(true);
            const res = await customInstance({ url: `/api/fiscal/rules/${id}`, method: 'GET' });
            const rule = res?.data || res;

            setDescription(rule.description || '');
            setFinalidade(rule.finalidade?.toString() || '1');
            setCfopStateInternal(rule.cfopStateInternal || '5906');
            setCfopInterstate(rule.cfopInterstate || '6906');

            setCstCsosnIcms(rule.cstCsosnIcms || '400');
            setModBcIcms(rule.modBcIcms?.toString() || '3');
            setAliqIcms(rule.aliqIcms?.toString() || '0');
            setReducaoBcIcms(rule.reducaoBcIcms?.toString() || '0');
            setAliqCreditoSimples(rule.aliqCreditoSimples?.toString() || '0');
            setMotivoDesoneracaoIcms(rule.motivoDesoneracaoIcms ? rule.motivoDesoneracaoIcms.toString() : 'NONE');

            setModBcIcmsSt(rule.modBcIcmsSt?.toString() || '4');
            setMvaIcmsSt(rule.mvaIcmsSt?.toString() || '0');
            setReducaoBcIcmsSt(rule.reducaoBcIcmsSt?.toString() || '0');
            setAliqIcmsSt(rule.aliqIcmsSt?.toString() || '0');

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

            setExceptions(rule.exceptions || []);
        } catch {
            toast.error('Erro ao carregar detalhes da natureza de operação.');
            navigate('/fiscal/regras');
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        if (isEditing) {
            loadRule();
        }
    }, [id]);

    const handleSave = async (e) => {
        e?.preventDefault();

        if (!description.trim()) {
            setActiveTab('identificacao');
            return toast.error('Informe a descrição da Natureza de Operação.');
        }

        if (cfopStateInternal.length !== 4 || cfopInterstate.length !== 4) {
            setActiveTab('identificacao');
            return toast.error('Os CFOPs interno e interestadual devem conter exatamente 4 dígitos.');
        }

        try {
            setIsSaving(true);
            const payload = {
                id: isEditing ? id : null,
                description: description.trim(),
                finalidade: Number(finalidade),
                cfopStateInternal: cfopStateInternal.trim(),
                cfopInterstate: cfopInterstate.trim(),
                cstCsosnIcms: cstCsosnIcms.trim(),
                modBcIcms: Number(modBcIcms),
                aliqIcms: parseFloat(aliqIcms) || 0,
                reducaoBcIcms: parseFloat(reducaoBcIcms) || 0,
                modBcIcmsSt: Number(modBcIcmsSt),
                mvaIcmsSt: parseFloat(mvaIcmsSt) || 0,
                reducaoBcIcmsSt: parseFloat(reducaoBcIcmsSt) || 0,
                aliqIcmsSt: parseFloat(aliqIcmsSt) || 0,
                motivoDesoneracaoIcms: motivoDesoneracaoIcms !== 'NONE' ? Number(motivoDesoneracaoIcms) : null,
                aliqCreditoSimples: parseFloat(aliqCreditoSimples) || 0,
                cstIpi: cstIpi.trim(),
                codigoEnquadramentoIpi: parseInt(codigoEnquadramentoIpi, 10) || 999,
                aliqIpi: parseFloat(aliqIpi) || 0,
                cstPis: cstPis.trim(),
                aliqPis: parseFloat(aliqPis) || 0,
                cstCofins: cstCofins.trim(),
                aliqCofins: parseFloat(aliqCofins) || 0,
                cstIbs: cstIbs.trim() || '410',
                aliqIbs: parseFloat(aliqIbs) || 0.10,
                cstCbs: cstCbs.trim() || '410',
                aliqCbs: parseFloat(aliqCbs) || 0.90,
                classificacaoTributaria: classificacaoTributaria.trim() || '410999',
                additionalNotes: additionalNotes.trim() || null
            };

            await customInstance({
                url: '/api/fiscal/rules',
                method: 'POST',
                data: payload
            });

            toast.success(isEditing ? 'Natureza de Operação atualizada!' : 'Natureza de Operação cadastrada com sucesso!');
            navigate('/fiscal/regras');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar natureza fiscal.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteException = async (exceptionId) => {
        if (!confirm('Deseja realmente remover esta linha de exceção fiscal?')) return;
        try {
            await customInstance({
                url: `/api/fiscal/rules/${id}/exceptions/${exceptionId}`,
                method: 'DELETE'
            });
            toast.success('Exceção fiscal excluída!');
            loadRule();
        } catch {
            toast.error('Erro ao excluir exceção fiscal.');
        }
    };

    if (isLoadingData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando dados da natureza de operação...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/fiscal/regras')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900">
                                {isEditing ? `Editar: ${description}` : 'Nova Natureza de Operação'}
                            </h1>
                            <Badge className="bg-orange-100 text-orange-800 border-orange-200 font-mono text-xs">
                                {isEditing ? 'Matriz Tributária' : 'Novo Cadastro'}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Configuração tributária completa para emissão de NF-e e apuração de tributos.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => navigate('/fiscal/regras')} disabled={isSaving}>
                        Cancelar
                    </Button>

                    <Button onClick={handleSave} disabled={isSaving} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9 px-5">
                        {isSaving ? (
                            <>
                                <Loader2 className="animate-spin h-4 w-4 mr-2" /> Salvando Regra...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" /> Salvar Natureza Fiscal
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* FORMULÁRIO COM ABAS */}
            <form onSubmit={handleSave} className="flex-1 min-h-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full space-y-4">
                    <TabsList className="bg-white border border-slate-200/80 p-1 rounded-xl shadow-xs justify-start h-12 w-full gap-2 overflow-x-auto">
                        <TabsTrigger value="identificacao" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <FileCode size={15} /> 1. Identificação & CFOP
                        </TabsTrigger>
                        <TabsTrigger value="icms" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <Layers size={15} /> 2. ICMS & ICMS-ST
                        </TabsTrigger>
                        <TabsTrigger value="ipi_pis" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <Sparkles size={15} /> 3. IPI, PIS & COFINS
                        </TabsTrigger>
                        <TabsTrigger value="reforma" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <CheckCircle2 size={15} /> 4. Reforma (IBS/CBS 2026)
                        </TabsTrigger>
                        <TabsTrigger value="observacoes" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <AlertCircle size={15} /> 5. Observações Fiscais
                        </TabsTrigger>
                        <TabsTrigger value="excecoes" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <Filter size={15} /> 6. Linhas de Exceção ({exceptions.length})
                        </TabsTrigger>
                    </TabsList>

                    {/* ABA 1: IDENTIFICAÇÃO & CFOP */}
                    <TabsContent value="identificacao" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <FileCode size={16} className="text-orange-600" /> Identificação da Natureza & CFOPs Base
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="md:col-span-2 space-y-1.5">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs font-semibold text-slate-800">
                                                Descrição da Natureza de Operação (natOp) *
                                            </Label>
                                            <span className={`text-[10px] font-mono ${description.length > 55 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                                                {description.length}/60 caracteres (Máx. SEFAZ)
                                            </span>
                                        </div>
                                        <Input
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            maxLength={60}
                                            placeholder="Ex: Retorno mercadoria utilizada industrialização encomenda"
                                            className="text-xs bg-white h-9"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Finalidade da NF-e (finNFe) *</Label>
                                        <Select value={finalidade} onValueChange={setFinalidade}>
                                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 - NF-e Normal (Vendas, Remessas, Retornos)</SelectItem>
                                                <SelectItem value="2">2 - NF-e Complementar</SelectItem>
                                                <SelectItem value="3">3 - NF-e de Ajuste</SelectItem>
                                                <SelectItem value="4">4 - Devolução de Mercadoria</SelectItem>
                                                <SelectItem value="5">5 - Nota de Crédito (Reforma Tributária)</SelectItem>
                                                <SelectItem value="6">6 - Nota de Débito (Reforma Tributária)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CFOP Estadual (Dentro do Estado) *</Label>
                                        <Input
                                            value={cfopStateInternal}
                                            onChange={e => setCfopStateInternal(e.target.value.replace(/\D/g, ''))}
                                            maxLength={4}
                                            placeholder="Ex: 5906"
                                            className="font-mono text-xs bg-white h-9 font-bold text-blue-700"
                                            required
                                        />
                                        <span className="text-[10px] text-slate-400">Aplicado quando a UF de destino for igual à UF do armazém.</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CFOP Interestadual (Fora do Estado) *</Label>
                                        <Input
                                            value={cfopInterstate}
                                            onChange={e => setCfopInterstate(e.target.value.replace(/\D/g, ''))}
                                            maxLength={4}
                                            placeholder="Ex: 6906"
                                            className="font-mono text-xs bg-white h-9 font-bold text-purple-700"
                                            required
                                        />
                                        <span className="text-[10px] text-slate-400">Aplicado quando a UF de destino for diferente da UF do armazém.</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 2: ICMS & ICMS-ST */}
                    <TabsContent value="icms" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Layers size={16} className="text-orange-600" /> Tributação do ICMS Normal & Simples Nacional
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST ou CSOSN do ICMS *</Label>
                                        <Input
                                            value={cstCsosnIcms}
                                            onChange={e => setCstCsosnIcms(e.target.value)}
                                            maxLength={3}
                                            placeholder="400 ou 00"
                                            className="font-mono text-xs bg-white h-9 font-bold"
                                            required
                                        />
                                        <span className="text-[10px] text-slate-400">Ex: 400 (Não Trib.), 00 (Trib.), 20 (Redução), 102, etc.</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Modalidade BC ICMS (modBC)</Label>
                                        <Select value={modBcIcms} onValueChange={setModBcIcms}>
                                            <SelectTrigger className="bg-white text-xs h-9 font-mono"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="0">0 - Margem Valor Agregado (%)</SelectItem>
                                                <SelectItem value="1">1 - Pauta (Valor)</SelectItem>
                                                <SelectItem value="2">2 - Preço Tabelado Máximo</SelectItem>
                                                <SelectItem value="3">3 - Valor da Operação</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota ICMS (%)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqIcms}
                                            onChange={e => setAliqIcms(e.target.value)}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">% Redução BC ICMS</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={reducaoBcIcms}
                                            onChange={e => setReducaoBcIcms(e.target.value)}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota de Crédito Simples (pCredSN %)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={aliqCreditoSimples}
                                            onChange={e => setAliqCreditoSimples(e.target.value)}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                        <span className="text-[10px] text-slate-400">Utilizado exclusivamente para emitentes do Simples com CSOSN 101/201.</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Motivo da Desoneração do ICMS (motDesICMS)</Label>
                                        <Select value={motivoDesoneracaoIcms} onValueChange={setMotivoDesoneracaoIcms}>
                                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {MOTIVOS_DESONERACAO.map(m => (
                                                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span className="text-[10px] text-slate-400">Preencher apenas quando o CST exigir desoneração (CST 20, 40, 41, etc).</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* ICMS SUBSTITUIÇÃO TRIBUTÁRIA (ICMS-ST) */}
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Layers size={16} className="text-orange-600" /> Substituição Tributária (ICMS-ST)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Modalidade BC ST (modBCST)</Label>
                                        <Select value={modBcIcmsSt} onValueChange={setModBcIcmsSt}>
                                            <SelectTrigger className="bg-white text-xs h-9 font-mono"><SelectValue /></SelectTrigger>
                                            <SelectContent>
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
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 3: IPI, PIS & COFINS */}
                    <TabsContent value="ipi_pis" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Sparkles size={16} className="text-orange-600" /> Imposto sobre Produtos Industrializados (IPI)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST do IPI *</Label>
                                        <Input
                                            value={cstIpi}
                                            onChange={e => setCstIpi(e.target.value)}
                                            maxLength={2}
                                            placeholder="53"
                                            className="font-mono text-xs bg-white h-9 font-bold"
                                            required
                                        />
                                        <span className="text-[10px] text-slate-400">Ex: 53 (Não Tributado), 50 (Tributado), 99 (Outras).</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Cód. Enquadramento Legal IPI (cEnq)</Label>
                                        <Input
                                            type="number"
                                            value={codigoEnquadramentoIpi}
                                            onChange={e => setCodigoEnquadramentoIpi(e.target.value)}
                                            placeholder="999"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                        <span className="text-[10px] text-slate-400">Padrão SEFAZ para imunidade/isenção ou outros: 999.</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">Alíquota do IPI (%)</Label>
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
                                    <Sparkles size={16} className="text-orange-600" /> PIS & COFINS
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST do PIS *</Label>
                                        <Input
                                            value={cstPis}
                                            onChange={e => setCstPis(e.target.value)}
                                            maxLength={2}
                                            placeholder="08"
                                            className="font-mono text-xs bg-white h-9 font-bold"
                                            required
                                        />
                                        <span className="text-[10px] text-slate-400">08=Sem Incidência, 01=Tributado, 07=Isento.</span>
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
                                        <Label className="text-xs font-semibold text-slate-800">CST da COFINS *</Label>
                                        <Input
                                            value={cstCofins}
                                            onChange={e => setCstCofins(e.target.value)}
                                            maxLength={2}
                                            placeholder="08"
                                            className="font-mono text-xs bg-white h-9 font-bold"
                                            required
                                        />
                                        <span className="text-[10px] text-slate-400">08=Sem Incidência, 01=Tributado, 07=Isento.</span>
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

                    {/* ABA 4: REFORMA TRIBUTÁRIA (2026 - IBS/CBS) */}
                    <TabsContent value="reforma" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <CheckCircle2 size={16} className="text-orange-600" /> Parâmetros da Reforma Tributária (IBS & CBS - 2026)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-800">CST do IBS</Label>
                                        <Input
                                            value={cstIbs}
                                            onChange={e => setCstIbs(e.target.value)}
                                            maxLength={3}
                                            placeholder="410"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                        <span className="text-[10px] text-slate-400">Padrão não incidência: 410.</span>
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
                                        <Label className="text-xs font-semibold text-slate-800">CST da CBS</Label>
                                        <Input
                                            value={cstCbs}
                                            onChange={e => setCstCbs(e.target.value)}
                                            maxLength={3}
                                            placeholder="410"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                        <span className="text-[10px] text-slate-400">Padrão não incidência: 410.</span>
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
                                        <span className="text-[10px] text-slate-400">Código de 6 dígitos.</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 5: OBSERVAÇÕES FISCAIS */}
                    <TabsContent value="observacoes" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <AlertCircle size={16} className="text-orange-600" /> Informações Complementares Padrão (infCpl)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-800">
                                        Observações Fiscais de Interesse do Contribuinte
                                    </Label>
                                    <textarea
                                        rows={6}
                                        value={additionalNotes}
                                        onChange={e => setAdditionalNotes(e.target.value)}
                                        placeholder="Texto que será automaticamente incluído no campo de Informações Complementares do DANFE sempre que esta natureza de operação for selecionada..."
                                        className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                    <span className="text-[11px] text-slate-400">
                                        Exemplo: "Não incidência do ICMS conforme Artigo... do RICMS/RS. Mercadoria depositada em armazém geral."
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 6: LINHAS DE EXCEÇÃO */}
                    <TabsContent value="excecoes" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                        <Filter size={16} className="text-orange-600" /> Matriz de Exceções Tributárias Vinculadas
                                    </CardTitle>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Sobrescreva alíquotas e CFOPs específicos para determinadas UFs, grupos de NCM ou origens da mercadoria.
                                    </p>
                                </div>

                                <Button
                                    type="button"
                                    onClick={() => {
                                        if (!isEditing) {
                                            return toast.warning('Salve a Natureza de Operação primeiro antes de cadastrar linhas de exceção.');
                                        }
                                        navigate(`/fiscal/regras/${id}/excecoes/nova`);
                                    }}
                                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-8 text-xs"
                                >
                                    <Plus size={13} className="mr-1" /> Nova Linha de Exceção
                                </Button>
                            </CardHeader>

                            <CardContent className="p-0 overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead>Condições de Disparo</TableHead>
                                            <TableHead className="text-center">CFOP Substituto</TableHead>
                                            <TableHead className="text-center">ICMS</TableHead>
                                            <TableHead className="text-center">IPI</TableHead>
                                            <TableHead className="text-center">PIS / COFINS</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {exceptions.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-28 text-center text-slate-400 italic">
                                                    Nenhuma exceção cadastrada. Todos os itens emitidos nesta natureza seguirão as alíquotas base da matriz.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            exceptions.map(exc => (
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
                                                        {exc.cstIpi ? <span>CST {exc.cstIpi} ({exc.aliqIpi || 0}%)</span> : <span className="text-slate-400 italic">Padrão</span>}
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono">
                                                        {exc.cstPis ? <span>PIS {exc.cstPis}</span> : <span className="text-slate-400 italic">Padrão</span>}
                                                    </TableCell>
                                                    <TableCell className="text-right space-x-1">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => navigate(`/fiscal/regras/${id}/excecoes/${exc.id}`)}
                                                            className="h-7 w-7 p-0"
                                                            title="Editar Exceção Completa"
                                                        >
                                                            <Pencil size={13} className="text-slate-600" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleDeleteException(exc.id)}
                                                            className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={13} />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </form>
        </div>
    );
}