import { useParams, useNavigate } from 'react-router-dom';
import { useGetApiInboundId } from '@/api/generated/inbound/inbound';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, AlertTriangle, MapPin, ScanBarcode, Box, XCircle, Settings2, ArrowLeft, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function InboundWorkspacePage() {
    const { id } = useParams();
    const navigate = useNavigate();

    // Busca os dados detalhados que acabamos de criar na API
    const { data: order, isLoading, isError } = useGetApiInboundId(id);

    // RBAC: Verificação granular de permissões
    const canReviewProducts = useHasPermission('inbound:review_products');
    const canAssignDock = useHasPermission('inbound:assign_dock');
    const canExecuteChecking = useHasPermission('inbound:execute_checking');
    const canManageDivergences = useHasPermission('inbound:manage_divergences');
    const canViewFinancials = useHasPermission('inbound:view_financials');
    const canForceFinish = useHasPermission('inbound:force_finish');
    const canViewExpectedQty = useHasPermission('inbound:view_expected_qty');

    if (isLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
    if (isError || !order) return <div className="flex h-full items-center justify-center text-rose-500">Erro ao carregar os dados deste recebimento.</div>;

    const renderProgressBar = () => {
        const steps = ['PendingReview', 'AwaitingDock', 'InConference', 'Finished'];
        const currentIdx = steps.indexOf(order.status);

        if (order.status === 'Canceled') return <div className="p-3 bg-rose-50 text-rose-700 font-semibold rounded-lg text-center border border-rose-200">Ordem de Recebimento Cancelada</div>;

        return (
            <div className="flex items-center justify-between w-full relative pt-2 px-10">
                <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-1 bg-slate-200 -z-10 rounded-full"></div>
                <div className="absolute left-10 top-1/2 -translate-y-1/2 h-1 bg-blue-500 -z-10 transition-all duration-500 rounded-full" style={{ width: `calc(${(currentIdx / 3) * 100}% - 40px)` }}></div>

                {['Revisão XML', 'Doca/Espera', 'Conferência', 'Finalizado'].map((label, idx) => (
                    <div key={label} className="flex flex-col items-center gap-2 bg-slate-50 px-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${currentIdx >= idx ? 'bg-blue-600 text-white ring-4 ring-blue-50' : 'bg-slate-200 text-slate-500'}`}>
                            {idx + 1}
                        </div>
                        <span className={`text-xs uppercase font-bold tracking-tight ${currentIdx >= idx ? 'text-blue-900' : 'text-slate-400'}`}>{label}</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/inbound')} className="text-slate-500 hover:text-slate-900">
                        <ArrowLeft size={20} />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                            Recebimento #{order.number}
                            <Badge variant="outline" className="bg-white font-mono text-slate-600 text-sm py-1">{order.accessKey}</Badge>
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">Depositante: <strong className="text-slate-700">{order.issuerName}</strong> ({order.issuerCnpj})</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {canForceFinish && order.status === 'InConference' && (
                        <Button variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100"><Settings2 className="w-4 h-4 mr-2" /> Forçar Fechamento</Button>
                    )}
                    {order.status === 'PendingReview' && (
                        <Button variant="outline" className="text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100 hover:text-rose-700"><XCircle className="w-4 h-4 mr-2" /> Estornar XML</Button>
                    )}
                </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl p-8 shadow-sm">
                {renderProgressBar()}
            </div>

            <div className="flex-1 flex gap-6 min-h-0">
                {/* COLUNA ESQUERDA: Ações (Call to Action Baseado no Status e Permissão) */}
                <div className="w-1/3 flex flex-col gap-4 overflow-y-auto">
                    {order.status === 'PendingReview' && (
                        <div className="bg-white border border-amber-200 rounded-xl p-6 shadow-sm">
                            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-4"><AlertTriangle size={24} /></div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">Revisão Pendente</h3>
                            <p className="text-sm text-slate-500 mb-6 leading-relaxed">O sistema detectou produtos no XML que não estão vinculados ao Catálogo WMS do cliente. É necessário mapeá-los para prosseguir.</p>
                            {canReviewProducts ? (
                                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white h-12 text-base">Revisar e Vincular Produtos</Button>
                            ) : (
                                <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-100">Aguardando ação do Backoffice/Gestor.</p>
                            )}
                        </div>
                    )}

                    {(order.status === 'AwaitingDock' || order.status === 'InConference') && (
                        <div className="bg-white border border-blue-200 rounded-xl p-6 shadow-sm">
                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-4"><MapPin size={24} /></div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">Direcionamento de Doca</h3>
                            <p className="text-sm text-slate-500 mb-6 leading-relaxed">O veículo aguarda direcionamento físico para descarregamento.</p>
                            {canAssignDock ? (
                                <Button variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50 h-12 text-base">Definir Doca Física</Button>
                            ) : (
                                <p className="text-sm text-blue-700 bg-blue-50 p-3 rounded-lg border border-blue-100">Doca atribuída pelo gestor.</p>
                            )}
                        </div>
                    )}

                    {(order.status === 'AwaitingDock' || order.status === 'InConference') && (
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg relative overflow-hidden">
                            <ScanBarcode className="absolute -right-6 -bottom-6 w-40 h-40 text-slate-800 opacity-50" />
                            <div className="relative z-10">
                                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4"><ScanBarcode size={24} /></div>
                                <h3 className="text-lg font-bold text-white mb-2">Coletor RF (Operação)</h3>
                                <p className="text-sm text-slate-400 mb-6 leading-relaxed">Abra o terminal de conferência cega para iniciar a bipagem física das HUs e produtos na doca.</p>
                                {canExecuteChecking ? (
                                    <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white border-0 h-12 text-base">Iniciar Conferência (Coletor)</Button>
                                ) : (
                                    <p className="text-sm text-slate-400 font-medium">Você não possui perfil operacional de conferência.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* COLUNA DIREITA: Tabela de Itens e Finanças */}
                <div className="w-2/3 bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden">
                    <Tabs defaultValue="items" className="flex-1 flex flex-col min-h-0">
                        <div className="border-b border-slate-100 bg-slate-50/50 px-4 pt-2">
                            <TabsList className="bg-transparent h-10 gap-6 w-full justify-start">
                                <TabsTrigger value="items" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-1 h-full"><Box className="w-4 h-4 mr-2" /> Itens da Nota (XML)</TabsTrigger>
                                {canManageDivergences && <TabsTrigger value="divergences" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-1 h-full"><AlertTriangle className="w-4 h-4 mr-2" /> Painel de Divergências</TabsTrigger>}
                                {canViewFinancials && <TabsTrigger value="finance" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-1 h-full"><FileText className="w-4 h-4 mr-2" /> Informações Fiscais</TabsTrigger>}
                            </TabsList>
                        </div>

                        <TabsContent value="items" className="flex-1 overflow-auto p-0 m-0">
                            <Table>
                                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead>Cód. Orig. / SKU</TableHead>
                                        <TableHead>Descrição (XML)</TableHead>
                                        <TableHead>UN</TableHead>
                                        <TableHead className="text-right">Qtd. XML</TableHead>
                                        <TableHead className="text-right">Qtd. Conferida</TableHead>
                                        <TableHead className="text-center">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {order.items.map(item => (
                                        <TableRow key={item.id} className={!item.productId ? 'bg-amber-50/30' : ''}>
                                            <TableCell>
                                                <span className="font-mono font-semibold block">{item.skuOriginal}</span>
                                                <span className="font-mono text-xs text-slate-500">{item.barcodeOriginal || 'SEM EAN'}</span>
                                            </TableCell>
                                            <TableCell className="text-sm max-w-[250px] truncate" title={item.descriptionOriginal}>{item.descriptionOriginal}</TableCell>
                                            <TableCell className="font-mono text-xs">{item.unitOriginal}</TableCell>
                                            <TableCell className="text-right font-medium">
                                                {canViewExpectedQty ? item.expectedQty : '***'}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold text-slate-400">0</TableCell>
                                            <TableCell className="text-center">
                                                {!item.productId ? (
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Não Vinculado</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-slate-50 text-slate-600">Aguardando</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}