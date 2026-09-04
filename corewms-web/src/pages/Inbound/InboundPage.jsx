import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetApiInbound } from '@/api/generated/inbound/inbound';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, UploadCloud, FileText, Calendar } from 'lucide-react';
import UploadXmlModal from './UploadXmlModal';

export default function InboundPage() {
    const navigate = useNavigate();
    const [isUploadOpen, setIsUploadOpen] = useState(false);

    const canUploadXml = useHasPermission('inbound:upload_xml');

    // Consulta da API gerada pelo Orval
    const { data: orders = [], isLoading } = useGetApiInbound();

    const getStatusBadge = (status) => {
        switch (status) {
            case 'PendingReview': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pend. Revisão</Badge>;
            case 'AwaitingDock': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Aguardando Doca</Badge>;
            case 'InConference': return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Em Conferência</Badge>;
            case 'Finished': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Finalizado</Badge>;
            case 'Canceled': return <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Cancelado</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recebimento (Inbound)</h1>
                    <p className="text-sm text-slate-500 mt-1">Gestão centralizada de notas fiscais de entrada, conferência e alocação de estoque.</p>
                </div>
                {canUploadXml && (
                    <Button onClick={() => setIsUploadOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                        <UploadCloud className="mr-2 h-4 w-4" /> Importar XML (NF-e)
                    </Button>
                )}
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[300px]">Ordem / NF-e</TableHead>
                                <TableHead>Depositante</TableHead>
                                <TableHead>Emissão</TableHead>
                                <TableHead>Status Operacional</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : orders.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">Nenhum recebimento em andamento.</TableCell></TableRow>
                            ) : orders.map((order) => (
                                <TableRow
                                    key={order.id}
                                    className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                                    onClick={() => navigate(`/inbound/${order.id}`)}
                                >
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center">
                                                <FileText size={16} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900">NF {order.number}</span>
                                                <span className="text-[10px] font-mono text-slate-500 truncate max-w-[200px]">{order.accessKey}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium text-slate-700">{order.issuerName}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center text-sm text-slate-500">
                                            <Calendar className="w-3 h-3 mr-1.5" />
                                            {new Date(order.issueDate).toLocaleDateString('pt-BR')}
                                        </div>
                                    </TableCell>
                                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-blue-600 hover:bg-blue-50"
                                            onClick={(e) => {
                                                e.stopPropagation(); // Evita dupla navegação ao clicar diretamente no botão
                                                navigate(`/inbound/${order.id}`);
                                            }}
                                        >
                                            Abrir Workspace
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <UploadXmlModal open={isUploadOpen} onOpenChange={setIsUploadOpen} />
        </div>
    );
}