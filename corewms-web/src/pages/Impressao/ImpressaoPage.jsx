import { useState } from 'react';
import { useGetApiPrintingAgents, usePostApiPrintSendTest, useGetApiPrintingTemplates } from '@/api/generated/printing/printing';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Printer, Server, Tag, Loader2, KeyRound, Play, Edit, PenLine } from 'lucide-react';
import { toast } from 'sonner';

import AgenteFormModal from './AgenteFormModal';
import ImpressoraFormModal from './ImpressoraFormModal';
import TemplateFormModal from './TemplateFormModal';
import PrintTemplateModal from './PrintTemplateModal';

export default function ImpressaoPage() {
    // Estados - Agentes
    const [isAgenteModalOpen, setIsAgenteModalOpen] = useState(false);
    const [selectedAgentForEdit, setSelectedAgentForEdit] = useState(null);

    // Estados - Impressoras
    const [isImpressoraModalOpen, setIsImpressoraModalOpen] = useState(false);
    const [selectedAgentContext, setSelectedAgentContext] = useState({ id: '' });
    const [selectedPrinterForEdit, setSelectedPrinterForEdit] = useState(null);

    // Estados - Templates
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState(null);
    const [isPrintTemplateModalOpen, setIsPrintTemplateModalOpen] = useState(false);
    const [templateToPrint, setTemplateToPrint] = useState(null);

    const handleOpenPrintTemplate = (template) => {
        setTemplateToPrint(template);
        setIsPrintTemplateModalOpen(true);
    };

    // Dados da API
    const { data: agentes = [], isLoading: isLoadingAgentes } = useGetApiPrintingAgents();
    const { data: templates = [], isLoading: isLoadingTemplates } = useGetApiPrintingTemplates(); // <-- Mude para o hook correto do Orval se diferir

    const { mutate: testPrint, isPending: isTesting } = usePostApiPrintSendTest({
        mutation: {
            onSuccess: (data) => toast.success(`Comando enviado! Job ID: ${data.jobId}`),
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao enviar impressão.')
        }
    });

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Copiado para a área de transferência!');
    };

    // Ações de abertura de Modais
    const handleOpenAgenteModal = (agente = null) => {
        setSelectedAgentForEdit(agente);
        setIsAgenteModalOpen(true);
    };

    const handleOpenPrinterModal = (agentId, impressora = null) => {
        setSelectedAgentContext({ id: agentId });
        setSelectedPrinterForEdit(impressora);
        setIsImpressoraModalOpen(true);
    };

    const handleOpenTemplateModal = (template = null) => {
        setSelectedTemplateForEdit(template);
        setIsTemplateModalOpen(true);
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gestão de Impressão</h1>
                    <p className="text-sm text-slate-500 mt-1">Gerencie agentes de hardware, impressoras Zebra/Epson e templates ZPL.</p>
                </div>
            </div>

            <Tabs defaultValue="agentes" className="flex-1 flex flex-col min-h-0">
                <div className="bg-white border border-slate-200/60 rounded-xl p-1 w-fit shadow-sm">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="agentes" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none px-4">
                            <Server className="w-4 h-4 mr-2" /> Agentes e Impressoras
                        </TabsTrigger>
                        <TabsTrigger value="templates" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none px-4">
                            <Tag className="w-4 h-4 mr-2" /> Templates (ZPL)
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* ABA AGENTES */}
                <TabsContent value="agentes" className="flex-1 mt-4">
                    <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden h-full">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800">Estações (Print Agents)</h3>
                            <Button onClick={() => handleOpenAgenteModal()} className="bg-blue-600 hover:bg-blue-700 text-white h-8">
                                <Plus className="mr-2 h-4 w-4" /> Novo Agente
                            </Button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <Table>
                                <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead className="w-[250px]">Estação</TableHead>
                                        <TableHead>API Key</TableHead>
                                        <TableHead>Impressoras</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingAgentes ? (
                                        <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                                    ) : agentes.map((agente) => (
                                        <TableRow key={agente.id} className="hover:bg-slate-50/50">
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                                                        <Server size={16} className="text-slate-600" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-900">{agente.name}</span>
                                                        {agente.isOnline ? (
                                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 w-fit mt-1 text-[10px] px-1.5 py-0 flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Online
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 w-fit mt-1 text-[10px] px-1.5 py-0 flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Offline
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg w-fit cursor-pointer hover:bg-slate-100" onClick={() => copyToClipboard(agente.apiKey)}>
                                                    <KeyRound size={14} className="text-slate-400" />
                                                    <span className="font-mono text-xs text-slate-600 truncate max-w-[120px]">{agente.apiKey}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-2 items-center">
                                                    {agente.printers?.map(p => (
                                                        <div key={p.id} className="flex items-center bg-blue-50 border border-blue-200 rounded-full pl-2 pr-1 py-1 text-xs group">
                                                            <Printer className="w-3 h-3 text-blue-500 mr-1.5" />
                                                            <span className="font-medium text-blue-700 mr-2">{p.name}</span>

                                                            <button type="button" onClick={() => handleOpenPrinterModal(agente.id, p)} title="Editar Impressora" className="bg-blue-100 hover:bg-blue-600 text-blue-600 hover:text-white p-1 rounded-full transition-all mr-1">
                                                                <PenLine className="w-3 h-3" />
                                                            </button>
                                                            <button type="button" onClick={() => testPrint({ data: { stationName: agente.name, printerName: p.name, customZpl: "" } })} disabled={isTesting} title="Imprimir Teste" className="bg-blue-100 hover:bg-blue-600 text-blue-600 hover:text-white p-1 rounded-full transition-all disabled:opacity-50">
                                                                {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button variant="ghost" size="sm" onClick={() => handleOpenAgenteModal(agente)}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => handleOpenPrinterModal(agente.id)}>
                                                    <Plus className="h-4 w-4 mr-1" /> Impressora
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent>

                {/* ABA TEMPLATES */}
                <TabsContent value="templates" className="flex-1 mt-4">
                    <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden h-full">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800">Modelos ZPL</h3>
                            <Button onClick={() => handleOpenTemplateModal()} className="bg-blue-600 hover:bg-blue-700 text-white h-8">
                                <Plus className="mr-2 h-4 w-4" /> Novo Template
                            </Button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <Table>
                                <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Dimensões</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingTemplates ? (
                                        <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                                    ) : templates.map((tpl) => (
                                        <TableRow key={tpl.id}>
                                            <TableCell className="font-medium text-slate-900">{tpl.name}</TableCell>
                                            <TableCell className="text-slate-600">{tpl.widthMm}x{tpl.heightMm} mm</TableCell>
                                            <TableCell><Badge variant="outline" className="bg-emerald-50 text-emerald-700">Ativo</Badge></TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => handleOpenPrintTemplate(tpl)}>
                                                    <Play className="h-4 w-4 mr-1" /> Testar
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleOpenTemplateModal(tpl)}>
                                                    <Edit className="h-4 w-4" /> Editar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            <AgenteFormModal open={isAgenteModalOpen} onOpenChange={setIsAgenteModalOpen} agenteToEdit={selectedAgentForEdit} />
            <ImpressoraFormModal open={isImpressoraModalOpen} onOpenChange={setIsImpressoraModalOpen} agentId={selectedAgentContext.id} impressoraToEdit={selectedPrinterForEdit} />
            <TemplateFormModal open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen} templateToEdit={selectedTemplateForEdit} />
            <PrintTemplateModal
                open={isPrintTemplateModalOpen}
                onOpenChange={setIsPrintTemplateModalOpen}
                template={templateToPrint}
                agentes={agentes}
            />
        </div>
    );
}