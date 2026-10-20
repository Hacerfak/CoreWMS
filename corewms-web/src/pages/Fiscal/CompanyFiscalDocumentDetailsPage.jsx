import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, FileCode, Download, Ban, FileSignature, Loader2,
    Building2, UserCheck, Truck, CreditCard, Layers, Sparkles,
    Copy, Check, Clock, ShieldCheck, Tag, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import CancelNfeModal from '@/pages/Fiscal/CancelNfeModal';
import CorrectionLetterModal from '@/pages/Fiscal/CorrectionLetterModal';

const formatCurrency = (val) => {
    const num = Number(val);
    return (isNaN(num) ? 0 : num).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatNumber = (val) => {
    const num = Number(val);
    return (isNaN(num) ? 0 : num).toLocaleString('pt-BR');
};

const formatDatePtBr = (dateValue) => {
    if (!dateValue) return '-';
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch {
        return '-';
    }
};

const formatDateTimePtBr = (dateValue) => {
    if (!dateValue) return '-';
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('pt-BR');
    } catch {
        return '-';
    }
};

export default function CompanyFiscalDocumentDetailsPage() {
    const { id: documentId } = useParams();
    const navigate = useNavigate();

    const [doc, setDoc] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [downloadingType, setDownloadingType] = useState(null);
    const [hasCopiedKey, setHasCopiedKey] = useState(false);

    // Modais SEFAZ (Cancelamento & CC-e)
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);

    const loadDocumentDetails = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/fiscal/documents/${documentId}`,
                method: 'GET'
            });
            const data = res?.data || res;
            setDoc(data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao carregar detalhes do documento fiscal.');
            navigate('/fiscal/documentos');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (documentId) loadDocumentDetails();
    }, [documentId]);

    const handleCopyAccessKey = () => {
        if (!doc?.accessKey) return;
        navigator.clipboard.writeText(doc.accessKey);
        setHasCopiedKey(true);
        toast.success('Chave de acesso copiada para a área de transferência!');
        setTimeout(() => setHasCopiedKey(false), 2000);
    };

    const handleDownloadXml = async (targetDocId, accessKey, isEvent = false) => {
        try {
            setDownloadingType('xml');
            const response = await customInstance({
                url: `/api/fiscal/nfe/${targetDocId || doc.id}/xml`,
                method: 'GET',
                responseType: 'blob'
            });

            const blob = new Blob([response], { type: 'application/xml' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const suffix = isEvent ? '-evento.xml' : '.xml';
            link.setAttribute('download', `${accessKey || targetDocId || 'nfe'}${suffix}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Download do XML concluído!');
        } catch {
            toast.error('Erro ao baixar arquivo XML.');
        } finally {
            setDownloadingType(null);
        }
    };

    const handleDownloadPdf = async (targetDocId, accessKey, isEvent = false) => {
        try {
            setDownloadingType('pdf');
            const response = await customInstance({
                url: `/api/fiscal/nfe/${targetDocId || doc.id}/pdf`,
                method: 'GET',
                responseType: 'blob'
            });

            const blob = new Blob([response], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const suffix = isEvent ? '-evento.pdf' : '-danfe.pdf';
            link.setAttribute('download', `${accessKey || targetDocId || 'nfe'}${suffix}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Download do PDF concluído!');
        } catch {
            toast.error('Erro ao baixar PDF fiscal.');
        } finally {
            setDownloadingType(null);
        }
    };

    if (isLoading && !doc) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[450px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando detalhes analíticos da NF-e...</p>
            </div>
        );
    }

    const statusStr = String(doc?.status || '').toLowerCase();
    const isAuthorized = statusStr === 'authorized' || statusStr === '2';
    const isCanceled = statusStr === 'canceled' || statusStr === '4';
    const isRejected = statusStr === 'rejected' || statusStr === '3';

    const isNfeOriginal = Number(doc?.type) <= 6;

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/fiscal/documentos')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl font-bold tracking-tight text-slate-900 font-mono">
                                NF-e #{doc?.numeroNf || 'S/N'} {doc?.serieNf ? `(Série ${doc.serieNf})` : ''}
                            </h1>
                            <Badge className={
                                isAuthorized ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                    isRejected ? 'bg-rose-100 text-rose-800 border-rose-200' :
                                        isCanceled ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                            'bg-amber-100 text-amber-800 border-amber-200'
                            }>
                                {isAuthorized ? '✓ Autorizada SEFAZ' :
                                    isRejected ? '✕ Rejeitada' :
                                        isCanceled ? '⊘ Cancelada' : '⏳ Pendente'}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs">
                                {doc?.typeDescription || 'NF-e'}
                            </Badge>
                            <Badge variant="secondary" className="font-mono text-[11px]">
                                {doc?.environment || 'Produção'}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Destinatário: <strong className="text-slate-800">{doc?.destinatarioNome || 'Não informado'}</strong> | Emitida em: <span className="font-mono">{formatDateTimePtBr(doc?.dataEmissao || doc?.createdAt)}</span>
                        </p>
                    </div>
                </div>

                {/* BOTÕES DE AÇÕES NO CABEÇALHO */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* DOWNLOAD XML */}
                    {doc?.accessKey && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadXml(doc.id, doc.accessKey)}
                            disabled={downloadingType === 'xml'}
                            className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 font-medium h-9 text-xs"
                        >
                            {downloadingType === 'xml' ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <FileCode size={13} className="mr-1.5 text-blue-600" />}
                            XML
                        </Button>
                    )}

                    {/* DOWNLOAD DANFE */}
                    {isAuthorized && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadPdf(doc.id, doc.accessKey)}
                            disabled={downloadingType === 'pdf'}
                            className="bg-white text-orange-700 border-orange-200 hover:bg-orange-50 font-medium h-9 text-xs"
                        >
                            {downloadingType === 'pdf' ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Download size={13} className="mr-1.5 text-orange-600" />}
                            DANFE
                        </Button>
                    )}

                    {/* EVENTOS SEFAZ */}
                    {isAuthorized && isNfeOriginal && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsCorrectionModalOpen(true)}
                                className="bg-white text-purple-700 border-purple-200 hover:bg-purple-50 font-medium h-9 text-xs"
                            >
                                <FileSignature size={13} className="mr-1.5 text-purple-600" /> CC-e
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsCancelModalOpen(true)}
                                className="bg-white text-rose-700 border-rose-200 hover:bg-rose-50 font-medium h-9 text-xs"
                            >
                                <Ban size={13} className="mr-1.5 text-rose-600" /> Cancelar NF-e
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* CARDS DE RESUMO FINANCEIRO & VOLUMES */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-emerald-200 bg-emerald-50/20 shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-emerald-800 uppercase flex items-center justify-between">
                            <span>Valor Total da Nota</span>
                            <ShieldCheck size={16} className="text-emerald-700" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-emerald-800">
                            {formatCurrency(doc?.valorTotalNfe || 0)}
                        </p>
                        <span className="text-[10px] text-emerald-600 font-mono">Total Documento Fiscal</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Total dos Produtos</span>
                            <Layers size={16} className="text-blue-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-slate-900">
                            {formatCurrency(doc?.valorProdutos || 0)}
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono">{doc?.itens?.length || 0} item(ns) discriminado(s)</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Impostos Destacados</span>
                            <Sparkles size={16} className="text-purple-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-purple-800">
                            {formatCurrency((doc?.valorIcms || 0) + (doc?.valorIpi || 0))}
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono">ICMS: {formatCurrency(doc?.valorIcms || 0)} | IPI: {formatCurrency(doc?.valorIpi || 0)}</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Volumes & Peso Bruto</span>
                            <Truck size={16} className="text-orange-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-slate-900">
                            {formatNumber(doc?.quantidadeVolumes || 0)} <span className="text-sm font-sans font-normal text-slate-500">vol(s)</span>
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono">Peso Bruto: {formatNumber(doc?.pesoBruto || 0)} kg</span>
                    </CardContent>
                </Card>
            </div>

            {/* ABAS ANALÍTICAS DA NOTA FISCAL */}
            <Tabs defaultValue="geral" className="w-full space-y-4">
                <TabsList className="bg-white border border-slate-200/80 p-1 rounded-xl shadow-xs justify-start h-12 w-full gap-2 overflow-x-auto">
                    <TabsTrigger value="geral" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                        <FileText size={15} /> 1. Visão Geral & Partes
                    </TabsTrigger>
                    <TabsTrigger value="itens" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                        <Layers size={15} /> 2. Itens & Tributação ({doc?.itens?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="transporte" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                        <Truck size={15} /> 3. Transporte & Carga
                    </TabsTrigger>
                    <TabsTrigger value="cobranca" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                        <CreditCard size={15} /> 4. Cobrança & Fatura {doc?.duplicatas?.length > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                    </TabsTrigger>
                    <TabsTrigger value="eventos" className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 gap-2 px-3 text-xs font-semibold">
                        <Clock size={15} /> 5. Histórico de Eventos ({doc?.linkedEvents?.length || 0})
                    </TabsTrigger>
                </TabsList>

                {/* ABA 1: VISÃO GERAL & PARTES */}
                <TabsContent value="geral" className="space-y-4 mt-0">
                    <Card className="border-slate-200/80 bg-white shadow-2xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <ShieldCheck size={16} className="text-emerald-600" /> Protocolo de Autorização & Chave de Acesso SEFAZ
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3 font-mono text-xs">
                            <div className="bg-slate-50 p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Chave de Acesso (44 dígitos)</span>
                                    <span className="font-bold text-slate-900 text-xs break-all select-all">{doc?.accessKey || 'Ainda não gerada'}</span>
                                </div>
                                {doc?.accessKey && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopyAccessKey}
                                        className="h-8 text-xs shrink-0 bg-white"
                                    >
                                        {hasCopiedKey ? <Check size={13} className="text-emerald-600 mr-1" /> : <Copy size={13} className="mr-1 text-slate-500" />}
                                        {hasCopiedKey ? 'Copiada!' : 'Copiar Chave'}
                                    </Button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                                <div className="p-2.5 bg-slate-50 rounded-lg border">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Protocolo SEFAZ</span>
                                    <span className="font-bold text-slate-800">{doc?.protocol || '-'}</span>
                                </div>
                                <div className="p-2.5 bg-slate-50 rounded-lg border">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Natureza da Operação</span>
                                    <span className="font-bold text-slate-800 truncate block" title={doc?.naturezaOperacao}>{doc?.naturezaOperacao || '-'}</span>
                                </div>
                                <div className="p-2.5 bg-slate-50 rounded-lg border">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Origem WMS</span>
                                    <span className="font-bold text-slate-800">{doc?.outboundOrderNumber ? `Pedido #${doc.outboundOrderNumber}` : 'Emissão Avulsa'}</span>
                                </div>
                                <div className="p-2.5 bg-slate-50 rounded-lg border">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Mensagem SEFAZ</span>
                                    <span className="font-bold text-emerald-700 truncate block" title={doc?.returnMessage}>{doc?.returnMessage || 'Autorizado o uso da NF-e'}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* DADOS DO EMITENTE E DESTINATÁRIO */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* EMITENTE */}
                        <Card className="border-slate-200/80 bg-white shadow-2xs">
                            <CardHeader className="p-4 border-b bg-slate-50/60">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Building2 size={16} className="text-blue-600" /> Emitente (Armazém Geral / Empresa)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-2 text-xs">
                                <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Razão Social / Fantasia</span>
                                    <strong className="text-slate-900 block text-sm">{doc?.emitenteNome || 'Empresa Emitente'}</strong>
                                    {doc?.emitenteFantasia && <span className="text-[11px] text-slate-500 font-sans">{doc.emitenteFantasia}</span>}
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 font-mono">
                                    <div>
                                        <span className="text-[10px] text-slate-400 uppercase block">CNPJ</span>
                                        <strong>{doc?.emitenteCnpjCpf || '-'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 uppercase block">Inscrição Estadual</span>
                                        <strong>{doc?.emitenteIe || '-'}</strong>
                                    </div>
                                </div>

                                <div className="pt-1 border-t border-slate-100 text-[11px] text-slate-600">
                                    <span className="text-[10px] text-slate-400 uppercase block font-semibold mb-0.5">Endereço Fiscal</span>
                                    <p>{doc?.emitenteEndereco || '-'}</p>
                                    <p className="font-mono">{doc?.emitenteMunicipio} / {doc?.emitenteUf} - CEP: {doc?.emitenteCep}</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* DESTINATÁRIO */}
                        <Card className="border-slate-200/80 bg-white shadow-2xs">
                            <CardHeader className="p-4 border-b bg-slate-50/60">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <UserCheck size={16} className="text-emerald-600" /> Destinatário / Cliente
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-2 text-xs">
                                <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Razão Social / Nome</span>
                                    <strong className="text-slate-900 block text-sm">{doc?.destinatarioNome || 'Destinatário'}</strong>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 font-mono">
                                    <div>
                                        <span className="text-[10px] text-slate-400 uppercase block">CNPJ / CPF</span>
                                        <strong>{doc?.destinatarioCnpjCpf || '-'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 uppercase block">Inscrição Estadual</span>
                                        <strong>{doc?.destinatarioIe || 'ISENTO'}</strong>
                                    </div>
                                </div>

                                <div className="pt-1 border-t border-slate-100 text-[11px] text-slate-600">
                                    <span className="text-[10px] text-slate-400 uppercase block font-semibold mb-0.5">Local de Entrega / Faturamento</span>
                                    <p>{doc?.destinatarioEndereco || '-'}</p>
                                    <p className="font-mono">{doc?.destinatarioMunicipio} / {doc?.destinatarioUf} - CEP: {doc?.destinatarioCep}</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* OBSERVAÇÕES FISCAIS (INFCPL) */}
                    {doc?.informacoesComplementares && (
                        <Card className="border-slate-200/80 bg-white shadow-2xs">
                            <CardHeader className="p-3 border-b bg-slate-50/60">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-1.5">
                                    <FileText size={15} className="text-orange-600" /> Informações Complementares (infCpl - Impresso no DANFE)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 text-xs text-slate-700 font-mono leading-relaxed bg-slate-50/40 whitespace-pre-wrap">
                                {doc.informacoesComplementares}
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* ABA 2: ITENS & TRIBUTAÇÃO */}
                <TabsContent value="itens" className="space-y-4 mt-0">
                    <Card className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                        <CardHeader className="p-4 border-b bg-slate-50/60 flex flex-row items-center justify-between">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <Layers size={16} className="text-orange-600" /> Detalhamento de Itens, Rastreabilidade & Impostos
                            </CardTitle>
                            <Badge variant="secondary" className="font-mono">{doc?.itens?.length || 0} SKU(s)</Badge>
                        </CardHeader>

                        <CardContent className="p-0 overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="w-10 text-center">#</TableHead>
                                        <TableHead>SKU / Código</TableHead>
                                        <TableHead>Descrição do Produto</TableHead>
                                        <TableHead className="text-center">NCM / CFOP</TableHead>
                                        <TableHead className="text-center">Tributação (CST)</TableHead>
                                        <TableHead>Rastreabilidade / Pedido</TableHead>
                                        <TableHead className="text-right">Qtd / UN</TableHead>
                                        <TableHead className="text-right">V. Unitário</TableHead>
                                        <TableHead className="text-right">Total R$</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!doc?.itens || doc.itens.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="h-28 text-center text-slate-400 italic">
                                                Nenhum item discriminado no XML desta nota.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        doc.itens.map((item) => (
                                            <TableRow key={item.numeroItem} className="hover:bg-slate-50/50 text-xs">
                                                <TableCell className="text-center font-mono text-slate-400">{item.numeroItem}</TableCell>
                                                <TableCell className="font-mono font-bold text-slate-900">{item.codigoProduto}</TableCell>
                                                <TableCell className="text-slate-800 font-sans">
                                                    <span>{item.descricao}</span>
                                                    {item.infAdProd && (
                                                        <span className="block text-[10px] text-slate-400 font-mono italic mt-0.5">{item.infAdProd}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center font-mono">
                                                    <span className="block text-slate-700">{item.ncm}</span>
                                                    <Badge variant="outline" className="text-[10px] font-bold text-blue-700 bg-blue-50 border-blue-200">
                                                        {item.cfop}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-[11px]">
                                                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                                                        ICMS {item.cstIcms || '-'} {item.aliqIcms > 0 && `(${item.aliqIcms}%)`}
                                                    </Badge>
                                                    {item.cstIpi && <span className="block text-[10px] text-slate-400">IPI: {item.cstIpi}</span>}
                                                </TableCell>
                                                <TableCell className="font-mono text-[11px] space-y-1">
                                                    {item.lote && (
                                                        <Badge variant="outline" className="text-[10px] bg-slate-50 flex items-center gap-1 w-fit">
                                                            <Tag size={10} className="text-slate-400" /> Lote: {item.lote}
                                                        </Badge>
                                                    )}
                                                    {item.dataValidade && (
                                                        <span className="text-[10px] text-amber-700 block">Val: {formatDatePtBr(item.dataValidade)}</span>
                                                    )}
                                                    {item.numeroPedido && (
                                                        <span className="text-[10px] text-blue-700 block">Ped: {item.numeroPedido} {item.itemPedido && `(#${item.itemPedido})`}</span>
                                                    )}
                                                    {!item.lote && !item.numeroPedido && <span className="text-slate-400">-</span>}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-semibold text-slate-800">
                                                    {formatNumber(item.quantidade)} {item.unidade}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-slate-600">
                                                    {formatCurrency(item.valorUnitario)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-bold text-emerald-700 text-sm">
                                                    {formatCurrency(item.valorTotal)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ABA 3: TRANSPORTE & CARGA */}
                <TabsContent value="transporte" className="space-y-4 mt-0">
                    <Card className="border-slate-200/80 bg-white shadow-2xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <Truck size={16} className="text-orange-600" /> Modalidade de Frete, Transportadora & Volumes
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-3 bg-slate-50 rounded-xl border">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Modalidade do Frete</span>
                                    <strong className="text-slate-900 text-sm">{doc?.modalidadeFreteDescricao || '9 - Sem Frete'}</strong>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Veículo / Placa</span>
                                    <strong className="text-slate-900 font-mono text-sm">{doc?.veiculoPlaca || '-'} {doc?.veiculoUf && `(${doc.veiculoUf})`}</strong>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border">
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Volumes & Espécie</span>
                                    <strong className="text-slate-900 font-mono text-sm">{formatNumber(doc?.quantidadeVolumes || 0)} {doc?.especieVolumes || 'VOLUMES'}</strong>
                                </div>
                            </div>

                            {/* DADOS DA TRANSPORTADORA */}
                            <div className="pt-2 border-t border-slate-100 space-y-2">
                                <span className="font-bold text-slate-800 uppercase text-[11px] block">Dados da Transportadora Contratada</span>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50/60 p-3 rounded-xl border">
                                    <div className="md:col-span-2">
                                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Razão Social</span>
                                        <strong className="text-slate-800">{doc?.transportadoraNome || 'Não informada'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 block uppercase font-bold">CNPJ / CPF</span>
                                        <span className="font-mono text-slate-700">{doc?.transportadoraCnpjCpf || '-'}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Inscrição Estadual</span>
                                        <span className="font-mono text-slate-700">{doc?.transportadoraIe || '-'}</span>
                                    </div>
                                    <div className="md:col-span-2 pt-1 border-t border-slate-200/50">
                                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Endereço da Transportadora (xEnder)</span>
                                        <span className="text-slate-700">{doc?.transportadoraEndereco || '-'}</span>
                                    </div>
                                    <div className="md:col-span-2 pt-1 border-t border-slate-200/50">
                                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Município / UF (xMun / UF)</span>
                                        <span className="text-slate-700 font-mono">{doc?.transportadoraMunicipio || '-'} {doc?.transportadoraUf && `/ ${doc.transportadoraUf}`}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ABA 4: COBRANÇA & FATURA */}
                <TabsContent value="cobranca" className="space-y-4 mt-0">
                    <Card className="border-slate-200/80 bg-white shadow-2xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60 flex flex-row items-center justify-between">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <CreditCard size={16} className="text-orange-600" /> Fatura, Duplicatas & Pagamento
                            </CardTitle>
                            {doc?.duplicatas?.length > 0 && (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-mono text-xs">
                                    {doc.duplicatas.length} Parcela(s)
                                </Badge>
                            )}
                        </CardHeader>
                        <CardContent className="p-5 space-y-4 text-xs">
                            {/* DADOS DA FATURA */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border">
                                <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Número da Fatura</span>
                                    <strong className="font-mono text-slate-800">{doc?.numeroFatura || doc?.numeroNf || '-'}</strong>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Valor Original</span>
                                    <strong className="font-mono text-slate-800">{formatCurrency(doc?.valorOriginalFatura || doc?.valorTotalNfe || 0)}</strong>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Desconto</span>
                                    <span className="font-mono text-slate-600">{formatCurrency(doc?.valorDescontoFatura || 0)}</span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Valor Líquido</span>
                                    <strong className="font-mono text-emerald-700 text-sm">{formatCurrency(doc?.valorLiquidoFatura || doc?.valorTotalNfe || 0)}</strong>
                                </div>
                            </div>

                            {/* DUPLICATAS */}
                            <div className="pt-2">
                                <span className="font-bold text-slate-800 uppercase text-[11px] block mb-2">Duplicatas / Parcelas a Receber</span>
                                {!doc?.duplicatas || doc.duplicatas.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-xl border text-center">
                                        Operação sem parcelas de cobrança declaradas no XML (padrão para remessas e retornos de armazenagem).
                                    </p>
                                ) : (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <Table>
                                            <TableHeader className="bg-slate-50">
                                                <TableRow>
                                                    <TableHead className="w-24 text-center">Nº Parcela</TableHead>
                                                    <TableHead>Data de Vencimento</TableHead>
                                                    <TableHead className="text-right">Valor da Parcela</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {doc.duplicatas.map((dup, dIdx) => (
                                                    <TableRow key={dIdx} className="font-mono text-xs">
                                                        <TableCell className="text-center font-bold text-slate-700">{dup.numero}</TableCell>
                                                        <TableCell className="text-slate-800">{formatDatePtBr(dup.vencimento)}</TableCell>
                                                        <TableCell className="text-right font-bold text-emerald-700">{formatCurrency(dup.valor)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>

                            {/* FORMAS DE PAGAMENTO */}
                            {doc?.pagamentos && doc.pagamentos.length > 0 && (
                                <div className="pt-2 border-t border-slate-100">
                                    <span className="font-bold text-slate-800 uppercase text-[11px] block mb-2">Forma de Pagamento Declarada</span>
                                    <div className="space-y-1.5 font-mono">
                                        {doc.pagamentos.map((pag, pIdx) => (
                                            <div key={pIdx} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border">
                                                <span className="font-sans font-medium text-slate-700">{pag.formaDescricao}</span>
                                                <strong className="text-slate-900">{formatCurrency(pag.valor)}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ABA 5: HISTÓRICO DE EVENTOS SEFAZ */}
                <TabsContent value="eventos" className="space-y-4 mt-0">
                    <Card className="border-slate-200/80 bg-white shadow-2xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                    <Clock size={16} className="text-purple-600" /> Eventos Fiscais Homologados na SEFAZ
                                </CardTitle>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Histórico cronológico de Cartas de Correção (CC-e) e Cancelamentos vinculados à chave desta NF-e.
                                </p>
                            </div>

                            {isAuthorized && isNfeOriginal && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setIsCorrectionModalOpen(true)}
                                        className="h-8 text-xs bg-white text-purple-700 border-purple-200 hover:bg-purple-50"
                                    >
                                        <FileSignature size={13} className="mr-1 text-purple-600" /> Nova CC-e
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setIsCancelModalOpen(true)}
                                        className="h-8 text-xs bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                                    >
                                        <Ban size={13} className="mr-1 text-rose-600" /> Cancelar Nota
                                    </Button>
                                </div>
                            )}
                        </CardHeader>

                        <CardContent className="p-4">
                            {!doc?.linkedEvents || doc.linkedEvents.length === 0 ? (
                                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 italic">
                                    Nenhum evento registrado para esta NF-e na SEFAZ até o momento.
                                </div>
                            ) : (
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead>Data do Evento</TableHead>
                                                <TableHead>Tipo de Evento</TableHead>
                                                <TableHead>Protocolo SEFAZ</TableHead>
                                                <TableHead>Mensagem de Retorno</TableHead>
                                                <TableHead className="text-right w-44">Downloads</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {doc.linkedEvents.map((evt) => (
                                                <TableRow key={evt.id} className="text-xs font-mono">
                                                    <TableCell className="text-slate-700">{formatDateTimePtBr(evt.createdAt)}</TableCell>
                                                    <TableCell className="font-bold text-slate-900 font-sans">
                                                        <Badge variant="outline" className={`text-[10px] ${evt.type === 7 ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-purple-700 bg-purple-50 border-purple-200'}`}>
                                                            {evt.typeDescription}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-slate-800">{evt.protocol || '-'}</TableCell>
                                                    <TableCell className="text-slate-600 font-sans truncate max-w-xs" title={evt.returnMessage}>
                                                        {evt.returnMessage || '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-1.5">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleDownloadXml(evt.id, doc.accessKey, true)}
                                                                className="h-7 text-[11px] px-2 bg-white"
                                                            >
                                                                XML
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleDownloadPdf(evt.id, doc.accessKey, true)}
                                                                className="h-7 text-[11px] px-2 bg-white"
                                                            >
                                                                PDF
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* MODAL DE CANCELAMENTO */}
            <CancelNfeModal
                open={isCancelModalOpen}
                onOpenChange={setIsCancelModalOpen}
                documentId={doc?.id}
                orderId={doc?.outboundOrderId}
                orderNumber={doc?.outboundOrderNumber || 'Avulsa'}
                accessKey={doc?.accessKey}
                onSuccess={loadDocumentDetails}
            />

            {/* MODAL DE CARTA DE CORREÇÃO (CC-e) */}
            <CorrectionLetterModal
                open={isCorrectionModalOpen}
                onOpenChange={setIsCorrectionModalOpen}
                documentId={doc?.id}
                orderId={doc?.outboundOrderId}
                orderNumber={doc?.outboundOrderNumber || 'Avulsa'}
                accessKey={doc?.accessKey}
                onSuccess={loadDocumentDetails}
            />
        </div>
    );
}