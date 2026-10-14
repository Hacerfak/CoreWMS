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
import {
    Search, Plus, FileCode, Download, Ban, FileSignature, Trash2, Eye, Loader2, Layers, AlertTriangle, ShieldCheck, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import CancelNfeModal from '@/pages/Outbound/CancelNfeModal';
import CorrectionLetterModal from '@/pages/Outbound/CorrectionLetterModal';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export default function CompanyFiscalDocumentsPage() {
    const [documents, setDocuments] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Filtros
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');

    // Downloads
    const [downloadingDocId, setDownloadingDocId] = useState(null);

    // Modais Fiscais (Eventos)
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [selectedDocForCancel, setSelectedDocForCancel] = useState(null);

    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
    const [selectedDocForCorrection, setSelectedDocForCorrection] = useState(null);

    // Modal de Detalhes & Eventos
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [selectedDocForDetails, setSelectedDocForDetails] = useState(null);

    // Modal de Emissão de Nota Avulsa
    const [isStandaloneModalOpen, setIsStandaloneModalOpen] = useState(false);
    const [fiscalRules, setFiscalRules] = useState([]);
    const [availableProducts, setAvailableProducts] = useState([]);
    const [isSubmittingStandalone, setIsSubmittingStandalone] = useState(false);

    // Form Avulso
    const [saRuleId, setSaRuleId] = useState('');
    const [saName, setSaName] = useState('');
    const [saCnpjCpf, setSaCnpjCpf] = useState('');
    const [saIe, setSaIe] = useState('');
    const [saIeIndicator, setSaIeIndicator] = useState('9');
    const [saStreet, setSaStreet] = useState('');
    const [saNumber, setSaNumber] = useState('');
    const [saComplement, setSaComplement] = useState('');
    const [saNeighborhood, setSaNeighborhood] = useState('');
    const [saCityCode, setSaCityCode] = useState('4305108');
    const [saCity, setSaCity] = useState('');
    const [saState, setSaState] = useState('RS');
    const [saZipCode, setSaZipCode] = useState('');
    const [saIndFinal, setSaIndFinal] = useState('1');
    const [saIndPres, setSaIndPres] = useState('9');
    const [saTpImp, setSaTpImp] = useState('1');
    const [saNotes, setSaNotes] = useState('');
    const [saItems, setSaItems] = useState([
        { productId: '', quantity: '1', unitValue: '0.00' }
    ]);

    const loadDocuments = async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (statusFilter !== 'ALL') params.append('status', statusFilter);
            if (typeFilter !== 'ALL') params.append('type', typeFilter);

            const res = await customInstance({
                url: `/api/fiscal/documents?${params.toString()}`,
                method: 'GET'
            });

            const data = res?.data || res;
            setDocuments(data?.items || []);
            setTotalCount(data?.totalCount || 0);
        } catch {
            toast.error('Erro ao carregar documentos fiscais.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadDocuments();
    }, [statusFilter, typeFilter]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        loadDocuments();
    };

    const handleDownloadPdf = async (docId, accessKey) => {
        try {
            setDownloadingDocId(docId);
            const response = await customInstance({
                url: `/api/fiscal/nfe/${docId}/pdf`,
                method: 'GET',
                responseType: 'blob'
            });

            const blob = new Blob([response], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${accessKey || docId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Download do PDF concluído!');
        } catch {
            toast.error('Erro ao baixar PDF fiscal.');
        } finally {
            setDownloadingDocId(null);
        }
    };

    const handleDownloadXml = async (docId, accessKey) => {
        try {
            toast.success('Iniciando download do XML...');
            const response = await customInstance({
                url: `/api/fiscal/nfe/${docId}/xml`,
                method: 'GET',
                responseType: 'blob'
            });

            const blob = new Blob([response], { type: 'application/xml' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${accessKey || docId}.xml`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error('Erro ao baixar arquivo XML.');
        }
    };

    const handleDeletePendingDoc = async (doc) => {
        if (!confirm(`Deseja realmente excluir este documento fiscal pendente #${doc.id}?`)) return;
        try {
            await customInstance({
                url: `/api/fiscal/documents/${doc.id}`,
                method: 'DELETE'
            });
            toast.success('Nota fiscal pendente removida com sucesso!');
            loadDocuments();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir documento pendente.');
        }
    };

    // Abre o modal de emissão avulsa
    const handleOpenStandaloneModal = async () => {
        try {
            const [rulesRes, prodsRes] = await Promise.all([
                customInstance({ url: '/api/fiscal/rules', method: 'GET' }),
                customInstance({ url: '/api/products', method: 'GET' })
            ]);
            setFiscalRules(rulesRes?.data || rulesRes || []);
            setAvailableProducts(prodsRes?.data?.items || prodsRes?.data || prodsRes || []);

            setSaRuleId((rulesRes?.[0]?.id) || '');
            setSaItems([{ productId: '', quantity: '1', unitValue: '10.00' }]);
            setIsStandaloneModalOpen(true);
        } catch {
            toast.error('Erro ao carregar dados auxiliares para emissão avulsa.');
        }
    };

    const handleAddStandaloneItem = () => {
        setSaItems(prev => [...prev, { productId: '', quantity: '1', unitValue: '0.00' }]);
    };

    const handleRemoveStandaloneItem = (index) => {
        setSaItems(prev => prev.filter((_, idx) => idx !== index));
    };

    const handleItemChange = (index, field, value) => {
        setSaItems(prev => {
            const copy = [...prev];
            copy[index] = { ...copy[index], [field]: value };
            return copy;
        });
    };

    const handleSaveStandaloneNfe = async (e) => {
        e.preventDefault();

        if (!saRuleId) {
            toast.error('Selecione uma Natureza de Operação.');
            return;
        }

        const validItems = saItems.filter(i => i.productId && Number(i.quantity) > 0);
        if (validItems.length === 0) {
            toast.error('Adicione ao menos um produto válido com quantidade maior que zero.');
            return;
        }

        try {
            setIsSubmittingStandalone(true);
            const payload = {
                fiscalRuleId: saRuleId,
                destinationName: saName,
                destinationCnpjCpf: saCnpjCpf,
                destinationStateRegistration: saIe,
                destinationIeIndicator: Number(saIeIndicator),
                destinationStreet: saStreet,
                destinationNumber: saNumber,
                destinationComplement: saComplement,
                destinationNeighborhood: saNeighborhood,
                destinationCityCode: Number(saCityCode),
                destinationCity: saCity,
                destinationState: saState,
                destinationZipCode: saZipCode,
                indFinal: Number(saIndFinal),
                indPres: Number(saIndPres),
                tpImp: Number(saTpImp),
                additionalNotes: saNotes,
                items: validItems.map(i => ({
                    productId: i.productId,
                    quantity: Number(i.quantity),
                    unitValue: Number(i.unitValue)
                }))
            };

            const res = await customInstance({
                url: '/api/fiscal/documents/standalone/emit',
                method: 'POST',
                data: payload
            });

            const data = res?.data || res;
            toast.success(data?.message || 'NF-e Avulsa Autorizada com Sucesso!');
            setIsStandaloneModalOpen(false);
            loadDocuments();
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Erro ao emitir NF-e avulsa.');
        } finally {
            setIsSubmittingStandalone(false);
        }
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documentos Fiscais & Histórico SEFAZ</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gerencie todas as notas fiscais emitidas, eventos vinculados (CC-e e Cancelamento) e emissões avulsas.
                    </p>
                </div>
                <Button onClick={handleOpenStandaloneModal} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9">
                    <Plus className="mr-1.5 h-4 w-4" /> Nova NF-e Avulsa
                </Button>
            </div>

            {/* BARRA DE FILTROS */}
            <Card className="border-slate-200/80 bg-white shadow-xs">
                <CardContent className="p-4">
                    <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar por chave de acesso, protocolo, número de pedido ou motivo SEFAZ..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 bg-white text-xs h-9"
                            />
                        </div>

                        <div className="w-full md:w-44">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="bg-white text-xs h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os Status</SelectItem>
                                    <SelectItem value="Authorized">Autorizadas</SelectItem>
                                    <SelectItem value="Rejected">Rejeitadas</SelectItem>
                                    <SelectItem value="Canceled">Canceladas</SelectItem>
                                    <SelectItem value="Pending">Pendentes</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="w-full md:w-48">
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="bg-white text-xs h-9"><SelectValue placeholder="Finalidade" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todas as Finalidades</SelectItem>
                                    <SelectItem value="1">1 - NF-e Normal</SelectItem>
                                    <SelectItem value="2">2 - Complementar</SelectItem>
                                    <SelectItem value="3">3 - Ajuste</SelectItem>
                                    <SelectItem value="4">4 - Devolução / Retorno</SelectItem>
                                    <SelectItem value="5">5 - Nota de Crédito (RT)</SelectItem>
                                    <SelectItem value="6">6 - Nota de Débito (RT)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button type="submit" variant="secondary" className="h-9 text-xs px-4">
                            Filtrar
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* TABELA DE DOCUMENTOS */}
            <Card className="border-slate-200/80 bg-white shadow-xs">
                <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                        <FileCode size={16} className="text-orange-600" /> Notas Fiscais Registradas na Empresa
                    </CardTitle>
                    <Badge variant="secondary" className="font-mono">{totalCount} Registro(s)</Badge>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead>Data Emissão</TableHead>
                                <TableHead>Finalidade</TableHead>
                                <TableHead>Destinatário / UF</TableHead>
                                <TableHead>Origem / Pedido</TableHead>
                                <TableHead>Chave de Acesso</TableHead>
                                <TableHead className="text-right">Valor Total</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-center">Eventos</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-32 text-center">
                                        <div className="flex justify-center items-center gap-2 text-slate-500 text-xs">
                                            <Loader2 className="animate-spin h-4 w-4 text-orange-600" /> Carregando documentos fiscais...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : documents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-28 text-center text-slate-400 italic">
                                        Nenhum documento fiscal encontrado com os filtros aplicados.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                documents.map(doc => {
                                    const isAuthorized = doc.status === 'Authorized' || doc.status === '2';
                                    const isPending = doc.status === 'Pending' || doc.status === '1';
                                    const isCanceled = doc.status === 'Canceled' || doc.status === '4';
                                    const eventsCount = doc.linkedEvents?.length || 0;

                                    return (
                                        <TableRow key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                                            <TableCell className="text-xs font-mono">
                                                {new Date(doc.createdAt).toLocaleString('pt-BR')}
                                            </TableCell>
                                            <TableCell className="text-xs font-semibold text-slate-800">
                                                {doc.typeDescription}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                <span className="font-semibold text-slate-900 block truncate max-w-[170px]" title={doc.recipientName}>
                                                    {doc.recipientName}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-mono">UF: {doc.recipientUf}</span>
                                            </TableCell>
                                            <TableCell className="text-xs font-mono">
                                                {doc.outboundOrderNumber ? (
                                                    <Badge variant="outline" className="text-[10px] border-slate-300">
                                                        Pedido #{doc.outboundOrderNumber}
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-purple-100 text-purple-800 text-[10px] border-purple-200">
                                                        Avulsa
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs font-semibold text-slate-900">
                                                {doc.accessKey ? `${doc.accessKey.substring(0, 8)}...${doc.accessKey.substring(36)}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs font-bold text-slate-900">
                                                {doc.totalValue > 0 ? doc.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="space-y-0.5">
                                                    <Badge className={
                                                        isAuthorized ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                                            doc.status === 'Rejected' || doc.status === '3' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                                                                isCanceled ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                                                    'bg-amber-100 text-amber-800 border-amber-200'
                                                    }>
                                                        {isAuthorized ? 'Autorizada' :
                                                            doc.status === 'Rejected' || doc.status === '3' ? 'Rejeitada' :
                                                                isCanceled ? 'Cancelada' : 'Pendente'}
                                                    </Badge>
                                                    {doc.returnMessage && (
                                                        <span className="block text-[10px] text-slate-500 font-mono max-w-[140px] truncate mx-auto" title={doc.returnMessage}>
                                                            {doc.returnMessage}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {eventsCount > 0 ? (
                                                    <Badge variant="secondary" className="cursor-pointer font-mono text-[10px]" onClick={() => { setSelectedDocForDetails(doc); setIsDetailsModalOpen(true); }}>
                                                        {eventsCount} evento(s)
                                                    </Badge>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400 font-mono">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    {/* VER DETALHES */}
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => { setSelectedDocForDetails(doc); setIsDetailsModalOpen(true); }}
                                                        className="h-8 w-8 p-0"
                                                        title="Ver Detalhes e Histórico"
                                                    >
                                                        <Eye size={14} className="text-slate-600" />
                                                    </Button>

                                                    {/* SE AUTORIZADA -> DOWNLOADS E EVENTOS */}
                                                    {isAuthorized && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleDownloadXml(doc.id, doc.accessKey)}
                                                                className="h-8 text-xs bg-white text-blue-700 border-blue-200 hover:bg-blue-50 font-medium px-2"
                                                                title="Baixar XML"
                                                            >
                                                                <FileCode size={13} className="mr-1 text-blue-600" /> XML
                                                            </Button>

                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleDownloadPdf(doc.id, doc.accessKey)}
                                                                disabled={downloadingDocId === doc.id}
                                                                className="h-8 text-xs bg-white text-orange-700 border-orange-200 hover:bg-orange-50 font-medium px-2"
                                                                title="Baixar DANFE em PDF"
                                                            >
                                                                {downloadingDocId === doc.id ? (
                                                                    <Loader2 size={13} className="animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <Download size={13} className="mr-1" /> DANFE
                                                                    </>
                                                                )}
                                                            </Button>

                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => { setSelectedDocForCorrection(doc); setIsCorrectionModalOpen(true); }}
                                                                className="h-8 text-xs bg-white text-purple-700 border-purple-200 hover:bg-purple-50 font-medium px-2"
                                                                title="Emitir Carta de Correção (CC-e)"
                                                            >
                                                                <FileSignature size={13} className="text-purple-600" />
                                                            </Button>

                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => { setSelectedDocForCancel(doc); setIsCancelModalOpen(true); }}
                                                                className="h-8 text-xs bg-white text-rose-700 border-rose-200 hover:bg-rose-50 font-medium px-2"
                                                                title="Cancelar NF-e na SEFAZ"
                                                            >
                                                                <Ban size={13} className="text-rose-600" />
                                                            </Button>
                                                        </>
                                                    )}

                                                    {/* SE PENDENTE -> PERMITE EXCLUIR PARA GERAR NOVA */}
                                                    {isPending && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleDeletePendingDoc(doc)}
                                                            className="h-8 text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 font-medium px-2"
                                                            title="Excluir nota pendente para liberar nova emissão"
                                                        >
                                                            <Trash2 size={13} className="mr-1 text-rose-600" /> Excluir
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* MODAL DETALHES & HISTÓRICO DE EVENTOS */}
            <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
                <DialogContent className="sm:max-w-2xl bg-white max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
                            <FileCode className="text-orange-600" size={20} />
                            Detalhes do Documento Fiscal #{selectedDocForDetails?.accessKey ? selectedDocForDetails.accessKey.substring(25, 34) : selectedDocForDetails?.id}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Protocolos SEFAZ, chave de acesso e histórico de eventos vinculados (CC-e / Cancelamento).
                        </DialogDescription>
                    </DialogHeader>

                    {selectedDocForDetails && (
                        <div className="space-y-4 py-2 text-xs">
                            <div className="p-3 bg-slate-50 border rounded-xl space-y-2 font-mono">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <span className="text-[10px] text-slate-400 block uppercase">Chave de Acesso</span>
                                        <span className="font-bold text-slate-800 break-all text-[11px]">{selectedDocForDetails.accessKey || '-'}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 block uppercase">Protocolo SEFAZ</span>
                                        <span className="font-bold text-slate-800 text-[11px]">{selectedDocForDetails.protocol || '-'}</span>
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-slate-200 grid grid-cols-3 gap-2">
                                    <div>
                                        <span className="text-[10px] text-slate-400 block uppercase">Finalidade</span>
                                        <span className="font-semibold text-slate-700">{selectedDocForDetails.typeDescription}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 block uppercase">Status</span>
                                        <span className="font-semibold text-slate-700">{selectedDocForDetails.status}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 block uppercase">Origem</span>
                                        <span className="font-semibold text-slate-700">{selectedDocForDetails.outboundOrderNumber ? `Pedido #${selectedDocForDetails.outboundOrderNumber}` : 'Emissão Avulsa'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* TABELA DE EVENTOS VINCULADOS */}
                            <div className="space-y-2">
                                <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block">
                                    Eventos Fiscais Registrados na SEFAZ ({selectedDocForDetails.linkedEvents?.length || 0})
                                </span>

                                {!selectedDocForDetails.linkedEvents || selectedDocForDetails.linkedEvents.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border text-center">
                                        Nenhum evento (Cancelamento ou Carta de Correção) foi emitido para esta NF-e até o momento.
                                    </p>
                                ) : (
                                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                                        <Table>
                                            <TableHeader className="bg-slate-50">
                                                <TableRow>
                                                    <TableHead>Data</TableHead>
                                                    <TableHead>Evento</TableHead>
                                                    <TableHead>Protocolo</TableHead>
                                                    <TableHead className="text-right">Download</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {selectedDocForDetails.linkedEvents.map(evt => (
                                                    <TableRow key={evt.id} className="text-xs font-mono">
                                                        <TableCell>{new Date(evt.createdAt).toLocaleString('pt-BR')}</TableCell>
                                                        <TableCell className="font-bold text-slate-800">{evt.typeDescription}</TableCell>
                                                        <TableCell>{evt.protocol || '-'}</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-1">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleDownloadXml(evt.id, selectedDocForDetails.accessKey)}
                                                                    className="h-7 text-[11px] px-2"
                                                                >
                                                                    XML
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleDownloadPdf(evt.id, selectedDocForDetails.accessKey)}
                                                                    className="h-7 text-[11px] px-2"
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
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDetailsModalOpen(false)}>Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* MODAL EMISSÃO NOTA AVULSA */}
            <Dialog open={isStandaloneModalOpen} onOpenChange={setIsStandaloneModalOpen}>
                <DialogContent className="sm:max-w-3xl bg-white max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
                            <Plus className="text-orange-600" size={20} /> Emissão de Nota Fiscal Avulsa (Sem Pedido)
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Preencha os dados do destinatário e adicione produtos para gerar uma NF-e independente.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveStandaloneNfe} className="space-y-4 py-2 text-xs">
                        {/* NATUREZA DA OPERAÇÃO */}
                        <div className="space-y-1">
                            <Label className="font-semibold text-slate-800">Natureza de Operação (Regra Fiscal) *</Label>
                            <Select value={saRuleId} onValueChange={setSaRuleId}>
                                <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione a Natureza" /></SelectTrigger>
                                <SelectContent>
                                    {fiscalRules.map(r => (
                                        <SelectItem key={r.id} value={r.id}>
                                            {r.description} (CFOP {r.cfopStateInternal} / {r.cfopInterstate})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* DADOS DO DESTINATÁRIO */}
                        <div className="p-3 bg-slate-50 border rounded-xl space-y-3">
                            <span className="font-bold text-slate-800 uppercase text-[10px] block">Destinatário & Entrega</span>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1 md:col-span-2">
                                    <Label>Razão Social / Nome *</Label>
                                    <Input value={saName} onChange={e => setSaName(e.target.value)} required placeholder="Nome do Destinatário" />
                                </div>
                                <div className="space-y-1">
                                    <Label>CNPJ / CPF *</Label>
                                    <Input value={saCnpjCpf} onChange={e => setSaCnpjCpf(e.target.value)} required placeholder="Apenas números" className="font-mono" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="space-y-1">
                                    <Label>Indicador IE</Label>
                                    <Select value={saIeIndicator} onValueChange={setSaIeIndicator}>
                                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">1 - Contribuinte</SelectItem>
                                            <SelectItem value="2">2 - Isento</SelectItem>
                                            <SelectItem value="9">9 - Não Contribuinte</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label>Inscrição Estadual</Label>
                                    <Input value={saIe} onChange={e => setSaIe(e.target.value)} placeholder="ISENTO" className="font-mono" />
                                </div>
                                <div className="space-y-1">
                                    <Label>UF Destino *</Label>
                                    <Select value={saState} onValueChange={setSaState}>
                                        <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label>Município *</Label>
                                    <Input value={saCity} onChange={e => setSaCity(e.target.value)} required placeholder="Nome da Cidade" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1 md:col-span-2">
                                    <Label>Logradouro & Número *</Label>
                                    <div className="flex gap-2">
                                        <Input value={saStreet} onChange={e => setSaStreet(e.target.value)} required placeholder="Rua / Av" className="flex-1" />
                                        <Input value={saNumber} onChange={e => setSaNumber(e.target.value)} required placeholder="Nº" className="w-20" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label>Bairro *</Label>
                                    <Input value={saNeighborhood} onChange={e => setSaNeighborhood(e.target.value)} required placeholder="Bairro" />
                                </div>
                            </div>
                        </div>

                        {/* PRODUTOS / ITENS DA NOTA */}
                        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-800 uppercase text-[10px] block">Itens da Nota Fiscal</span>
                                <Button type="button" size="sm" variant="outline" onClick={handleAddStandaloneItem} className="h-7 text-[11px]">
                                    <Plus size={12} className="mr-1" /> Adicionar Produto
                                </Button>
                            </div>

                            <div className="space-y-2">
                                {saItems.map((item, idx) => (
                                    <div key={idx} className="flex gap-2 items-end p-2 bg-slate-50 rounded-lg border">
                                        <div className="flex-1 space-y-1">
                                            <Label className="text-[10px]">Produto / SKU *</Label>
                                            <Select value={item.productId} onValueChange={(val) => handleItemChange(idx, 'productId', val)}>
                                                <SelectTrigger className="bg-white h-8 text-xs"><SelectValue placeholder="Selecione o Produto" /></SelectTrigger>
                                                <SelectContent>
                                                    {availableProducts.map(p => (
                                                        <SelectItem key={p.id} value={p.id}>{p.sku} - {p.description}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="w-24 space-y-1">
                                            <Label className="text-[10px]">Qtd *</Label>
                                            <Input
                                                type="number"
                                                step="0.001"
                                                value={item.quantity}
                                                onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                                className="h-8 font-mono bg-white"
                                            />
                                        </div>

                                        <div className="w-28 space-y-1">
                                            <Label className="text-[10px]">Unitário (R$) *</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={item.unitValue}
                                                onChange={(e) => handleItemChange(idx, 'unitValue', e.target.value)}
                                                className="h-8 font-mono bg-white"
                                            />
                                        </div>

                                        {saItems.length > 1 && (
                                            <Button type="button" size="sm" variant="ghost" onClick={() => handleRemoveStandaloneItem(idx)} className="h-8 w-8 p-0 text-rose-600">
                                                <Trash2 size={13} />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label>Observações Fiscais (infCpl)</Label>
                            <Input value={saNotes} onChange={e => setSaNotes(e.target.value)} placeholder="Informações complementares de interesse do contribuinte..." className="font-mono text-xs" />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsStandaloneModalOpen(false)} disabled={isSubmittingStandalone}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmittingStandalone} className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
                                {isSubmittingStandalone ? (
                                    <>
                                        <Loader2 className="animate-spin mr-1.5 h-4 w-4" /> Transmitindo à SEFAZ...
                                    </>
                                ) : (
                                    'Assinar & Transmitir NF-e Avulsa'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAIS DE EVENTOS */}
            <CancelNfeModal
                open={isCancelModalOpen}
                onOpenChange={setIsCancelModalOpen}
                orderId={selectedDocForCancel?.outboundOrderId || selectedDocForCancel?.id}
                orderNumber={selectedDocForCancel?.outboundOrderNumber || 'Avulsa'}
                accessKey={selectedDocForCancel?.accessKey}
                onSuccess={loadDocuments}
            />

            <CorrectionLetterModal
                open={isCorrectionModalOpen}
                onOpenChange={setIsCorrectionModalOpen}
                orderId={selectedDocForCorrection?.outboundOrderId || selectedDocForCorrection?.id}
                orderNumber={selectedDocForCorrection?.outboundOrderNumber || 'Avulsa'}
                accessKey={selectedDocForCorrection?.accessKey}
                onSuccess={loadDocuments}
            />
        </div>
    );
}