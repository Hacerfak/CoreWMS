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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, Send, Loader2, Sparkles, Plus, Trash2,
    FileText, UserCheck, Layers, Truck, MessageSquare, CreditCard,
    Calendar, Tag, Link as LinkIcon, DollarSign, Calculator, CheckCircle2, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const FORMAS_PAGAMENTO = [
    { value: '15', label: '15 - Boleto Bancário' },
    { value: '14', label: '14 - Duplicata Mercantil' },
    { value: '17', label: '17 - Pagamento Instantâneo (PIX)' },
    { value: '16', label: '16 - Depósito Bancário' },
    { value: '1', label: '01 - Dinheiro' },
    { value: '3', label: '03 - Cartão de Crédito' },
    { value: '4', label: '04 - Cartão de Débito' },
    { value: '18', label: '18 - Transferência Bancária' },
    { value: '90', label: '90 - Sem Pagamento' },
    { value: '99', label: '99 - Outros' }
];

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

    // Chaves de Acesso Referenciadas (NFref)
    const [refKeyInput, setRefKeyInput] = useState('');
    const [referencedKeys, setReferencedKeys] = useState([]);

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

    // --- ABA 3: ITENS & VALORES COM RASTREABILIDADE & PEDIDO ---
    const [selectedProductId, setSelectedProductId] = useState('');
    const [itemQty, setItemQty] = useState('1');
    const [itemUnitVal, setItemUnitVal] = useState('');
    const [itemBatch, setItemBatch] = useState('');
    const [itemManufactureDate, setItemManufactureDate] = useState('');
    const [itemExpirationDate, setItemExpirationDate] = useState('');
    const [itemXPed, setItemXPed] = useState('');
    const [itemNItemPed, setItemNItemPed] = useState('');
    const [itemsList, setItemsList] = useState([]);

    // --- ABA 4: COBRANÇA, FATURA & DUPLICATAS ---
    const [hasFinancialBilling, setHasFinancialBilling] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('15');
    const [paymentIndicator, setPaymentIndicator] = useState('1');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [invoiceDiscount, setInvoiceDiscount] = useState('0');
    const [duplicatas, setDuplicatas] = useState([]);

    // --- ABA 5: TRANSPORTE & FRETE ---
    const [freightModality, setFreightModality] = useState('9');
    const [carrierCnpjCpf, setCarrierCnpjCpf] = useState('');
    const [carrierName, setCarrierName] = useState('');
    const [carrierIe, setCarrierIe] = useState('');
    const [vehiclePlate, setVehiclePlate] = useState('');
    const [vehiclePlateState, setVehiclePlateState] = useState('RS');

    // --- ABA 6: OBSERVAÇÕES FISCAIS ---
    const [additionalNotes, setAdditionalNotes] = useState('');

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

    const activeRule = useMemo(() => {
        return fiscalRules.find(r => r.id === fiscalRuleId);
    }, [fiscalRules, fiscalRuleId]);

    // Identificação de CFOP 5124 para sugestão automática de faturamento comercial
    useEffect(() => {
        if (activeRule) {
            const is5124OrService =
                activeRule.cfopStateInternal === '5124' ||
                activeRule.cfopInterstate === '6124' ||
                activeRule.description?.toLowerCase().includes('industrialização') ||
                activeRule.description?.toLowerCase().includes('serviço') ||
                activeRule.description?.toLowerCase().includes('cobrança');

            if (is5124OrService) {
                setHasFinancialBilling(true);
                setPaymentMethod('15'); // Boleto
                setPaymentIndicator('1'); // A Prazo
            }
        }
    }, [activeRule]);

    // Total dos Produtos
    const totalProductsValue = useMemo(() => {
        return itemsList.reduce((acc, curr) => acc + curr.totalValue, 0);
    }, [itemsList]);

    // Valor Líquido da Fatura
    const invoiceNetValue = useMemo(() => {
        const disc = parseFloat(invoiceDiscount) || 0;
        return Math.max(0, totalProductsValue - disc);
    }, [totalProductsValue, invoiceDiscount]);

    // Soma das Duplicatas
    const totalDuplicatasValue = useMemo(() => {
        return duplicatas.reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);
    }, [duplicatas]);

    const isDuplicatasBalanced = useMemo(() => {
        if (!hasFinancialBilling) return true;
        if (duplicatas.length === 0) return false;
        return Math.abs(totalDuplicatasValue - invoiceNetValue) < 0.01;
    }, [hasFinancialBilling, duplicatas.length, totalDuplicatasValue, invoiceNetValue]);

    // Adição de Chave Referenciada (NFref)
    const handleAddReferencedKey = () => {
        const cleanKey = refKeyInput.replace(/\D/g, '');
        if (cleanKey.length !== 44) {
            return toast.warning('A chave de acesso da NF-e referenciada deve conter exatamente 44 dígitos numéricos.');
        }
        if (referencedKeys.includes(cleanKey)) {
            return toast.warning('Esta chave já foi adicionada.');
        }
        setReferencedKeys(prev => [...prev, cleanKey]);
        setRefKeyInput('');
        toast.info('Chave referenciada adicionada.');
    };

    const handleRemoveReferencedKey = (keyToRemove) => {
        setReferencedKeys(prev => prev.filter(k => k !== keyToRemove));
    };

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

    // Inclusão de Item com Lote e Pedido
    const handleAddItem = () => {
        if (!selectedProductId) return toast.warning('Selecione um produto do catálogo.');
        const qtyNum = parseFloat(itemQty);
        const valNum = parseFloat(itemUnitVal);

        if (isNaN(qtyNum) || qtyNum <= 0) return toast.warning('Informe uma quantidade válida maior que zero.');
        if (isNaN(valNum) || valNum < 0) return toast.warning('Informe um valor unitário válido.');

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
                totalValue: Math.round(qtyNum * valNum * 100) / 100,
                batch: itemBatch.trim() || null,
                manufactureDate: itemManufactureDate || null,
                expirationDate: itemExpirationDate || null,
                xPed: itemXPed.trim() || null,
                nItemPed: itemNItemPed ? parseInt(itemNItemPed, 10) : null
            }
        ]);

        setSelectedProductId('');
        setItemQty('1');
        setItemUnitVal('');
        setItemBatch('');
        setItemManufactureDate('');
        setItemExpirationDate('');
        setItemXPed('');
        setItemNItemPed('');
        toast.info('Item adicionado à lista.');
    };

    const handleRemoveItem = (idx) => {
        setItemsList(prev => prev.filter((_, i) => i !== idx));
    };

    // Gerador Automático de Parcelas / Duplicatas
    const handleGenerateInstallments = (count) => {
        if (invoiceNetValue <= 0) {
            return toast.warning('O valor total dos produtos deve ser maior que zero para gerar parcelas.');
        }

        const parcelValue = Math.round((invoiceNetValue / count) * 100) / 100;
        let remainder = Math.round((invoiceNetValue - (parcelValue * count)) * 100) / 100;

        const generated = [];
        const today = new Date();

        for (let i = 1; i <= count; i++) {
            const dueDate = new Date();
            dueDate.setDate(today.getDate() + (i * 30));
            const val = i === 1 ? parcelValue + remainder : parcelValue;

            generated.push({
                numero: String(i).padStart(3, '0'),
                dataVencimento: dueDate.toISOString().split('T')[0],
                valor: val.toFixed(2)
            });
        }

        setDuplicatas(generated);
        toast.success(`${count} parcela(s) gerada(s) com sucesso!`);
    };

    const handleAddDuplicataRow = () => {
        const nextNum = String(duplicatas.length + 1).padStart(3, '0');
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 30);

        setDuplicatas(prev => [
            ...prev,
            {
                numero: nextNum,
                dataVencimento: defaultDate.toISOString().split('T')[0],
                valor: '0.00'
            }
        ]);
    };

    const handleRemoveDuplicata = (idx) => {
        setDuplicatas(prev => prev.filter((_, i) => i !== idx));
    };

    const handleDuplicataChange = (idx, field, value) => {
        setDuplicatas(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], [field]: value };
            return updated;
        });
    };

    // Transmissão da NF-e Avulsa à SEFAZ
    const handleSubmitNfe = async (e) => {
        e?.preventDefault();

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

        if (hasFinancialBilling) {
            if (duplicatas.length === 0) {
                setActiveTab('cobranca');
                return toast.error('Para operações faturadas (com cobrança), adicione ao menos uma duplicata/parcela.');
            }
            if (!isDuplicatasBalanced) {
                setActiveTab('cobranca');
                return toast.error(
                    `A soma das duplicatas (R$ ${totalDuplicatasValue.toFixed(2)}) não confere com o valor líquido da fatura (R$ ${invoiceNetValue.toFixed(2)}).`
                );
            }
        }

        try {
            setIsSubmitting(true);

            // Monta o payload de Cobrança / Pagamento
            const paymentPayload = hasFinancialBilling ? {
                gerarCobranca: true,
                formaPagamento: Number(paymentMethod),
                indicadorPagamento: Number(paymentIndicator),
                numeroFatura: invoiceNumber.trim() || null,
                valorOriginalFatura: totalProductsValue,
                valorDescontoFatura: parseFloat(invoiceDiscount) || 0,
                valorLiquidoFatura: invoiceNetValue,
                duplicatas: duplicatas.map(d => ({
                    numero: d.numero.trim(),
                    dataVencimento: new Date(d.dataVencimento).toISOString(),
                    valor: parseFloat(d.valor) || 0
                }))
            } : {
                gerarCobranca: false,
                formaPagamento: 90, // Sem Pagamento
                indicadorPagamento: 0
            };

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
                    unitValue: i.unitValue,
                    batch: i.batch || null,
                    manufactureDate: i.manufactureDate ? new Date(i.manufactureDate).toISOString() : null,
                    expirationDate: i.expirationDate ? new Date(i.expirationDate).toISOString() : null,
                    xPed: i.xPed || null,
                    nItemPed: i.nItemPed || null
                })),
                payment: paymentPayload,
                referencedAccessKeys: referencedKeys.length > 0 ? referencedKeys : null
            };

            const res = await customInstance({
                url: '/api/fiscal/documents/standalone/emit',
                method: 'POST',
                data: payload
            });

            const data = res?.data || res;
            toast.success(data?.message || 'NF-e Autorizada com Sucesso na SEFAZ!');
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
                            <h1 className="text-xl font-bold text-slate-900">Emissão de NF-e Standalone</h1>
                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-mono text-xs">CFOP 5124 / Avulsa</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Emissão de Nota Fiscal com suporte completo a cobrança, faturas, duplicatas, rastreabilidade e pedidos.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right pr-2 hidden sm:block">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Total da Nota</span>
                        <span className="text-base font-bold font-mono text-emerald-700">
                            {totalProductsValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
                    <TabsList className="bg-white border border-slate-200/80 p-1 rounded-xl shadow-xs justify-start h-12 w-full gap-2 overflow-x-auto">
                        <TabsTrigger value="operacao" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <FileText size={15} /> 1. Operação & Referências
                        </TabsTrigger>
                        <TabsTrigger value="destinatario" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <UserCheck size={15} /> 2. Destinatário & Entrega
                        </TabsTrigger>
                        <TabsTrigger value="itens" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <Layers size={15} /> 3. Itens, Lotes & Pedidos ({itemsList.length})
                        </TabsTrigger>
                        <TabsTrigger value="cobranca" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <CreditCard size={15} /> 4. Cobrança & Fatura {hasFinancialBilling && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                        </TabsTrigger>
                        <TabsTrigger value="transporte" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <Truck size={15} /> 5. Transporte & Frete
                        </TabsTrigger>
                        <TabsTrigger value="observacoes" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                            <MessageSquare size={15} /> 6. Observações & Resumo
                        </TabsTrigger>
                    </TabsList>

                    {/* ABA 1: OPERAÇÃO & REFERÊNCIAS */}
                    <TabsContent value="operacao" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <FileText size={16} className="text-orange-600" /> Parâmetros da Operação & Notas Referenciadas (NFref)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-5">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-800">Natureza de Operação (Regra Fiscal Aplicada) *</Label>
                                    <Select value={fiscalRuleId} onValueChange={setFiscalRuleId}>
                                        <SelectTrigger className="bg-white h-10 text-xs font-semibold">
                                            <SelectValue placeholder="Selecione a Regra Fiscal..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {fiscalRules.map(r => (
                                                <SelectItem key={r.id} value={r.id}>
                                                    {r.description} (CFOP {r.cfopStateInternal} / {r.cfopInterstate})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {activeRule && (
                                        <p className="text-[11px] text-slate-500 font-mono">
                                            CFOP: <strong className="text-blue-700">{activeRule.cfopStateInternal}</strong> / <strong className="text-purple-700">{activeRule.cfopInterstate}</strong> | Finalidade: <strong>{activeRule.finalidade}</strong> | CST ICMS Base: <strong>{activeRule.cstCsosnIcms}</strong>
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

                                {/* CHAVES DE ACESSO REFERENCIADAS (NFREF) */}
                                <div className="border-t border-slate-100 pt-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                                <LinkIcon size={14} className="text-orange-600" /> Notas Fiscais Referenciadas (NFref)
                                            </Label>
                                            <span className="text-[11px] text-slate-500 block">
                                                Obrigatório para retornos e industrializações (ex: chave da NF-e de remessa para industrialização enviada pelo cliente).
                                            </span>
                                        </div>
                                        <Badge variant="outline" className="font-mono text-xs">{referencedKeys.length} chave(s)</Badge>
                                    </div>

                                    <div className="flex gap-2">
                                        <Input
                                            value={refKeyInput}
                                            onChange={e => setRefKeyInput(e.target.value)}
                                            placeholder="Digite ou bipe a chave de 44 dígitos da NF-e referenciada..."
                                            className="font-mono text-xs bg-white h-9 flex-1"
                                            maxLength={44}
                                        />
                                        <Button
                                            type="button"
                                            onClick={handleAddReferencedKey}
                                            variant="outline"
                                            className="bg-white text-orange-700 border-orange-200 hover:bg-orange-50 text-xs h-9"
                                        >
                                            <Plus size={14} className="mr-1" /> Adicionar Chave
                                        </Button>
                                    </div>

                                    {referencedKeys.length > 0 && (
                                        <div className="space-y-1.5 font-mono text-xs">
                                            {referencedKeys.map((key, kIdx) => (
                                                <div key={kIdx} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
                                                    <span className="font-bold text-slate-800">{key}</span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveReferencedKey(key)}
                                                        className="h-6 w-6 p-0 text-rose-600 hover:bg-rose-50"
                                                    >
                                                        <Trash2 size={13} />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
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

                    {/* ABA 3: ITENS & VALORES COM RASTREABILIDADE & PEDIDO */}
                    <TabsContent value="itens" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Plus size={16} className="text-orange-600" /> Adicionar Produto com Rastreabilidade & Pedido
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                                    <div className="md:col-span-3 space-y-1">
                                        <Label className="text-xs font-semibold text-slate-800">Produto do Catálogo *</Label>
                                        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                                            <SelectTrigger className="bg-white text-xs h-9">
                                                <SelectValue placeholder="Selecione um produto..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {products.map(p => (
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
                                            <Plus size={14} className="mr-1" /> Inserir Item
                                        </Button>
                                    </div>
                                </div>

                                {/* CAMPOS DE RASTREABILIDADE & PEDIDO DE COMPRA */}
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                    <div className="flex items-center justify-between border-b pb-2">
                                        <span className="text-[11px] font-bold uppercase text-slate-700 flex items-center gap-1.5">
                                            <Tag size={13} className="text-orange-600" /> Rastreabilidade (Lote / Validade) & Pedido de Compra do Cliente
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                            Lote completo = tag &lt;rastro&gt; | Lote simples = impresso em infAdProd
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Número do Lote</Label>
                                            <Input
                                                value={itemBatch}
                                                onChange={e => setItemBatch(e.target.value)}
                                                placeholder="Ex: 2610A"
                                                className="font-mono text-xs bg-white h-8"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Data Fabricação</Label>
                                            <Input
                                                type="date"
                                                value={itemManufactureDate}
                                                onChange={e => setItemManufactureDate(e.target.value)}
                                                className="font-mono text-xs bg-white h-8"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Data Validade</Label>
                                            <Input
                                                type="date"
                                                value={itemExpirationDate}
                                                onChange={e => setItemExpirationDate(e.target.value)}
                                                className="font-mono text-xs bg-white h-8"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Nº Pedido Cliente (xPed)</Label>
                                            <Input
                                                value={itemXPed}
                                                onChange={e => setItemXPed(e.target.value)}
                                                placeholder="Max 15 carac."
                                                maxLength={15}
                                                className="font-mono text-xs bg-white h-8"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Item do Pedido (nItemPed)</Label>
                                            <Input
                                                type="number"
                                                value={itemNItemPed}
                                                onChange={e => setItemNItemPed(e.target.value)}
                                                placeholder="Ex: 1"
                                                className="font-mono text-xs bg-white h-8"
                                            />
                                        </div>
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
                                            <TableHead>Rastreabilidade / Pedido</TableHead>
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
                                                <TableCell colSpan={9} className="h-28 text-center text-slate-400 italic">
                                                    Nenhum produto adicionado ainda. Utilize o formulário acima para inserir itens.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            itemsList.map((item, idx) => (
                                                <TableRow key={idx} className="hover:bg-slate-50/50">
                                                    <TableCell className="text-center font-mono text-xs text-slate-400">{idx + 1}</TableCell>
                                                    <TableCell className="font-mono font-bold text-xs text-slate-900">{item.sku}</TableCell>
                                                    <TableCell className="text-xs text-slate-700">{item.description}</TableCell>
                                                    <TableCell className="text-[11px] font-mono space-x-1">
                                                        {item.batch && (
                                                            <Badge variant="outline" className="text-[10px] bg-slate-50">
                                                                Lote: {item.batch}
                                                            </Badge>
                                                        )}
                                                        {item.expirationDate && (
                                                            <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">
                                                                Val: {item.expirationDate}
                                                            </Badge>
                                                        )}
                                                        {item.xPed && (
                                                            <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200">
                                                                Ped: {item.xPed} {item.nItemPed && `(#${item.nItemPed})`}
                                                            </Badge>
                                                        )}
                                                        {!item.batch && !item.xPed && <span className="text-slate-400">-</span>}
                                                    </TableCell>
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
                                            <span>Total dos Produtos: <strong className="text-emerald-700 text-sm">{totalProductsValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 4: COBRANÇA, FATURA & DUPLICATAS */}
                    <TabsContent value="cobranca" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <CreditCard size={16} className="text-orange-600" /> Cobrança Comercial, Fatura & Parcelas (Duplicatas)
                                </CardTitle>
                                <div className="flex items-center space-x-2">
                                    <Label htmlFor="billing-switch" className="text-xs font-semibold cursor-pointer">
                                        Gerar Cobrança Financeira (CFOP 5124 / Venda)
                                    </Label>
                                    <Switch
                                        id="billing-switch"
                                        checked={hasFinancialBilling}
                                        onCheckedChange={setHasFinancialBilling}
                                    />
                                </div>
                            </CardHeader>

                            <CardContent className="p-5 space-y-5">
                                {!hasFinancialBilling ? (
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs text-slate-600">
                                        <div className="flex items-center gap-2 font-bold text-slate-800">
                                            <Badge variant="outline" className="font-mono">tPag = 90 (Sem Pagamento)</Badge> Operação Não Financeira
                                        </div>
                                        <p>
                                            Esta nota fiscal será emitida sem grupo de cobrança (&lt;cobr&gt;) e com a forma de pagamento "90 - Sem Pagamento", conforme a exigência da SEFAZ para operações de retorno e remessa (CFOPs 5906, 5907, 5902, 5903, 5921, 5923).
                                        </p>
                                        <p className="text-[11px] text-slate-400">
                                            Para notas de serviço / industrialização (CFOP 5124), ative a chave acima para informar as parcelas e vencimentos.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-5">
                                        {/* FORMA E PRAZO DE PAGAMENTO */}
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="space-y-1.5 md:col-span-2">
                                                <Label className="text-xs font-semibold text-slate-800">Forma de Pagamento (tPag) *</Label>
                                                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                                    <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {FORMAS_PAGAMENTO.map(f => (
                                                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-semibold text-slate-800">Indicador de Pagamento (indPag) *</Label>
                                                <Select value={paymentIndicator} onValueChange={setPaymentIndicator}>
                                                    <SelectTrigger className="bg-white text-xs h-9"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="0">0 - À Vista</SelectItem>
                                                        <SelectItem value="1">1 - A Prazo</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-semibold text-slate-800">Nº da Fatura (Opcional)</Label>
                                                <Input
                                                    value={invoiceNumber}
                                                    onChange={e => setInvoiceNumber(e.target.value)}
                                                    placeholder="Padrão = Nº da NF-e"
                                                    className="font-mono text-xs bg-white h-9"
                                                />
                                            </div>
                                        </div>

                                        {/* VALORES DA FATURA */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <div className="space-y-1">
                                                <span className="text-[11px] font-semibold text-slate-600 uppercase block">Valor Original</span>
                                                <span className="text-base font-bold font-mono text-slate-900">
                                                    {totalProductsValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </span>
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-700">Desconto Comercial (R$)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={invoiceDiscount}
                                                    onChange={e => setInvoiceDiscount(e.target.value)}
                                                    className="font-mono text-xs bg-white h-8"
                                                />
                                            </div>

                                            <div className="space-y-1 text-right">
                                                <span className="text-[11px] font-semibold text-slate-600 uppercase block">Valor Líquido da Fatura</span>
                                                <span className="text-lg font-bold font-mono text-emerald-700">
                                                    {invoiceNetValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </span>
                                            </div>
                                        </div>

                                        {/* GERADOR RÁPIDO DE PARCELAS */}
                                        <div className="space-y-3 pt-2">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div>
                                                    <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                                        <Calculator size={14} className="text-orange-600" /> Parcelas / Duplicatas de Cobrança (&lt;dup&gt;)
                                                    </Label>
                                                    <span className="text-[11px] text-slate-500 block">
                                                        Gere automaticamente ou adicione duplicatas manuais.
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleGenerateInstallments(1)}
                                                        className="text-[11px] h-8 bg-white"
                                                    >
                                                        1x (30d)
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleGenerateInstallments(2)}
                                                        className="text-[11px] h-8 bg-white"
                                                    >
                                                        2x (30/60d)
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleGenerateInstallments(3)}
                                                        className="text-[11px] h-8 bg-white"
                                                    >
                                                        3x (30/60/90d)
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={handleAddDuplicataRow}
                                                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-[11px] h-8"
                                                    >
                                                        <Plus size={13} className="mr-1" /> Nova Linha
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* TABELA DE DUPLICATAS */}
                                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                                <Table>
                                                    <TableHeader className="bg-slate-50">
                                                        <TableRow>
                                                            <TableHead className="w-28 text-center">Nº Duplicata</TableHead>
                                                            <TableHead>Data de Vencimento *</TableHead>
                                                            <TableHead className="text-right">Valor da Parcela (R$) *</TableHead>
                                                            <TableHead className="w-12 text-right"></TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {duplicatas.length === 0 ? (
                                                            <TableRow>
                                                                <TableCell colSpan={4} className="h-24 text-center text-slate-400 italic">
                                                                    Nenhuma duplicata configurada. Clique nos atalhos acima para gerar.
                                                                </TableCell>
                                                            </TableRow>
                                                        ) : (
                                                            duplicatas.map((dup, idx) => (
                                                                <TableRow key={idx}>
                                                                    <TableCell>
                                                                        <Input
                                                                            value={dup.numero}
                                                                            onChange={e => handleDuplicataChange(idx, 'numero', e.target.value)}
                                                                            className="font-mono text-xs text-center bg-white h-8"
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Input
                                                                            type="date"
                                                                            value={dup.dataVencimento}
                                                                            onChange={e => handleDuplicataChange(idx, 'dataVencimento', e.target.value)}
                                                                            className="font-mono text-xs bg-white h-8"
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={dup.valor}
                                                                            onChange={e => handleDuplicataChange(idx, 'valor', e.target.value)}
                                                                            className="font-mono text-xs text-right bg-white h-8"
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => handleRemoveDuplicata(idx)}
                                                                            className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                                                                        >
                                                                            <Trash2 size={13} />
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>

                                            {/* CONFERÊNCIA DE TOTAL DE DUPLICATAS */}
                                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {isDuplicatasBalanced ? (
                                                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                                                            ✓ Soma das duplicatas confere 100% com a fatura
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-xs flex items-center gap-1">
                                                            <AlertCircle size={13} /> Divergência: Diferença de R$ {(invoiceNetValue - totalDuplicatasValue).toFixed(2)}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="font-mono text-xs text-right">
                                                    <span className="text-slate-500">Total das Duplicatas: </span>
                                                    <strong className={isDuplicatasBalanced ? 'text-emerald-700' : 'text-rose-600'}>
                                                        {totalDuplicatasValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </strong>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ABA 5: TRANSPORTE & FRETE */}
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

                    {/* ABA 6: OBSERVAÇÕES & RESUMO */}
                    <TabsContent value="observacoes" className="space-y-4 mt-0">
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-4 border-b bg-slate-50/50">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <MessageSquare size={16} className="text-orange-600" /> Informações Complementares (infCpl) & Resumo da Emissão
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-800">
                                        Observações Fiscais de Interesse do Contribuinte
                                    </Label>
                                    <textarea
                                        rows={4}
                                        value={additionalNotes}
                                        onChange={e => setAdditionalNotes(e.target.value)}
                                        placeholder="Informações adicionais impressas no rodapé do DANFE (ex: Isenção de ICMS conforme..., dados bancários para depósito, etc)..."
                                        className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>

                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                                    <span className="font-bold text-slate-800 uppercase text-[10px] block tracking-wider">
                                        Espelho de Validação da Emissão:
                                    </span>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-700">
                                        <div>
                                            <p>Destinatário: <strong>{destName || 'Não Informado'}</strong> ({destState})</p>
                                            <p>Natureza: <strong>{activeRule?.description || 'Não Selecionada'}</strong></p>
                                            <p>CFOP: <strong className="font-mono text-blue-700">{activeRule?.cfopStateInternal}</strong> / <strong className="font-mono text-purple-700">{activeRule?.cfopInterstate}</strong></p>
                                        </div>
                                        <div>
                                            <p>Total Itens: <strong>{itemsList.length} SKU(s)</strong></p>
                                            <p>Total Produtos: <strong className="font-mono text-emerald-700">{totalProductsValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>
                                            <p>Cobrança: <strong>{hasFinancialBilling ? `Faturado (${duplicatas.length} parcelas)` : 'Sem Cobrança (tPag = 90)'}</strong></p>
                                            {referencedKeys.length > 0 && (
                                                <p className="text-slate-500 font-mono">Chaves Referenciadas: {referencedKeys.length}</p>
                                            )}
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