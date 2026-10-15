import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
    ArrowLeft, Send, Loader2, Sparkles, Plus, Trash2,
    FileText, UserCheck, Layers, Truck, MessageSquare, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export default function CreateStandaloneNfePage() {
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('operacao');
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConsultingDestSefaz, setIsConsultingDestSefaz] = useState(false);
    const [isConsultingCarrierSefaz, setIsConsultingCarrierSefaz] = useState(false);

    // Listas Auxiliares
    const [fiscalRules, setFiscalRules] = useState([]);
    const [products, setProducts] = useState([]);

    // --- ABA 1: OPERAÇÃO & EMISSÃO ---
    const [fiscalRuleId, setFiscalRuleId] = useState('');
    const [indFinal, setIndFinal] = useState('1');
    const [indPres, setIndPres] = useState('9');
    const [tpImp, setTpImp] = useState('1');

    // --- ABA 2: DESTINATÁRIO & ENDEREÇO ---
    const [destCnpjCpf, setDestCnpjCpf] = useState('');
    const [destName, setDestName] = useState('');
    const [destIe, setDestIe] = useState('');
    const [destIeIndicator, setDestIeIndicator] = useState('9');
    const [destStreet, setDestStreet] = useState('');
    const [destNumber, setDestNumber] = useState('');
    const [destComplement, setDestComplement] = useState('');
    const [destNeighborhood, setDestNeighborhood] = useState('');
    const [destCityCode, setDestCityCode] = useState('4305108');
    const [destCity, setDestCity] = useState('');
    const [destState, setDestState] = useState('RS');
    const [destZipCode, setDestZipCode] = useState('');

    // --- ABA 3: ITENS & VALORES ---
    const [selectedProductId, setSelectedProductId] = useState('');
    const [itemQty, setItemQty] = useState('1');
    const [itemUnitVal, setItemUnitVal] = useState('');
    const [itemsList, setItemsList] = useState([]);

    // --- ABA 4: TRANSPORTE & FRETE ---
    const [freightModality, setFreightModality] = useState('9');
    const [carrierCnpjCpf, setCarrierCnpjCpf] = useState('');
    const [carrierName, setCarrierName] = useState('');
    const [carrierIe, setCarrierIe] = useState('');
    const [vehiclePlate, setVehiclePlate] = useState('');
    const [vehiclePlateState, setVehiclePlateState] = useState('RS');

    // --- ABA 5: OBSERVAÇÕES FISCAIS ---
    const [additionalNotes, setAdditionalNotes] = useState('');

    // Função utilitária para extrair arrays de forma segura
    const extractArray = (res) => {
        if (Array.isArray(res)) return res;
        if (Array.isArray(res?.items)) return res.items;
        if (Array.isArray(res?.data?.items)) return res.data.items;
        if (Array.isArray(res?.data)) return res.data;
        return [];
    };

    useEffect(() => {
        const loadAuxiliaryData = async () => {
            try {
                setIsLoadingInitial(true);
                const [rulesRes, prodsRes] = await Promise.all([
                    customInstance({ url: '/api/fiscal/rules', method: 'GET' }),
                    customInstance({ url: '/api/products?PageSize=1000', method: 'GET' })
                ]);

                const rules = extractArray(rulesRes);
                const prods = extractArray(prodsRes);

                setFiscalRules(rules);
                setProducts(prods);

                if (rules.length > 0) {
                    setFiscalRuleId(rules[0].id);
                }
            } catch {
                toast.error('Erro ao carregar naturezas de operação ou catálogo de produtos.');
            } finally {
                setIsLoadingInitial(false);
            }
        };

        loadAuxiliaryData();
    }, []);

    // Consulta SEFAZ Destinatário
    const handleConsultDestSefaz = async () => {
        const cleanCnpj = destCnpjCpf.replace(/\D/g, '');
        if (cleanCnpj.length !== 14) return toast.warning('Informe um CNPJ válido com 14 dígitos para consultar.');

        try {
            setIsConsultingDestSefaz(true);
            const sefazData = await customInstance({
                url: `/api/customers/consult-sefaz/${cleanCnpj}?uf=${destState}`,
                method: 'POST'
            });

            toast.success('Dados do destinatário sincronizados da SEFAZ!');
            setDestName(sefazData.corporateName || '');
            setDestIe(sefazData.stateRegistration || '');
            setDestIeIndicator(sefazData.stateRegistration ? '1' : '9');
            setDestStreet(sefazData.street || '');
            setDestNumber(sefazData.number || '');
            setDestComplement(sefazData.complement || '');
            setDestNeighborhood(sefazData.neighborhood || '');
            setDestCityCode(sefazData.cityCode ? String(sefazData.cityCode) : '4305108');
            setDestCity(sefazData.cityName || '');
            setDestState(sefazData.state || destState);
            setDestZipCode(sefazData.zipCode || '');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Falha ao consultar CNPJ na SEFAZ.');
        } finally {
            setIsConsultingDestSefaz(false);
        }
    };

    // Consulta SEFAZ Transportadora
    const handleConsultCarrierSefaz = async () => {
        const cleanCnpj = carrierCnpjCpf.replace(/\D/g, '');
        if (cleanCnpj.length !== 14) return toast.warning('Informe um CNPJ válido com 14 dígitos para consultar.');

        try {
            setIsConsultingCarrierSefaz(true);
            const sefazData = await customInstance({
                url: `/api/customers/consult-sefaz/${cleanCnpj}?uf=${vehiclePlateState || 'RS'}`,
                method: 'POST'
            });

            toast.success('Dados da transportadora sincronizados da SEFAZ!');
            setCarrierName(sefazData.corporateName || '');
            setCarrierIe(sefazData.stateRegistration || '');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Falha ao consultar transportadora na SEFAZ.');
        } finally {
            setIsConsultingCarrierSefaz(false);
        }
    };

    // Inclusão de Item
    const handleAddItem = () => {
        if (!selectedProductId) return toast.warning('Selecione um produto do catálogo.');
        const qtyNum = parseFloat(itemQty);
        const valNum = parseFloat(itemUnitVal);

        if (isNaN(qtyNum) || qtyNum <= 0) return toast.warning('Informe uma quantidade válida.');
        if (isNaN(valNum) || valNum <= 0) return toast.warning('Informe um valor unitário válido.');

        const prod = products.find(p => p.id === selectedProductId);
        if (!prod) return;

        setItemsList(prev => [
            ...prev,
            {
                productId: prod.id,
                sku: prod.sku,
                description: prod.description,
                unit: prod.baseUnit || 'UN',
                quantity: qtyNum,
                unitValue: valNum,
                totalValue: Math.round(qtyNum * valNum * 100) / 100
            }
        ]);

        setSelectedProductId('');
        setItemQty('1');
        setItemUnitVal('');
        toast.info('Item adicionado à lista.');
    };

    const handleRemoveItem = (idx) => {
        setItemsList(prev => prev.filter((_, i) => i !== idx));
    };

    const totalNfeValue = useMemo(() => {
        return itemsList.reduce((acc, curr) => acc + curr.totalValue, 0);
    }, [itemsList]);

    const activeRule = useMemo(() => {
        return fiscalRules.find(r => r.id === fiscalRuleId);
    }, [fiscalRules, fiscalRuleId]);

    // Transmissão da NF-e Avulsa à SEFAZ
    const handleSubmitNfe = async (e) => {
        e.preventDefault();

        if (!fiscalRuleId) {
            setActiveTab('operacao');
            return toast.error('Selecione a Natureza de Operação.');
        }
        if (!destName.trim() || !destCnpjCpf.trim()) {
            setActiveTab('destinatario');
            return toast.error('Preencha a Razão Social e o CNPJ/CPF do destinatário.');
        }
        if (!destStreet.trim() || !destCity.trim() || !destState.trim()) {
            setActiveTab('destinatario');
            return toast.error('Preencha os dados de endereço do destinatário.');
        }
        if (itemsList.length === 0) {
            setActiveTab('itens');
            return toast.error('Adicione ao menos um produto para emitir a NF-e.');
        }

        try {
            setIsSubmitting(true);
            const payload = {
                fiscalRuleId,
                destinationName: destName.trim(),
                destinationCnpjCpf: destCnpjCpf.replace(/\D/g, ''),
                destinationStateRegistration: destIe?.trim() || null,
                destinationIeIndicator: Number(destIeIndicator),
                destinationStreet: destStreet.trim(),
                destinationNumber: destNumber.trim() || 'S/N',
                destinationComplement: destComplement.trim() || null,
                destinationNeighborhood: destNeighborhood.trim() || 'CENTRO',
                destinationCityCode: Number(destCityCode) || 4305108,
                destinationCity: destCity.trim(),
                destinationState: destState.trim().toUpperCase(),
                destinationZipCode: destZipCode.replace(/\D/g, ''),
                indFinal: Number(indFinal),
                indPres: Number(indPres),
                tpImp: Number(tpImp),
                additionalNotes: additionalNotes.trim() || null,
                freightModality: Number(freightModality),
                carrierCnpjCpf: carrierCnpjCpf ? carrierCnpjCpf.replace(/\D/g, '') : null,
                carrierName: carrierName.trim() || null,
                carrierStateRegistration: carrierIe.trim() || null,
                vehiclePlate: vehiclePlate.trim().toUpperCase() || null,
                vehiclePlateState: vehiclePlateState?.trim().toUpperCase() || 'RS',
                items: itemsList.map(i => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    unitValue: i.unitValue
                }))
            };

            const res = await customInstance({
                url: '/api/fiscal/documents/standalone/emit',
                method: 'POST',
                data: payload
            });

            const data = res?.data || res;
            toast.success(data?.message || 'NF-e Avulsa Autorizada com Sucesso na SEFAZ!');
            navigate('/fiscal/documentos');
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Erro ao emitir NF-e avulsa.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoadingInitial) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando parâmetros e regras fiscais...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/fiscal/documentos')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900">Nova NF-e Avulsa</h1>
                            <Badge className="bg-purple-100 text-purple-800 border-purple-200">Emissão Direta</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Emissão autônoma de Nota Fiscal Eletrônica sem vínculo com ordem de separação/expedição.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right pr-2 hidden sm:block">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Total da Nota</span>
                        <span className="text-sm font-bold font-mono text-emerald-700">
                            {totalNfeValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                    </div>

                    <Button variant="outline" onClick={() => navigate('/fiscal/documentos')} disabled={isSubmitting}>
                        Cancelar
                    </Button>

                    <Button onClick={handleSubmitNfe} disabled={isSubmitting} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9 px-5">
                        {isSubmitting ? (
                            <>
                                <Loader2 className="animate-spin h-4 w-4 mr-2" /> Transmitindo à SEFAZ...
                            </>
                        ) : (
                            <>
                                <Send className="h-4 w-4 mr-2" /> Emitir & Transmitir NF-e
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* FORMULÁRIO COM ABAS NATIVAS */}
            <form onSubmit={handleSubmitNfe} className="flex-1 min-h-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full space-y-4">
                    <TabsList className="bg-white border border-slate-200/80 p-1 rounded-xl shadow-xs justify-start h-12 w-full gap-2">
                        <TabsTrigger value="operacao" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-4 text-xs font-semibold">
                            <FileText size={15} /> 1. Operação & Emissão
                        </TabsTrigger>
                        <TabsTrigger value="destinatario" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-4 text-xs font-semibold">
                            <UserCheck size={15} /> 2. Destinatário & Entrega
                        </TabsTrigger>
                        <TabsTrigger value="itens" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-4 text-xs font-semibold">
                            <Layers size={15} /> 3. Itens & Produtos ({itemsList.length})
                        </TabsTrigger>
                        <TabsTrigger value="transporte" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-4 text-xs font-semibold">
                            <Truck size={15} /> 4. Transporte & Frete
                        </TabsTrigger>
                        <TabsTrigger value="observacoes" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-4 text-xs font-semibold">
                            <MessageSquare size={15} /> 5. Observações Fiscais
                        </TabsTrigger>
                    </TabsList>

                    {/* ABA 1: OPERAÇÃO & EMISSÃO */}
                    <TabsContent value="operacao" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <FileText size={16} className="text-orange-600" /> Parâmetros da Operação & Natureza Fiscal
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-800">Natureza de Operação (Regra Fiscal Aplicada) *</Label>
                                    <Select value={fiscalRuleId} onValueChange={setFiscalRuleId}>
                                        <SelectTrigger className="bg-white h-10 text-xs font-semibold">
                                            <SelectValue placeholder="Selecione a Regra Fiscal..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(Array.isArray(fiscalRules) ? fiscalRules : []).map(r => (
                                                <SelectItem key={r.id} value={r.id}>
                                                    {r.description} (CFOP {r.cfopStateInternal} / {r.cfopInterstate})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {activeRule && (
                                        <p className="text-[11px] text-slate-500 font-mono">
                                            Tipo: {activeRule.operationType === 1 ? 'Entrada' : 'Saída'} | Finalidade: {activeRule.finalidade} | CST ICMS Base: {activeRule.cstCsosnIcms}
                                        </p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-700">Consumidor Final (indFinal) *</Label>
                                        <Select value={indFinal} onValueChange={setIndFinal}>
                                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="0">0 - Normal / Não Consumidor Final</SelectItem>
                                                <SelectItem value="1">1 - Consumidor Final</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-700">Presença do Comprador (indPres) *</Label>
                                        <Select value={indPres} onValueChange={setIndPres}>
                                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="0">0 - Não se aplica</SelectItem>
                                                <SelectItem value="1">1 - Operação Presencial</SelectItem>
                                                <SelectItem value="2">2 - Operação Não Presencial (Internet)</SelectItem>
                                                <SelectItem value="9">9 - Operação Não Presencial (Outros)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-700">Formato DANFE (tpImp) *</Label>
                                        <Select value={tpImp} onValueChange={setTpImp}>
                                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 - Retrato (Padrão)</SelectItem>
                                                <SelectItem value="2">2 - Paisagem</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 2: DESTINATÁRIO & ENDEREÇO */}
                    <TabsContent value="destinatario" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <UserCheck size={16} className="text-orange-600" /> Identificação do Destinatário & Local de Entrega
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-xs font-semibold text-slate-800">CNPJ / CPF do Destinatário *</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={destCnpjCpf}
                                                onChange={e => setDestCnpjCpf(e.target.value)}
                                                placeholder="00.000.000/0000-00"
                                                className="font-mono text-xs flex-1 bg-white h-9"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleConsultDestSefaz}
                                                disabled={isConsultingDestSefaz}
                                                className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 text-xs h-9 shrink-0"
                                            >
                                                {isConsultingDestSefaz ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                                                Consultar SEFAZ
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-xs font-semibold text-slate-800">Razão Social / Nome Completo *</Label>
                                        <Input
                                            value={destName}
                                            onChange={e => setDestName(e.target.value)}
                                            placeholder="Nome do cliente ou parceiro"
                                            className="text-xs bg-white h-9"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Indicador de Inscrição Estadual (indIEDest) *</Label>
                                        <Select value={destIeIndicator} onValueChange={setDestIeIndicator}>
                                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 - Contribuinte ICMS</SelectItem>
                                                <SelectItem value="2">2 - Contribuinte Isento</SelectItem>
                                                <SelectItem value="9">9 - Não Contribuinte</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-xs">Inscrição Estadual (IE)</Label>
                                        <Input
                                            value={destIe}
                                            onChange={e => setDestIe(e.target.value)}
                                            placeholder="Deixe vazio ou informe ISENTO se aplicável"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 space-y-3">
                                    <span className="text-xs font-bold text-slate-800 uppercase block tracking-wider">Endereço de Entrega & Faturamento</span>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="space-y-1.5 md:col-span-2">
                                            <Label className="text-xs">Logradouro / Rua *</Label>
                                            <Input value={destStreet} onChange={e => setDestStreet(e.target.value)} placeholder="Ex: Av. das Indústrias" className="text-xs bg-white h-9" />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Número *</Label>
                                            <Input value={destNumber} onChange={e => setDestNumber(e.target.value)} placeholder="Ex: 500" className="text-xs bg-white h-9 font-mono" />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Complemento</Label>
                                            <Input value={destComplement} onChange={e => setDestComplement(e.target.value)} placeholder="Ex: Galpão A" className="text-xs bg-white h-9" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                        <div className="space-y-1.5 md:col-span-2">
                                            <Label className="text-xs">Bairro *</Label>
                                            <Input value={destNeighborhood} onChange={e => setDestNeighborhood(e.target.value)} placeholder="Ex: Distrito Industrial" className="text-xs bg-white h-9" />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Cidade *</Label>
                                            <Input value={destCity} onChange={e => setDestCity(e.target.value)} placeholder="Nome do Município" className="text-xs bg-white h-9" />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Cód. IBGE Cidade *</Label>
                                            <Input value={destCityCode} onChange={e => setDestCityCode(e.target.value)} placeholder="4305108" className="font-mono text-xs bg-white h-9" />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs">UF / CEP *</Label>
                                            <div className="flex gap-2">
                                                <Select value={destState} onValueChange={setDestState}>
                                                    <SelectTrigger className="text-xs bg-white w-20 h-9"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                                <Input value={destZipCode} onChange={e => setDestZipCode(e.target.value)} placeholder="CEP..." className="font-mono text-xs bg-white flex-1 h-9" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 3: ITENS & VALORES */}
                    <TabsContent value="itens" className="space-y-4 mt-0">
                        {/* PAINEL DE ADIÇÃO DE PRODUTO */}
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Plus size={16} className="text-orange-600" /> Adicionar Produto à Nota Fiscal
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                                    <div className="md:col-span-3 space-y-1">
                                        <Label className="text-xs font-semibold text-slate-800">Produto do Catálogo *</Label>
                                        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                                            <SelectTrigger className="bg-white text-xs h-9">
                                                <SelectValue placeholder="Selecione um produto..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(Array.isArray(products) ? products : []).map(p => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        <span className="font-mono font-bold">{p.sku}</span> - {p.description} ({p.baseUnit})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs font-semibold text-slate-800">Quantidade *</Label>
                                        <Input
                                            type="number"
                                            step="0.001"
                                            value={itemQty}
                                            onChange={e => setItemQty(e.target.value)}
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs font-semibold text-slate-800">Valor Unitário (R$) *</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={itemUnitVal}
                                            onChange={e => setItemUnitVal(e.target.value)}
                                            placeholder="0,00"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div>
                                        <Button
                                            type="button"
                                            onClick={handleAddItem}
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 text-xs"
                                        >
                                            <Plus size={14} className="mr-1" /> Inserir
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* LISTAGEM DE ITENS INSERIDOS */}
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Layers size={16} className="text-orange-600" /> Itens Inseridos na NF-e
                                </CardTitle>
                                <Badge variant="secondary" className="font-mono">{itemsList.length} SKU(s)</Badge>
                            </CardHeader>
                            <CardContent className="p-0 overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead className="w-12 text-center">#</TableHead>
                                            <TableHead>SKU / Código</TableHead>
                                            <TableHead>Descrição do Produto</TableHead>
                                            <TableHead className="text-center">UN</TableHead>
                                            <TableHead className="text-right">Quantidade</TableHead>
                                            <TableHead className="text-right">Valor Unitário</TableHead>
                                            <TableHead className="text-right">Valor Total</TableHead>
                                            <TableHead className="w-16 text-right"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {itemsList.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-28 text-center text-slate-400 italic">
                                                    Nenhum produto adicionado ainda. Utilize o formulário acima para inserir itens.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            itemsList.map((item, idx) => (
                                                <TableRow key={idx} className="hover:bg-slate-50/50">
                                                    <TableCell className="text-center font-mono text-xs text-slate-400">{idx + 1}</TableCell>
                                                    <TableCell className="font-mono font-bold text-xs text-slate-900">{item.sku}</TableCell>
                                                    <TableCell className="text-xs text-slate-700">{item.description}</TableCell>
                                                    <TableCell className="text-center font-mono text-xs">{item.unit}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs font-semibold">{item.quantity}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs text-slate-600">
                                                        {item.unitValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-xs text-slate-900">
                                                        {item.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleRemoveItem(idx)}
                                                            className="text-slate-400 hover:text-rose-600 h-8 w-8 p-0"
                                                        >
                                                            <Trash2 size={14} />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>

                                {itemsList.length > 0 && (
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-600">Totalizadores da Nota:</span>
                                        <div className="flex items-center gap-6 font-mono text-xs">
                                            <span>Qtd Total: <strong>{itemsList.reduce((acc, i) => acc + i.quantity, 0)}</strong></span>
                                            <span>Total dos Produtos: <strong className="text-emerald-700 text-sm">{totalNfeValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 4: TRANSPORTE & FRETE */}
                    <TabsContent value="transporte" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Truck size={16} className="text-orange-600" /> Modalidade de Frete & Transportadora
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-xs font-semibold text-slate-800">Modalidade do Frete *</Label>
                                        <Select value={freightModality} onValueChange={setFreightModality}>
                                            <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="0">0 - Contratação do Frete por conta do Remetente (CIF)</SelectItem>
                                                <SelectItem value="1">1 - Contratação do Frete por conta do Destinatário (FOB)</SelectItem>
                                                <SelectItem value="2">2 - Contratação do Frete por conta de Terceiros</SelectItem>
                                                <SelectItem value="3">3 - Transporte Próprio por conta do Remetente</SelectItem>
                                                <SelectItem value="4">4 - Transporte Próprio por conta do Destinatário</SelectItem>
                                                <SelectItem value="9">9 - Sem Ocorrência de Transporte</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">CNPJ da Transportadora</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={carrierCnpjCpf}
                                                onChange={e => setCarrierCnpjCpf(e.target.value)}
                                                placeholder="00.000.000/0000-00"
                                                className="font-mono text-xs flex-1 bg-white h-9"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleConsultCarrierSefaz}
                                                disabled={isConsultingCarrierSefaz}
                                                className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 text-xs h-9 shrink-0"
                                            >
                                                {isConsultingCarrierSefaz ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                                                SEFAZ
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100 pt-3">
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-xs">Razão Social Transportadora</Label>
                                        <Input
                                            value={carrierName}
                                            onChange={e => setCarrierName(e.target.value)}
                                            placeholder="Nome da Transportadora"
                                            className="text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Inscrição Estadual Transportadora</Label>
                                        <Input
                                            value={carrierIe}
                                            onChange={e => setCarrierIe(e.target.value)}
                                            placeholder="IE da Transportadora"
                                            className="font-mono text-xs bg-white h-9"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Placa do Veículo / UF</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={vehiclePlate}
                                                onChange={e => setVehiclePlate(e.target.value)}
                                                placeholder="ABC1D23"
                                                className="font-mono uppercase text-xs bg-white h-9 flex-1"
                                            />
                                            <Select value={vehiclePlateState} onValueChange={setVehiclePlateState}>
                                                <SelectTrigger className="text-xs bg-white w-20 h-9"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
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
                                    <MessageSquare size={16} className="text-orange-600" /> Informações Complementares (infCpl)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-800">
                                        Observações Fiscais de Interesse do Contribuinte
                                    </Label>
                                    <textarea
                                        rows={5}
                                        value={additionalNotes}
                                        onChange={e => setAdditionalNotes(e.target.value)}
                                        placeholder="Informações adicionais que sairão impressas no rodapé do DANFE (ex: Isenção conforme artigo..., dados bancários, pedidos de compra, etc)..."
                                        className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>

                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                                    <span className="font-bold text-slate-800 uppercase text-[10px] block">Resumo Final da Emissão Avulsa:</span>
                                    <p className="text-slate-600">
                                        Destinatário: <strong>{destName || 'Não Informado'}</strong> ({destState || 'UF'})
                                    </p>
                                    <p className="text-slate-600">
                                        Natureza da Operação: <strong>{activeRule?.description || 'Não Selecionada'}</strong>
                                    </p>
                                    <p className="text-slate-600 font-mono">
                                        Quantidade Total de Itens: <strong>{itemsList.length}</strong> | Valor Total da NF-e: <strong className="text-emerald-700">{totalNfeValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </form>
        </div>
    );
}