import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGetApiInboundId, usePostApiInboundItemsIdStart } from '@/api/generated/inbound/inbound';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, AlertTriangle, Box, ArrowLeft, Loader2, PlayCircle, MapPin, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

import ReviewProductModal from './ReviewProductModal';
import AssignDockModal from './AssignDockModal';
import ReceiveItemWizard from './ReceiveItemWizard';
import PutawayTab from './PutawayTab';

export default function InboundWorkspacePage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const { data: order, isLoading } = useGetApiInboundId(id);

    // Controles de Modais
    const [reviewItem, setReviewItem] = useState(null);
    const [dockItem, setDockItem] = useState(null);
    const [receiveItem, setReceiveItem] = useState(null);

    // Permissões
    const canReview = useHasPermission('inbound:review_products');
    const canAssignDock = useHasPermission('inbound:assign_dock');
    const canCheck = useHasPermission('inbound:execute_checking');

    // Mutação para travar o item (Concorrência) antes de abrir o Wizard
    const { mutate: startReceiving, isPending: isStarting } = usePostApiInboundItemsIdStart({
        mutation: {
            onSuccess: (_, variables) => {
                const targetItem = order.items.find(i => i.id === variables.id);
                setReceiveItem(targetItem);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao iniciar conferência.')
        }
    });

    const handleStartConference = (item) => {
        if (item.status === 4) { // 4 = Receiving (Já está em andamento)
            setReceiveItem(item); // Apenas reabre o modal se já é o dono
        } else {
            startReceiving({ id: item.id }); // Trava no backend primeiro
        }
    };

    if (isLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
    if (!order) return <div className="flex h-full items-center justify-center text-rose-500">Ordem não encontrada.</div>;

    const renderProgressBar = () => {
        // Mapeamento simplificado do InboundOrderStatus
        const steps = ['PendingReview', 'AwaitingDock', 'AwaitingReceiving', 'Receiving', 'Finished'];
        const currentIdx = steps.findIndex(s => s === order.status) !== -1 ? steps.findIndex(s => s === order.status) : 0;

        return (
            <div className="flex items-center justify-between w-full relative pt-2 px-10">
                <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-1 bg-slate-200 -z-10 rounded-full"></div>
                <div className="absolute left-10 top-1/2 -translate-y-1/2 h-1 bg-blue-500 -z-10 transition-all duration-500 rounded-full" style={{ width: `calc(${(currentIdx / 4) * 100}% - 40px)` }}></div>

                {['Revisão', 'Doca', 'Espera', 'Operação', 'Finalizado'].map((label, idx) => (
                    <div key={label} className="flex flex-col items-center gap-2 bg-white px-2">
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
                            {order.hasDivergence && <Badge variant="destructive">Contém Divergências</Badge>}
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">Depositante: <strong className="text-slate-700">{order.issuerName}</strong> ({order.issuerCnpj})</p>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl p-8 shadow-sm">
                {renderProgressBar()}
            </div>

            <div className="flex-1 bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden">
                <Tabs defaultValue="items" className="flex-1 flex flex-col min-h-0">
                    <div className="border-b border-slate-100 bg-slate-50/50 px-4 pt-2">
                        <TabsList className="bg-transparent h-10 gap-6 w-full justify-start">
                            <TabsTrigger value="items" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-1 h-full"><Box className="w-4 h-4 mr-2" /> Controle de Itens</TabsTrigger>
                            <TabsTrigger value="putaway" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-1 h-full"><ArrowRightLeft className="w-4 h-4 mr-2" /> Alocação (Putaway)</TabsTrigger>
                            <TabsTrigger value="finance" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-1 h-full"><FileText className="w-4 h-4 mr-2" /> Dados Fiscais</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="items" className="flex-1 overflow-auto p-0 m-0">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead>Produto</TableHead>
                                    <TableHead className="text-right">Qtd XML</TableHead>
                                    <TableHead className="text-right">Físico Recebido</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-right">Ação</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {order.items.map(item => (
                                    <TableRow key={item.id} className={item.status === 1 ? 'bg-amber-50/30' : ''}>
                                        <TableCell>
                                            <span className="font-mono font-semibold block">{item.skuOriginal}</span>
                                            <span className="text-xs text-slate-500 truncate max-w-[300px] block" title={item.descriptionOriginal}>{item.descriptionOriginal}</span>
                                            {item.assignedUserName && <span className="text-[10px] text-blue-600 font-medium mt-1 block">Conferência por: {item.assignedUserName}</span>}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">{item.expectedQty} {item.unitOriginal}</TableCell>
                                        <TableCell className="text-right font-semibold text-slate-700">
                                            {item.goodQty + item.damagedQty} {item.unitOriginal}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {item.status === 1 && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Revisão Pendente</Badge>}
                                            {item.status === 2 && <Badge variant="outline" className="bg-slate-50 text-slate-600">Aguardando Doca</Badge>}
                                            {item.status === 3 && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Aguardando Bipagem</Badge>}
                                            {item.status === 4 && <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Em Conferência</Badge>}
                                            {item.status === 5 && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Finalizado</Badge>}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.status === 1 && canReview && (
                                                <Button size="sm" onClick={() => setReviewItem(item)} className="bg-amber-500 hover:bg-amber-600 text-white"><AlertTriangle className="w-4 h-4 mr-2" /> Revisar Malha Fina</Button>
                                            )}
                                            {item.status === 2 && canAssignDock && (
                                                <Button size="sm" variant="outline" onClick={() => setDockItem(item)} className="border-blue-200 text-blue-700 hover:bg-blue-50"><MapPin className="w-4 h-4 mr-2" /> Indicar Doca</Button>
                                            )}
                                            {(item.status === 3 || item.status === 4) && canCheck && (
                                                <Button size="sm" onClick={() => handleStartConference(item)} disabled={isStarting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                                    {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                                                    {item.status === 4 ? 'Continuar' : 'Iniciar'}
                                                </Button>
                                            )}
                                            {item.status === 5 && (
                                                <CheckCircle2 className="w-5 h-5 text-emerald-500 inline-block mr-4" />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TabsContent>

                    <TabsContent value="putaway" className="flex-1 overflow-auto p-6 m-0">
                        <PutawayTab orderId={order.id} companyId={order.companyId} />
                    </TabsContent>

                </Tabs>
            </div>

            {/* Modais Independentes */}
            {reviewItem && <ReviewProductModal open={!!reviewItem} onOpenChange={() => setReviewItem(null)} item={reviewItem} orderId={order.id} />}
            {dockItem && <AssignDockModal open={!!dockItem} onOpenChange={() => setDockItem(null)} item={dockItem} orderId={order.id} />}
            {receiveItem && <ReceiveItemWizard open={!!receiveItem} onOpenChange={() => setReceiveItem(null)} item={receiveItem} orderId={order.id} customerId={order.customerId} />}
        </div>
    );
}