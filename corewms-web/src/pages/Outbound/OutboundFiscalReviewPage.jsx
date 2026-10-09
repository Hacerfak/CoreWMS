import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, Loader2, FileCode, ShieldAlert, UserCheck, Layers } from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundFiscalReviewPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [fiscalRulesList, setFiscalRulesList] = useState([]);

    // Formulário de Ajustes Fiscais
    const [fiscalRuleId, setFiscalRuleId] = useState('');
    const [indFinal, setIndFinal] = useState('0');
    const [indPres, setIndPres] = useState('9');
    const [tpImp, setTpImp] = useState('1'); // 1 = Retrato, 2 = Paisagem
    const [additionalNotes, setAdditionalNotes] = useState('');

    useEffect(() => {
        if (orderId) {
            setIsLoading(true);

            // Carrega simultaneamente a pré-visualização e a lista completa de regras fiscais
            Promise.all([
                customInstance({ url: `/api/outbound/orders/${orderId}/fiscal-preview`, method: 'GET' }),
                customInstance({ url: `/api/fiscal/rules`, method: 'GET' })
            ])
                .then(([previewRes, rulesRes]) => {
                    const preview = previewRes?.data || previewRes;
                    const rules = rulesRes?.data || rulesRes || [];

                    setPreviewData(preview);
                    setFiscalRulesList(rules);

                    // Preseleciona a primeira regra ativa se não houver regra padrão
                    const defaultRule = rules.find(r => r.id === preview.defaultFiscalRuleId) || rules[0];
                    setFiscalRuleId(defaultRule?.id || '');

                    setIndFinal(preview.defaultIndFinal?.toString() || '0');
                    setIndPres(preview.defaultIndPres?.toString() || '9');
                    setTpImp(preview.defaultTpImp?.toString() || '1');
                    setAdditionalNotes(preview.additionalNotes || '');
                })
                .catch((err) => toast.error(err.response?.data?.message || 'Erro ao carregar dados fiscais.'))
                .finally(() => setIsLoading(false));
        }
    }, [orderId]);

    const handleConfirmShipment = async (e) => {
        e.preventDefault();

        if (!fiscalRuleId) {
            toast.error('Selecione uma Natureza de Operação para prosseguir.');
            return;
        }

        try {
            setIsSubmitting(true);

            // PASSO 1: Emitir e Autorizar a NF-e na SEFAZ enviando o fiscalRuleId
            const emitPayload = {
                orderId,
                fiscalRuleId,
                customIndFinal: Number(indFinal),
                customIndPres: Number(indPres),
                customTpImp: Number(tpImp),
                customAdditionalNotes: additionalNotes
            };

            const emitRes = await customInstance({
                url: `/api/fiscal/nfe/emit/${orderId}`,
                method: 'POST',
                data: emitPayload
            });

            const emitData = emitRes?.data || emitRes;

            if (emitRes?.status && emitRes.status >= 400) {
                throw new Error(emitData?.message || 'Falha na autorização da NF-e junto à SEFAZ.');
            }

            toast.success(emitData?.message || 'NF-e Autorizada com sucesso na SEFAZ!');

            // PASSO 2: Finalizar expedição no WMS
            const shipRes = await customInstance({
                url: `/api/outbound/orders/${orderId}/ship`,
                method: 'POST'
            });

            const shipData = shipRes?.data || shipRes;

            if (shipRes?.status && shipRes.status >= 400) {
                throw new Error(shipData?.message || 'Falha ao expedir e dar baixa no estoque.');
            }

            toast.success(shipData?.message || 'NF-e Autorizada e Pedido Expedido com Sucesso!');
            navigate(`/outbound/detalhes/${orderId}`);
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message || 'Erro durante a emissão ou expedição do pedido.';
            toast.error(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Calculando impostos e gerando espelho da NF-e...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/outbound/detalhes/${orderId}`)} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900">Revisão Fiscal & Emissão NF-e #{previewData?.orderNumber}</h1>
                            <Badge className="bg-orange-100 text-orange-800 border-orange-200">Pronto p/ Expedir</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong className="text-slate-700">{previewData?.customerName}</strong> | Destinatário: <strong className="text-slate-700">{previewData?.destinationName}</strong>
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/outbound')} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirmShipment} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 px-5">
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Assinar, Emitir & Expedir na SEFAZ
                    </Button>
                </div>
            </div>

            {/* PAINEL DE CONTEÚDO */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* CARD 1: PARÂMETROS DE EMISSÃO SEFAZ */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <FileCode size={16} className="text-orange-600" /> Parâmetros de Emissão SEFAZ (ide / infAdic)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Natureza da Operação Cadastrada *</Label>
                                <Select value={fiscalRuleId} onValueChange={setFiscalRuleId}>
                                    <SelectTrigger className="text-xs bg-white font-bold h-9"><SelectValue placeholder="Selecione a Natureza da Operação" /></SelectTrigger>
                                    <SelectContent>
                                        {fiscalRulesList?.map(rule => (
                                            <SelectItem key={rule.id} value={rule.id}>
                                                {rule.description} (CFOP {previewData?.isInterstate ? rule.cfopInterstate : rule.cfopStateInternal})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700">Consumidor Final (indFinal) *</Label>
                                    <Select value={indFinal} onValueChange={setIndFinal}>
                                        <SelectTrigger className="text-xs bg-white h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0">0 - Normal / Não Consumidor Final</SelectItem>
                                            <SelectItem value="1">1 - Consumidor Final</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700">Presença Comprador (indPres) *</Label>
                                    <Select value={indPres} onValueChange={setIndPres}>
                                        <SelectTrigger className="text-xs bg-white h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0">0 - Não se aplica</SelectItem>
                                            <SelectItem value="1">1 - Operação Presencial</SelectItem>
                                            <SelectItem value="2">2 - Operação Não Presencial (Internet)</SelectItem>
                                            <SelectItem value="9">9 - Operação Não Presencial (Outros)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-700">Orientação DANFE (tpImp) *</Label>
                                    <Select value={tpImp} onValueChange={setTpImp}>
                                        <SelectTrigger className="text-xs bg-white h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">1 - Retrato</SelectItem>
                                            <SelectItem value="2">2 - Paisagem</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-1.5 border-t border-slate-100 pt-3">
                                <Label className="text-xs font-semibold text-slate-700">Observações Fiscais Adicionais (infCpl)</Label>
                                <Input
                                    value={additionalNotes}
                                    onChange={(e) => setAdditionalNotes(e.target.value)}
                                    placeholder="Ex: Ref. Pedido de Compra #1234. Tributação conforme..."
                                    className="text-xs bg-white font-mono h-9"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* CARD 2: ESPELHO DOS ITENS E CFOPs */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-2"><Layers size={16} className="text-orange-600" /> Espelho dos Itens, CFOP e Tributação</span>
                                <Badge variant="secondary" className="font-mono">{previewData?.items?.length || 0} Item(ns)</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead>SKU / Descrição</TableHead>
                                            <TableHead className="text-center">CFOP</TableHead>
                                            <TableHead className="text-center">CST / CSOSN</TableHead>
                                            <TableHead className="text-right">Qtd Expedida</TableHead>
                                            <TableHead className="text-right">Valor Unit. (R$)</TableHead>
                                            <TableHead className="text-right">Total Item (R$)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewData?.items?.map((item, idx) => (
                                            <TableRow key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                <TableCell>
                                                    <span className="font-mono font-bold text-xs text-slate-900 block">{item.skuCode}</span>
                                                    <span className="text-[11px] text-slate-500">{item.description}</span>
                                                </TableCell>
                                                <TableCell className="text-center font-mono font-bold text-xs text-purple-700">
                                                    <Badge variant="outline" className="text-purple-700 border-purple-200 bg-purple-50">{item.cfop}</Badge>
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-xs">{item.cstCsosn}</TableCell>
                                                <TableCell className="text-right font-mono text-xs font-semibold">{item.quantity} {item.unit}</TableCell>
                                                <TableCell className="text-right font-mono text-xs text-slate-600">
                                                    {item.unitValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-xs text-slate-900">
                                                    {item.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* COLUNA DIREITA */}
                <div className="space-y-6">
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <UserCheck size={16} className="text-orange-600" /> Resumo do Destinatário & Totais
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3 text-xs">
                            <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Destinatário Final</span>
                                <span className="font-bold text-slate-900 block">{previewData?.destinationName}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">UF Destino</span>
                                    <span className="font-mono font-bold text-slate-800">{previewData?.destinationState}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Tipo Operação</span>
                                    <Badge className={previewData?.isInterstate ? 'bg-purple-100 text-purple-800 text-[10px]' : 'bg-blue-100 text-blue-800 text-[10px]'}>
                                        {previewData?.isInterstate ? 'Interestadual' : 'Interna'}
                                    </Badge>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Volume de Emissão</span>
                                <span className="font-bold text-slate-900 block">{previewData?.suggestedNfeCount} NF-e gerada</span>
                            </div>

                            <div className="pt-3 border-t border-slate-100 space-y-1">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Valor Total da Nota Fiscal</span>
                                <span className="font-mono font-extrabold text-xl text-emerald-700 block">
                                    {previewData?.totalProductsValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}