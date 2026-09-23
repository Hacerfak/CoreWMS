import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiInboundId } from '@/api/generated/inbound/inbound';
import { useGetApiInventoryHandlingUnits } from '@/api/generated/inventory/inventory';
import { customInstance } from '@/api/orval-mutator';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
    ArrowLeft, Printer, Undo2, Search, Layers, Loader2,
    ShieldAlert, Box, Warehouse, AlertTriangle, Archive
} from 'lucide-react';
import { toast } from 'sonner';
import PrintHuModal from './PrintHuModal';

export default function InboundOrderHusPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Controle de Paginação
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 100;

    // Filtros Locais
    const [search, setSearch] = useState('');
    const [qualityFilter, setQualityFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Seleção e Modais
    const [selectedHus, setSelectedHus] = useState([]);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [husToRollback, setHusToRollback] = useState(null);
    const [isRollingBack, setIsRollingBack] = useState(false);

    // 1. Dados da Ordem de Recebimento
    const { data: order, isLoading: isLoadingOrder } = useGetApiInboundId(orderId);

    // 2. Busca de HUs do Depositante com limite estrito de 100
    const { data: apiResponse, isLoading: isLoadingHus, refetch } = useGetApiInventoryHandlingUnits(
        { CustomerId: order?.customerId, Page: page, PageSize: PAGE_SIZE },
        { query: { enabled: !!order?.customerId } }
    );

    const allHus = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || allHus.length;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    // Filtra apenas as HUs pertencentes a esta Ordem de Recebimento (NF-e)
    const orderHus = useMemo(() => {
        return allHus.filter(h =>
            !h.receiptDocumentId || !orderId ||
            String(h.receiptDocumentId).toLowerCase() === String(orderId).toLowerCase()
        );
    }, [allHus, orderId]);

    // Aplica Filtros de Pesquisa e Categoria
    const filteredHus = useMemo(() => {
        return orderHus.filter(hu => {
            const matchesSearch = !search ||
                hu.lpn?.toLowerCase().includes(search.toLowerCase()) ||
                (hu.productSku || hu.sku)?.toLowerCase().includes(search.toLowerCase()) ||
                hu.batch?.toLowerCase().includes(search.toLowerCase());

            const matchesQuality = qualityFilter === 'ALL' || String(hu.qualityStatus) === qualityFilter || hu.qualityStatus === qualityFilter;
            const matchesStatus = statusFilter === 'ALL' || String(hu.status) === statusFilter;

            return matchesSearch && matchesQuality && matchesStatus;
        });
    }, [orderHus, search, qualityFilter, statusFilter]);

    // Métricas para os Cards de Topo
    const metrics = useMemo(() => {
        const totalHus = totalCount;
        const totalUnitsInStock = orderHus.reduce((acc, h) => acc + (Number(h.currentQuantity) || 0), 0);
        const quarantineHus = orderHus.filter(h => String(h.qualityStatus) === '2' || String(h.qualityStatus) === 'Quarantine').length;
        const consumedOrShippedHus = orderHus.filter(h => String(h.status) === 'Consumed' || String(h.status) === 'Shipped').length;

        return { totalHus, totalUnitsInStock, quarantineHus, consumedOrShippedHus };
    }, [orderHus, totalCount]);

    const toggleSelectAll = () => {
        if (selectedHus.length === filteredHus.length) {
            setSelectedHus([]);
        } else {
            setSelectedHus(filteredHus);
        }
    };

    const toggleSelectHu = (hu) => {
        setSelectedHus(prev =>
            prev.some(h => h.id === hu.id) ? prev.filter(h => h.id !== hu.id) : [...prev, hu]
        );
    };

    const handleConfirmRollback = async () => {
        if (!husToRollback || husToRollback.length === 0) return;

        setIsRollingBack(true);
        try {
            const huIds = husToRollback.map(h => h.id);

            await customInstance({
                url: '/api/inbound/receive/hus/rollback',
                method: 'POST',
                data: { handlingUnitIds: huIds }
            });

            toast.success(`${huIds.length} HU(s) estornada(s) com sucesso!`);

            await refetch();
            queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
            queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });

            setSelectedHus(prev => prev.filter(h => !huIds.includes(h.id)));
            setHusToRollback(null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao realizar o estorno das HUs.');
        } finally {
            setIsRollingBack(false);
        }
    };

    const renderQualityBadge = (qualityStatus) => {
        const statusStr = String(qualityStatus);
        if (statusStr === '1' || statusStr === 'Available') {
            return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Liberado</Badge>;
        }
        if (statusStr === '2' || statusStr === 'Quarantine') {
            return <Badge className="bg-amber-100 text-amber-800 border-amber-200 flex items-center gap-1"><ShieldAlert size={12} /> Quarentena</Badge>;
        }
        if (statusStr === '3' || statusStr === 'Damaged') {
            return <Badge className="bg-rose-100 text-rose-800 border-rose-200 flex items-center gap-1"><AlertTriangle size={12} /> Avariado</Badge>;
        }
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Divergência / Falta</Badge>;
    };

    const renderHuStatusBadge = (status) => {
        const statusStr = String(status);
        switch (statusStr) {
            case 'Received':
                return <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-mono text-[10px]">Na Doca</Badge>;
            case 'Stored':
                return <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 font-mono text-[10px]">Armazenado</Badge>;
            case 'Picking':
            case 'Staged':
                return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 font-mono text-[10px]">Em Expedição</Badge>;
            case 'Shipped':
                return <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 font-mono text-[10px]">Expedido</Badge>;
            case 'Consumed':
                return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 font-mono text-[10px]">Consumido / Zerado</Badge>;
            default:
                return <Badge variant="outline" className="font-mono text-[10px]">{statusStr}</Badge>;
        }
    };

    if (isLoadingOrder) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    const documentNumber = order?.accessKey && order.accessKey.length >= 34
        ? parseInt(order.accessKey.substring(25, 34), 10)
        : 'N/A';

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* CABEÇALHO DA PÁGINA */}
            <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/inbound/operacao/${orderId}`)}
                            className="shrink-0 text-slate-500 hover:text-slate-900"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
                                    HUs Geradas - NF {documentNumber}
                                </h1>
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-medium">
                                    {order?.customerName || order?.issuerName}
                                </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Consulta, reimpressão de etiquetas térmicas e controle de estornos da Nota Fiscal.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            onClick={() => setHusToRollback(selectedHus)}
                            disabled={selectedHus.length === 0}
                            variant="outline"
                            className="border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 shadow-xs"
                        >
                            <Undo2 className="w-4 h-4 mr-2 text-rose-600" /> Estornar Selecionadas ({selectedHus.length})
                        </Button>

                        <Button
                            onClick={() => setIsPrintModalOpen(true)}
                            disabled={selectedHus.length === 0}
                            className="bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                        >
                            <Printer className="w-4 h-4 mr-2" /> Reimprimir Selecionadas ({selectedHus.length})
                        </Button>
                    </div>
                </div>

                {/* PAINEL DE MÉTRICAS */}
                <div className="grid grid-cols-4 gap-4 border-t border-slate-100 pt-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-md"><Layers size={20} /></div>
                        <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Total de HUs Registradas</span>
                            <span className="text-lg font-bold font-mono text-slate-900">{metrics.totalHus}</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 text-emerald-700 rounded-md"><Box size={20} /></div>
                        <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Página Atual em Estoque</span>
                            <span className="text-lg font-bold font-mono text-emerald-700">{metrics.totalUnitsInStock} UN</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                        <div className="p-2 bg-amber-100 text-amber-700 rounded-md"><ShieldAlert size={20} /></div>
                        <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Quarentena (Página)</span>
                            <span className="text-lg font-bold font-mono text-amber-800">{metrics.quarantineHus}</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-700 rounded-md"><Archive size={20} /></div>
                        <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Expedidas (Página)</span>
                            <span className="text-lg font-bold font-mono text-purple-800">{metrics.consumedOrShippedHus}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* TABELA COM PAGINAÇÃO */}
            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4 shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por LPN, SKU ou Lote..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white border-slate-200"
                        />
                    </div>

                    <div className="w-48">
                        <Select value={qualityFilter} onValueChange={setQualityFilter}>
                            <SelectTrigger className="bg-white border-slate-200"><SelectValue placeholder="Qualidade..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todas Qualidades</SelectItem>
                                <SelectItem value="1">Liberado (Sem Avarias)</SelectItem>
                                <SelectItem value="2">Quarentena / Retido</SelectItem>
                                <SelectItem value="3">Avariado / Danificado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-48">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="bg-white border-slate-200"><SelectValue placeholder="Status da HU..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Status</SelectItem>
                                <SelectItem value="Received">Na Doca</SelectItem>
                                <SelectItem value="Stored">Armazenado</SelectItem>
                                <SelectItem value="Shipped">Expedido</SelectItem>
                                <SelectItem value="Consumed">Consumido / Zerado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[40px]">
                                    <Checkbox
                                        checked={filteredHus.length > 0 && selectedHus.length === filteredHus.length}
                                        onCheckedChange={toggleSelectAll}
                                    />
                                </TableHead>
                                <TableHead>LPN / Código HU</TableHead>
                                <TableHead>SKU / Produto</TableHead>
                                <TableHead>Saldo Atual / Inicial</TableHead>
                                <TableHead>Lote Físico</TableHead>
                                <TableHead>Validade</TableHead>
                                <TableHead>Posição Atual</TableHead>
                                <TableHead>Qualidade</TableHead>
                                <TableHead>Status HU</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoadingHus ? (
                                <TableRow><TableCell colSpan={10} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : filteredHus.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="h-32 text-center text-slate-500">Nenhuma HU encontrada nesta página.</TableCell></TableRow>
                            ) : (
                                filteredHus.map((hu) => {
                                    const isSelected = selectedHus.some(h => h.id === hu.id);

                                    return (
                                        <TableRow key={hu.id} className={isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/50'}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() => toggleSelectHu(hu)}
                                                />
                                            </TableCell>

                                            <TableCell className="font-mono font-bold text-slate-900">
                                                {hu.lpn}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-800">{hu.productSku || hu.sku}</span>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[200px]" title={hu.productDescription || hu.description}>
                                                        {hu.productDescription || hu.description || 'Produto WMS'}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell className="font-mono font-bold">
                                                <span className="text-blue-700">{hu.currentQuantity ?? hu.initialQuantity}</span>
                                                <span className="text-slate-400 font-normal text-xs"> / {hu.initialQuantity} {hu.unit || 'UN'}</span>
                                            </TableCell>

                                            <TableCell className="font-mono text-slate-700">
                                                {hu.batch || 'N/A'}
                                            </TableCell>

                                            <TableCell className="font-mono text-xs text-slate-600">
                                                {hu.expirationDate ? new Date(hu.expirationDate).toLocaleDateString('pt-BR') : 'N/A'}
                                            </TableCell>

                                            <TableCell>
                                                <Badge variant="outline" className="bg-slate-50 font-mono text-[10px] border-slate-300">
                                                    <Warehouse size={12} className="mr-1 text-blue-600" />
                                                    {hu.locationPath || 'DOCA'}
                                                </Badge>
                                            </TableCell>

                                            <TableCell>
                                                {renderQualityBadge(hu.qualityStatus)}
                                            </TableCell>

                                            <TableCell>
                                                {renderHuStatusBadge(hu.status)}
                                            </TableCell>

                                            <TableCell className="text-right space-x-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    title="Reimprimir Etiqueta"
                                                    onClick={() => {
                                                        setSelectedHus([hu]);
                                                        setIsPrintModalOpen(true);
                                                    }}
                                                    className="text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                                                >
                                                    <Printer size={14} />
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    title="Estornar Entrada"
                                                    onClick={() => setHusToRollback([hu])}
                                                    className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                >
                                                    <Undo2 size={14} />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* CONTROLES DE PAGINAÇÃO NO RODAPÉ DA TABELA */}
                {totalCount > 0 && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                        <span className="text-xs text-slate-500 font-medium">
                            Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} HUs
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="h-7 text-xs bg-white"
                            >
                                Anterior
                            </Button>
                            <span className="text-xs font-mono self-center text-slate-600 px-1">
                                Página {page} de {totalPages || 1}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages || totalPages === 0}
                                className="h-7 text-xs bg-white"
                            >
                                Próxima
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* CONFIRMAÇÃO DE ESTORNO */}
            <AlertDialog open={!!husToRollback && husToRollback.length > 0} onOpenChange={(open) => !open && !isRollingBack && setHusToRollback(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Estornar {husToRollback?.length === 1 ? `HU ${husToRollback[0]?.lpn}` : `${husToRollback?.length} HU(s) selecionadas`}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja estornar a entrada deste(s) volume(s)? A quantidade recebida na NF-e e os saldos em estoque serão reajustados e as HUs serão removidas do sistema.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRollingBack}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmRollback}
                            disabled={isRollingBack}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                        >
                            {isRollingBack ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Estorno'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* MODAL DE IMPRESSÃO */}
            {isPrintModalOpen && (
                <PrintHuModal
                    open={isPrintModalOpen}
                    onOpenChange={setIsPrintModalOpen}
                    husToPrint={selectedHus}
                    orderData={order}
                />
            )}
        </div>
    );
}