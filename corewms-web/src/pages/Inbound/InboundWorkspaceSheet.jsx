import { useHasPermission } from '@/hooks/useHasPermission';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, ArrowRightCircle, AlertTriangle, MapPin, ScanBarcode, Box, XCircle, Settings2 } from 'lucide-react';

export default function InboundWorkspaceSheet({ open, onOpenChange, order }) {
    // RBAC: Verificação granular de permissões
    const canUploadXml = useHasPermission('inbound:upload_xml');
    const canReviewProducts = useHasPermission('inbound:review_products');
    const canAssignDock = useHasPermission('inbound:assign_dock');
    const canExecuteChecking = useHasPermission('inbound:execute_checking');
    const canManageDivergences = useHasPermission('inbound:manage_divergences');
    const canViewFinancials = useHasPermission('inbound:view_financials');
    const canForceFinish = useHasPermission('inbound:force_finish');

    if (!order) return null;

    const renderProgressBar = () => {
        const steps = ['PendingReview', 'AwaitingDock', 'InConference', 'Finished'];
        const currentIdx = steps.indexOf(order.status);

        if (order.status === 'Canceled') {
            return <div className="p-3 bg-rose-50 text-rose-700 font-semibold rounded-lg text-center border border-rose-200">Ordem de Recebimento Cancelada</div>;
        }

        return (
            <div className="flex items-center justify-between w-full relative pt-2">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 -z-10 rounded-full"></div>
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-500 -z-10 transition-all duration-500 rounded-full" style={{ width: `${(currentIdx / 3) * 100}%` }}></div>

                {['Revisão XML', 'Doca/Espera', 'Conferência', 'Finalizado'].map((label, idx) => (
                    <div key={label} className="flex flex-col items-center gap-2 bg-white px-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${currentIdx >= idx ? 'bg-blue-600 text-white ring-4 ring-blue-50' : 'bg-slate-200 text-slate-500'}`}>
                            {idx + 1}
                        </div>
                        <span className={`text-[10px] uppercase font-bold tracking-tight ${currentIdx >= idx ? 'text-blue-900' : 'text-slate-400'}`}>{label}</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:w-[1000px] !max-w-[1000px] flex flex-col p-0 bg-slate-50/50 shadow-2xl">
                <SheetHeader className="p-6 border-b border-slate-200 bg-white">
                    <div className="flex items-start justify-between">
                        <div>
                            <SheetTitle className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                                Recebimento #{order.number}
                                <Badge variant="outline" className="bg-slate-100 font-mono text-slate-600">{order.accessKey}</Badge>
                            </SheetTitle>
                            <SheetDescription className="text-slate-500 mt-1 text-base">
                                Depositante: <strong className="text-slate-700">{order.issuerName}</strong>
                            </SheetDescription>
                        </div>
                        {/* Ações Rápidas do Cabeçalho (Gestão) */}
                        <div className="flex items-center gap-2">
                            {canForceFinish && order.status === 'InConference' && (
                                <Button variant="outline" size="sm" className="text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100">
                                    <Settings2 className="w-4 h-4 mr-2" /> Forçar Fechamento
                                </Button>
                            )}
                            {canUploadXml && order.status === 'PendingReview' && (
                                <Button variant="outline" size="sm" className="text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100 hover:text-rose-700">
                                    <XCircle className="w-4 h-4 mr-2" /> Estornar
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="mt-8 mb-2">
                        {renderProgressBar()}
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-6 flex gap-6">
                    {/* COLUNA ESQUERDA: Ações (Call to Action Baseado no Status e Permissão) */}
                    <div className="w-1/3 flex flex-col gap-4">

                        {/* Bloco: Malha Fina (Revisão) */}
                        {order.status === 'PendingReview' && (
                            <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm">
                                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-3"><AlertTriangle size={20} /></div>
                                <h3 className="font-bold text-slate-900 mb-1">Revisão Pendente</h3>
                                <p className="text-sm text-slate-500 mb-4">Alguns produtos do XML não estão amarrados ao catálogo do WMS.</p>
                                {canReviewProducts ? (
                                    <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white">Resolver Divergências</Button>
                                ) : (
                                    <p className="text-xs text-amber-600 font-semibold bg-amber-50 p-2 rounded">Aguardando ação do Backoffice/Gestor.</p>
                                )}
                            </div>
                        )}

                        {/* Bloco: Atribuição de Doca */}
                        {(order.status === 'AwaitingDock' || order.status === 'InConference') && (
                            <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-3"><MapPin size={20} /></div>
                                <h3 className="font-bold text-slate-900 mb-1">Direcionamento</h3>
                                <p className="text-sm text-slate-500 mb-4">A mercadoria precisa ser descarregada em uma doca física.</p>
                                {canAssignDock ? (
                                    <Button variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50">Definir Doca</Button>
                                ) : (
                                    <p className="text-xs text-blue-600 font-semibold bg-blue-50 p-2 rounded">Doca D-01 Atribuída.</p>
                                )}
                            </div>
                        )}

                        {/* Bloco: Execução (Chão de Fábrica) */}
                        {(order.status === 'AwaitingDock' || order.status === 'InConference') && (
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
                                <ScanBarcode className="absolute -right-4 -bottom-4 w-32 h-32 text-slate-800 opacity-50" />
                                <div className="relative z-10">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3"><ScanBarcode size={20} /></div>
                                    <h3 className="font-bold text-white mb-1">Coletor RF</h3>
                                    <p className="text-sm text-slate-400 mb-4">Iniciar a bipagem cega de HUs e mercadorias.</p>
                                    {canExecuteChecking ? (
                                        <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-0">Iniciar Conferência</Button>
                                    ) : (
                                        <p className="text-xs text-slate-400 font-medium">Você não possui perfil operacional.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* COLUNA DIREITA: Dados do XML e Histórico */}
                    <div className="w-2/3 bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden">
                        <Tabs defaultValue="items" className="flex-1 flex flex-col min-h-0">
                            <div className="border-b border-slate-100">
                                <TabsList className="bg-transparent h-12 gap-4 px-4 w-full justify-start rounded-none">
                                    <TabsTrigger value="items" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-2 h-full"><Box className="w-4 h-4 mr-2" /> Carga Prevista (XML)</TabsTrigger>
                                    {canManageDivergences && <TabsTrigger value="divergences" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-2 h-full"><AlertTriangle className="w-4 h-4 mr-2" /> Divergências</TabsTrigger>}
                                    {canViewFinancials && <TabsTrigger value="finance" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-2 h-full"><FileText className="w-4 h-4 mr-2" /> Dados Fiscais</TabsTrigger>}
                                </TabsList>
                            </div>

                            <TabsContent value="items" className="flex-1 overflow-auto p-0 m-0">
                                <div className="p-8 flex flex-col items-center justify-center text-slate-400 text-center h-full">
                                    <Box className="w-12 h-12 mb-3 opacity-20" />
                                    <p className="font-medium text-slate-600 mb-1">Listagem de Itens em Construção</p>
                                    <p className="text-sm">Aqui serão renderizados os itens extraídos da nota.<br />A "Quantidade Esperada" será ocultada caso a regra de Conferência Cega esteja ativa para seu perfil.</p>
                                </div>
                            </TabsContent>

                            <TabsContent value="divergences" className="flex-1 overflow-auto p-4 m-0">
                                <p className="text-sm text-slate-500">Painel de aprovação de sobras e faltas exclusivo para gestão.</p>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}