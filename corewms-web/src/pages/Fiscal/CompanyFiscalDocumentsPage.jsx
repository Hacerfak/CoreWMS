import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
    Search, Plus, FileCode, Download, Ban, FileSignature, Trash2, Eye, Loader2, Settings, ChevronLeft, ChevronRight, Mail
} from 'lucide-react';
import { toast } from 'sonner';
import CancelNfeModal from '@/pages/Fiscal/CancelNfeModal';
import CorrectionLetterModal from '@/pages/Fiscal/CorrectionLetterModal';
import SendNfeEmailModal from '@/pages/Fiscal/SendNfeEmailModal';

export default function CompanyFiscalDocumentsPage() {
    const navigate = useNavigate();

    const [documents, setDocuments] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Paginação
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Filtros
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');

    // Downloads
    const [downloadingDocId, setDownloadingDocId] = useState(null);

    // Modais Fiscais (Eventos SEFAZ e E-mail)
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [selectedDocForCancel, setSelectedDocForCancel] = useState(null);

    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
    const [selectedDocForCorrection, setSelectedDocForCorrection] = useState(null);

    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [selectedDocForEmail, setSelectedDocForEmail] = useState(null);

    // Estado do AlertDialog de Exclusão (shadcn/ui)
    const [docToDelete, setDocToDelete] = useState(null);
    const [isDeletingDoc, setIsDeletingDoc] = useState(false);

    const loadDocuments = async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (statusFilter !== 'ALL') params.append('status', statusFilter);
            if (typeFilter !== 'ALL') params.append('type', typeFilter);
            params.append('page', page);
            params.append('pageSize', pageSize);

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
    }, [page, pageSize, statusFilter, typeFilter]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setPage(1);
        loadDocuments();
    };

    const handleDownloadPdf = async (docId) => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <div style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; color: #475569; font-size: 14px;">
                    Carregando DANFE oficial...
                </div>
            `);
        }

        try {
            const html = await customInstance({
                url: `/api/fiscal/nfe/${docId}/danfe-html`,
                method: 'GET',
                responseType: 'text'
            });

            if (printWindow) {
                printWindow.document.open();
                printWindow.document.write(html);
                printWindow.document.close();
            }
        } catch (error) {
            if (printWindow) printWindow.close();
            toast.error('Erro ao carregar visualização da DANFE.');
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

    const handleConfirmDeleteDoc = async () => {
        if (!docToDelete) return;
        try {
            setIsDeletingDoc(true);
            await customInstance({
                url: `/api/fiscal/documents/${docToDelete.id}`,
                method: 'DELETE'
            });
            toast.success('Documento fiscal excluído com sucesso!');
            setDocToDelete(null);
            loadDocuments();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir documento fiscal.');
        } finally {
            setIsDeletingDoc(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return (
        <div className="flex flex-col h-full space-y-4 animate-in fade-in duration-300 min-h-0">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documentos Fiscais & Histórico SEFAZ</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Gerencie todas as notas fiscais emitidas, eventos vinculados (CC-e e Cancelamento) e emissões avulsas.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => navigate('/fiscal/regras')}
                        className="bg-white text-slate-700 border-slate-300 hover:bg-slate-50 font-semibold h-9"
                    >
                        <Settings className="mr-1.5 h-4 w-4 text-slate-500" /> Gerenciar Regras Fiscais
                    </Button>

                    <Button onClick={() => navigate('/fiscal/documentos/novo')} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9">
                        <Plus className="mr-1.5 h-4 w-4" /> Nova NF-e Avulsa
                    </Button>
                </div>
            </div>

            {/* BARRA DE FILTROS */}
            <Card className="border-slate-200/80 bg-white shadow-xs shrink-0">
                <CardContent className="p-3.5">
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
                            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
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
                            <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val); setPage(1); }}>
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

            {/* TABELA DE DOCUMENTOS OCUPANDO O RESTANTE TOTAL DA TELA */}
            <Card className="border-slate-200/80 bg-white shadow-xs overflow-hidden flex-1 flex flex-col min-h-0">
                <CardHeader className="p-3.5 border-b bg-slate-50/50 flex flex-row items-center justify-between shrink-0">
                    <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                        <FileCode size={16} className="text-orange-600" /> Notas Fiscais Registradas na Empresa
                    </CardTitle>
                    <Badge variant="secondary" className="font-mono">{totalCount} Registro(s)</Badge>
                </CardHeader>

                <CardContent className="p-0 flex-1 overflow-auto min-h-0 relative">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-xs">
                            <TableRow>
                                <TableHead className="bg-slate-50">Data Emissão</TableHead>
                                <TableHead className="bg-slate-50">Finalidade</TableHead>
                                <TableHead className="bg-slate-50">Destinatário / UF</TableHead>
                                <TableHead className="bg-slate-50">Origem / Pedido</TableHead>
                                <TableHead className="bg-slate-50">Chave de Acesso</TableHead>
                                <TableHead className="text-right bg-slate-50">Valor Total</TableHead>
                                <TableHead className="text-center bg-slate-50">Status</TableHead>
                                <TableHead className="text-center bg-slate-50">Eventos</TableHead>
                                <TableHead className="text-right bg-slate-50">Ações</TableHead>
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
                                    const statusStr = String(doc.status || '').toLowerCase();
                                    const isAuthorized = statusStr === 'authorized' || statusStr === '2';
                                    const isPendingOrRejected = statusStr === 'pending' || statusStr === '1' || statusStr === 'rejected' || statusStr === '3';
                                    const isCanceled = statusStr === 'canceled' || statusStr === '4';
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
                                                            statusStr === 'rejected' || statusStr === '3' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                                                                isCanceled ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                                                    'bg-amber-100 text-amber-800 border-amber-200'
                                                    }>
                                                        {isAuthorized ? 'Autorizada' :
                                                            statusStr === 'rejected' || statusStr === '3' ? 'Rejeitada' :
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
                                                    <Badge
                                                        variant="secondary"
                                                        className="cursor-pointer font-mono text-[10px] hover:bg-slate-200"
                                                        onClick={() => navigate(`/fiscal/documentos/${doc.id}`)}
                                                    >
                                                        {eventsCount} evento(s)
                                                    </Badge>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400 font-mono">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => navigate(`/fiscal/documentos/${doc.id}`)}
                                                        className="h-8 w-8 p-0"
                                                        title="Ver Detalhes da NF-e"
                                                    >
                                                        <Eye size={14} className="text-slate-600" />
                                                    </Button>

                                                    {(isAuthorized || isPendingOrRejected) && doc.accessKey && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleDownloadXml(doc.id, doc.accessKey)}
                                                            className="h-8 text-xs bg-white text-blue-700 border-blue-200 hover:bg-blue-50 font-medium px-2"
                                                            title="Baixar XML"
                                                        >
                                                            <FileCode size={13} className="mr-1 text-blue-600" /> XML
                                                        </Button>
                                                    )}

                                                    {isAuthorized && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleDownloadPdf(doc.id)}
                                                                disabled={downloadingDocId === doc.id}
                                                                className="h-8 text-xs bg-white text-orange-700 border-orange-200 hover:bg-orange-50 font-medium px-2"
                                                                title="Visualizar / Imprimir DANFE"
                                                            >
                                                                {downloadingDocId === doc.id ? (
                                                                    <Loader2 size={13} className="animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <Download size={13} className="mr-1" /> DANFE
                                                                    </>
                                                                )}
                                                            </Button>

                                                            {/* AÇÃO MANUAL DE DISPARO DE E-MAIL */}
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => { setSelectedDocForEmail(doc); setIsEmailModalOpen(true); }}
                                                                className="h-8 text-xs bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-medium px-2"
                                                                title="Enviar NF-e por E-mail (XML e DANFE)"
                                                            >
                                                                <Mail size={13} className="text-emerald-600" />
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

                                                    {isPendingOrRejected && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => setDocToDelete(doc)}
                                                            className="h-8 text-xs bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 font-medium px-2"
                                                            title="Excluir nota pendente/rejeitada"
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

                {/* CONTROLE COMPLETO DE PAGINAÇÃO FIXO NO RODAPÉ */}
                <div className="p-3.5 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 shrink-0">
                    <div className="flex items-center gap-2">
                        <span>
                            Exibindo <strong>{totalCount === 0 ? 0 : (page - 1) * pageSize + 1}</strong> a <strong>{Math.min(page * pageSize, totalCount)}</strong> de <strong>{totalCount}</strong> documentos fiscais
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 mr-3">
                            <span>Linhas por página:</span>
                            <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setPage(1); }}>
                                <SelectTrigger className="h-8 w-16 bg-white text-xs font-mono"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1 || isLoading}
                            className="h-8 text-xs bg-white"
                        >
                            <ChevronLeft size={14} className="mr-1" /> Anterior
                        </Button>

                        <span className="font-mono px-2 text-slate-700 font-semibold">
                            {page} / {totalPages}
                        </span>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages || isLoading}
                            className="h-8 text-xs bg-white"
                        >
                            Próximo <ChevronRight size={14} className="ml-1" />
                        </Button>
                    </div>
                </div>
            </Card>

            {/* MODAL DISPARO MANUAL DE E-MAIL */}
            <SendNfeEmailModal
                open={isEmailModalOpen}
                onOpenChange={setIsEmailModalOpen}
                document={selectedDocForEmail}
                defaultEmail={selectedDocForEmail?.customerEmail || selectedDocForEmail?.recipientEmail || ''}
            />

            {/* MODAL CANCELAMENTO */}
            <CancelNfeModal
                open={isCancelModalOpen}
                onOpenChange={setIsCancelModalOpen}
                orderId={selectedDocForCancel?.outboundOrderId}
                documentId={selectedDocForCancel?.id}
                orderNumber={selectedDocForCancel?.outboundOrderNumber || 'Avulsa'}
                accessKey={selectedDocForCancel?.accessKey}
                onSuccess={loadDocuments}
            />

            {/* MODAL CARTA DE CORREÇÃO (CC-e) */}
            <CorrectionLetterModal
                open={isCorrectionModalOpen}
                onOpenChange={setIsCorrectionModalOpen}
                orderId={selectedDocForCorrection?.outboundOrderId}
                documentId={selectedDocForCorrection?.id}
                orderNumber={selectedDocForCorrection?.outboundOrderNumber || 'Avulsa'}
                accessKey={selectedDocForCorrection?.accessKey}
                onSuccess={loadDocuments}
            />

            {/* ALERTA DE EXCLUSÃO DE DOCUMENTO FISCAL (SHADCN/UI) */}
            <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
                            <Trash2 className="h-5 w-5" /> Excluir Documento Fiscal?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-600">
                            Tem certeza de que deseja remover o documento fiscal{' '}
                            <strong className="text-slate-900 font-mono">
                                {docToDelete?.accessKey
                                    ? `${docToDelete.accessKey.substring(0, 8)}...${docToDelete.accessKey.substring(36)}`
                                    : `#${docToDelete?.id}`}
                            </strong>?
                            <br /><br />
                            Esta ação removerá a nota rejeitada/pendente e permitirá gerar uma nova NF-e sem bloqueios de notas ativas.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeletingDoc}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDeleteDoc}
                            disabled={isDeletingDoc}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                            {isDeletingDoc ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                            Confirmar Exclusão
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}