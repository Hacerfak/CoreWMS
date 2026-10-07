import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    ArrowLeft, Box, CheckCircle2, Loader2, PackageCheck, MapPin, Truck, FileText, UserCheck, ChevronDown, ChevronRight, Layers, FileCode
} from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundOrderDetailsPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();

    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedItemIds, setExpandedItemIds] = useState({});

    const loadOrderDetails = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({
                url: `/api/outbound/orders/${orderId}`,
                method: 'GET'
            });
            setOrder(res);
            // Expande por padrão os itens que possuem HUs separadas
            if (res?.items) {
                const initialExpanded = {};
                res.items.forEach(i => {
                    if (i.allocations && i.allocations.length > 0) {
                        initialExpanded[i.id] = true;
                    }
                });
                setExpandedItemIds(initialExpanded);
            }
        } catch {
            toast.error('Erro ao carregar detalhes da ordem de saída.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) loadOrderDetails();
    }, [orderId]);

    const toggleExpandItem = (itemId) => {
        setExpandedItemIds(prev => ({ ...prev, [itemId]: !prev[itemId] }));
    };

    const renderStatusBadge = (status) => {
        switch (status) {
            case 'Pending':
                return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Aguardando Alocação</Badge>;
            case 'Allocated':
                return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Pronto p/ Separar</Badge>;
            case 'Picking':
                return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Em Separação</Badge>;
            case 'Packing':
                return <Badge className="bg-amber-100 text-amber-900 border-amber-300">Aguardando Packing</Badge>;
            case 'ReadyToShip':
                return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Pronto p/ Expedir</Badge>;
            case 'Shipped':
                return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Expedido</Badge>;
            case 'Canceled':
                return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Cancelado</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getFreightModalityLabel = (modality) => {
        switch (modality) {
            case 0: return '0 - CIF (Emitente)';
            case 1: return '1 - FOB (Destinatário)';
            case 2: return '2 - Terceiros';
            default: return '9 - Sem Frete';
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando detalhes do pedido...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/outbound')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900">Ordem de Saída #{order?.orderNumber}</h1>
                            {renderStatusBadge(order?.status)}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong className="text-slate-700">{order?.customerName}</strong>
                            {order?.invoiceNumber && ` | NF-e ERP: ${order.invoiceNumber}/${order.invoiceSerie || '1'}`}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {(order?.status === 'Allocated' || order?.status === 'Picking') && (
                        <Button onClick={() => navigate(`/outbound/picking/${order.id}`)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-9">
                            <Box size={15} className="mr-1.5" /> Ir para Coletor
                        </Button>
                    )}
                    {order?.status === 'Packing' && (
                        <Button onClick={() => navigate(`/outbound/packing/${order.id}`)} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9">
                            <PackageCheck size={15} className="mr-1.5" /> Ir para Packing
                        </Button>
                    )}
                    {order?.status === 'ReadyToShip' && (
                        <Button onClick={() => navigate(`/outbound`)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9">
                            <CheckCircle2 size={15} className="mr-1.5" /> Pronto p/ Expedir
                        </Button>
                    )}
                </div>
            </div>

            {/* PAINEL DE CONTEÚDO */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUNA ESQUERDA: ITENS DO PEDIDO & HUS SEPARADAS + VOLUMES */}
                <div className="lg:col-span-2 space-y-6">
                    {/* CARD 1: ITENS E HUS SEPARADAS */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-2"><Layers size={16} className="text-orange-600" /> Itens do Pedido & Origem das HUs</span>
                                <Badge variant="secondary" className="font-mono">{order?.items?.length || 0} SKU(s)</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            {order?.items?.map((item) => {
                                const percent = item.expectedQuantity > 0 ? Math.min(100, (item.pickedQuantity / item.expectedQuantity) * 100) : 0;
                                const isExpanded = !!expandedItemIds[item.id];
                                const pickedAllocations = item.allocations?.filter(a => a.isPicked) || [];
                                const unpickedAllocations = item.allocations?.filter(a => !a.isPicked) || [];

                                return (
                                    <div key={item.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
                                        <div
                                            onClick={() => toggleExpandItem(item.id)}
                                            className="p-3 bg-white flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100"
                                        >
                                            <div className="flex items-center gap-3">
                                                {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-xs text-slate-900">{item.skuCode}</span>
                                                        <Badge variant="outline" className="text-[10px] font-mono">{item.unit}</Badge>
                                                    </div>
                                                    <span className="text-[11px] text-slate-500">{item.description}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs font-mono">
                                                <div>
                                                    <span className="text-slate-400 text-[10px] block">PREVISTO / SEPARADO</span>
                                                    <span className="font-bold text-slate-900">{item.expectedQuantity} {item.unit}</span>
                                                    <span className="text-purple-700 font-bold ml-1">({item.pickedQuantity} SEPARADO)</span>
                                                </div>
                                                <Badge className={item.pickedQuantity >= item.expectedQuantity ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                                                    {item.status}
                                                </Badge>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="p-3 bg-slate-50 space-y-3 text-xs">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px] text-slate-500 font-semibold">
                                                        <span>Progresso de Separação</span>
                                                        <span>{percent.toFixed(0)}%</span>
                                                    </div>
                                                    <Progress value={percent} className="h-1.5" />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                                    {/* HUs Coletadas */}
                                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                                                        <span className="font-bold text-slate-800 text-[10px] uppercase block tracking-wider text-emerald-700">
                                                            ✓ HUs Separadas ({pickedAllocations.length})
                                                        </span>
                                                        {pickedAllocations.length === 0 ? (
                                                            <span className="text-[11px] text-slate-400 italic">Nenhum LPN coletado.</span>
                                                        ) : (
                                                            pickedAllocations.map(a => (
                                                                <div key={a.allocationId} className="flex justify-between items-center text-[11px] font-mono bg-slate-50 p-1.5 rounded border">
                                                                    <span>LPN: <strong>{a.lpn}</strong> ({a.locationPath})</span>
                                                                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{a.quantity} {item.unit}</Badge>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>

                                                    {/* HUs Reservadas/Sugeridas Pendentes */}
                                                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                                                        <span className="font-bold text-slate-800 text-[10px] uppercase block tracking-wider text-blue-700">
                                                            ⏳ Reservadas / Sugeridas ({unpickedAllocations.length})
                                                        </span>
                                                        {unpickedAllocations.length === 0 ? (
                                                            <span className="text-[11px] text-slate-400 italic">Sem reservas pendentes.</span>
                                                        ) : (
                                                            unpickedAllocations.map(a => (
                                                                <div key={a.allocationId} className="flex justify-between items-center text-[11px] font-mono bg-slate-50 p-1.5 rounded border">
                                                                    <span>LPN: <strong>{a.lpn}</strong> ({a.locationPath})</span>
                                                                    <span className="text-slate-600">{a.quantity} {item.unit}</span>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    {/* CARD 2: VOLUMES GERADOS NO PACKING */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-2"><Box size={16} className="text-orange-600" /> Volumes Finais Gerados (Packing)</span>
                                <Badge variant="secondary" className="font-mono">{order?.volumes?.length || 0} Volume(s)</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            {!order?.volumes || order.volumes.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">Nenhum volume gerado na conferência ainda.</p>
                            ) : (
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead>Volume LPN</TableHead>
                                                <TableHead>Tipo Embalagem</TableHead>
                                                <TableHead>Filme Stretch</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {order.volumes.map(vol => (
                                                <TableRow key={vol.id}>
                                                    <TableCell className="font-mono font-bold text-xs text-slate-900">{vol.volumeLpn}</TableCell>
                                                    <TableCell className="text-xs font-mono">
                                                        <Badge variant="outline" className="text-[10px] mr-1.5">{vol.packagingTypeCode}</Badge>
                                                        {vol.packagingTypeDescription}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={vol.usedStretchFilm ? 'bg-blue-100 text-blue-800 text-[10px]' : 'bg-slate-100 text-slate-600 text-[10px]'}>
                                                            {vol.usedStretchFilm ? 'Sim (Aplicado)' : 'Não'}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* COLUNA DIREITA: DADOS CADASTRAIS, DESTINATÁRIO E TRANSPORTE */}
                <div className="space-y-6">
                    {/* DESTINATÁRIO FINAL */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <UserCheck size={16} className="text-orange-600" /> Destinatário Final & Entrega
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2 text-xs">
                            <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Razão Social / Nome</span>
                                <span className="font-bold text-slate-900 block">{order?.destinationName || 'Próprio Depositante'}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">CNPJ / CPF</span>
                                    <span className="font-mono font-semibold text-slate-800">{order?.destinationCnpjCpf || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Inscrição Estadual</span>
                                    <span className="font-mono font-semibold text-slate-800">{order?.destinationStateRegistration || 'ISENTO'}</span>
                                </div>
                            </div>

                            <div className="pt-1 border-t border-slate-100 space-y-1">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold flex items-center gap-1">
                                    <MapPin size={12} className="text-orange-600" /> Endereço de Entrega
                                </span>
                                <p className="text-slate-700">
                                    {order?.destinationStreet ? `${order.destinationStreet}, ${order.destinationNumber || 'S/N'} ${order.destinationComplement || ''}` : 'Endereço cadastrado no Depositante'}
                                </p>
                                <p className="text-slate-600 font-mono">
                                    {order?.destinationNeighborhood ? `${order.destinationNeighborhood} - ` : ''}
                                    {order?.destinationCity} / {order?.destinationState} - CEP: {order?.destinationZipCode || '-'}
                                </p>
                                {order?.destinationCityCode > 0 && (
                                    <span className="text-[10px] text-slate-400 font-mono block">Cód. IBGE: {order.destinationCityCode}</span>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* TRANSPORTADORA & LOGÍSTICA */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-4 border-b bg-slate-50/60">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <Truck size={16} className="text-orange-600" /> Transportadora & Logística
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2 text-xs">
                            <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Modalidade do Frete</span>
                                <span className="font-semibold text-slate-800">{getFreightModalityLabel(order?.freightModality)}</span>
                            </div>

                            <div className="pt-1 border-t border-slate-100">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Transportadora</span>
                                <span className="font-bold text-slate-900 block">{order?.carrierName || 'Não Informada'}</span>
                                {order?.carrierCnpjCpf && <span className="font-mono text-slate-600 block">{order.carrierCnpjCpf}</span>}
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Placa Veículo</span>
                                    <span className="font-mono font-bold text-slate-800">{order?.vehiclePlate || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">UF Placa</span>
                                    <span className="font-mono font-bold text-slate-800">{order?.vehiclePlateState || '-'}</span>
                                </div>
                            </div>

                            <div className="pt-1 border-t border-slate-100">
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Doca de Embarque</span>
                                <span className="font-mono font-bold text-slate-900">{order?.dockLocationName || 'Aguardando Packing'}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* DADOS ADICIONAIS / INFCPL */}
                    {order?.additionalNotes && (
                        <Card className="border-slate-200/80 bg-white shadow-xs">
                            <CardHeader className="p-3 border-b bg-slate-50/60">
                                <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-1.5">
                                    <FileText size={15} className="text-orange-600" /> Observações Fiscais (infCpl)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 text-xs text-slate-700 font-mono">
                                {order.additionalNotes}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}