import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiInboundId } from '@/api/generated/inbound/inbound';
import { useGetApiInventoryHandlingUnits } from '@/api/generated/inventory/inventory';
import { useGetApiTopologyLocationsStorage } from '@/api/generated/topology/topology';
import { customInstance } from '@/api/orval-mutator';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
    ArrowLeft, Printer, Undo2, Search, Layers, Loader2,
    ShieldAlert, Box, Warehouse, AlertTriangle, MapPin, CheckCircle2, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import PrintHuModal from './PrintHuModal';
import RegisterHoldModal from '@/pages/Qualidade/RegisterHoldModal';

// COMPONENTE SELETOR PESQUISÁVEL DE POSIÇÕES
function SearchableLocationSelect({ value, onChange, locations, placeholder = "Pesquisar Posição (ex: P1C1AB01)..." }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const selectedLocation = locations.find(l => l.id === value);

    const filteredLocations = useMemo(() => {
        if (!searchTerm) return locations.slice(0, 40);
        const term = searchTerm.toLowerCase();
        return locations.filter(l => l.fullPath?.toLowerCase().includes(term)).slice(0, 40);
    }, [locations, searchTerm]);

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full h-10 px-3 text-xs bg-slate-50 border rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${!value ? 'border-amber-300' : 'border-slate-200'}`}
            >
                <span className={selectedLocation ? 'text-slate-900 font-bold font-mono' : 'text-slate-400'}>
                    {selectedLocation ? selectedLocation.fullPath : placeholder}
                </span>
                <Search size={14} className="text-slate-400 shrink-0 ml-2" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Digite para filtrar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                        />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1">
                        {filteredLocations.length === 0 ? (
                            <p className="text-[11px] text-slate-400 p-2 text-center">Nenhuma posição encontrada.</p>
                        ) : (
                            filteredLocations.map(loc => (
                                <div
                                    key={loc.id}
                                    onClick={() => {
                                        onChange(loc.id);
                                        setIsOpen(false);
                                        setSearchTerm('');
                                    }}
                                    className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between font-mono transition-colors ${value === loc.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'}`}
                                >
                                    <span>{loc.fullPath}</span>
                                    {value === loc.id && <CheckCircle2 size={12} className="text-blue-600" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function InboundOrderHusPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [page, setPage] = useState(1);
    const PAGE_SIZE = 100;

    const [search, setSearch] = useState('');
    const [qualityFilter, setQualityFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    const [selectedHus, setSelectedHus] = useState([]);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [husToRollback, setHusToRollback] = useState(null);
    const [isRollingBack, setIsRollingBack] = useState(false);

    // Modal de Apontamento de Avaria
    const [husToHold, setHusToHold] = useState(null);

    // Modal de Alocação / Movimentação
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [husToMove, setHusToMove] = useState([]);
    const [targetLocationId, setTargetLocationId] = useState('');
    const [isMoving, setIsMoving] = useState(false);
    const [locationTypeTab, setLocationTypeTab] = useState('storage');

    // 1. Dados da Ordem de Recebimento
    const { data: order, isLoading: isLoadingOrder } = useGetApiInboundId(orderId);

    // 2. Busca de Posições de Armazenamento e Posições de Qualidade
    const { data: storageLocations = [] } = useGetApiTopologyLocationsStorage();
    const [qualityLocations, setQualityLocations] = useState([]);

    useEffect(() => {
        customInstance({ url: '/api/topology/locations/quality', method: 'GET' })
            .then(res => setQualityLocations(Array.isArray(res) ? res : []))
            .catch(() => setQualityLocations([]));
    }, []);

    // 3. Busca das HUs FILTRADAS PELA NF-E
    const { data: apiResponse, isLoading: isLoadingHus, refetch } = useGetApiInventoryHandlingUnits(
        { ReceiptDocumentId: orderId, Page: page, PageSize: PAGE_SIZE },
        { query: { enabled: !!orderId } }
    );

    const orderHus = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || orderHus.length;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

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

    // Métricas Globais da NF-e
    const metrics = useMemo(() => {
        const totalHus = totalCount;
        const totalUnitsInStock = orderHus.reduce((acc, h) => acc + (Number(h.currentQuantity) || 0), 0);
        const quarantineHus = orderHus.filter(h => String(h.qualityStatus) === '2' || String(h.qualityStatus) === 'Quarantine' || String(h.qualityStatus) === '3' || String(h.qualityStatus) === 'Damaged').length;
        const pendingAllocationHus = orderHus.filter(h => String(h.status) === '2' || String(h.status) === 'Received').length;

        return { totalHus, totalUnitsInStock, quarantineHus, pendingAllocationHus };
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

    const handleOpenMoveModal = (hus) => {
        setHusToMove(hus);
        setTargetLocationId('');

        const hasQualityRestriction = hus.some(h => String(h.qualityStatus) !== '1' && String(h.qualityStatus) !== 'Available');
        setLocationTypeTab(hasQualityRestriction ? 'quality' : 'storage');

        setIsMoveModalOpen(true);
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

    const handleExecuteMove = async () => {
        if (!targetLocationId || husToMove.length === 0) {
            return toast.warning('Selecione o endereço de destino.');
        }

        setIsMoving(true);
        try {
            const huIds = husToMove.map(h => h.id);

            const res = await customInstance({
                url: '/api/inventory/handling-units/move',
                method: 'POST',
                data: {
                    handlingUnitIds: huIds,
                    destinationLocationId: targetLocationId
                }
            });

            toast.success(res?.message || 'Alocação/Movimentação concluída com sucesso!');

            await refetch();
            queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
            queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });

            setSelectedHus(prev => prev.filter(h => !huIds.includes(h.id)));
            setIsMoveModalOpen(false);
            setHusToMove([]);
            setTargetLocationId('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao movimentar HUs.');
        } finally {
            setIsMoving(false);
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
            case '2':
                return <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-mono text-[10px] font-bold">Na Doca (Aguardando Alocação)</Badge>;
            case 'Stored':
            case '3':
                return <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 font-mono text-[10px]">Armazenado</Badge>;
            case 'Picking':
            case '4':
            case 'Staged':
            case '5':
                return <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-mono text-[10px]">Em Expedição</Badge>;
            case 'Shipped':
            case '6':
                return <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 font-mono text-[10px]">Expedido</Badge>;
            case 'Consumed':
            case '7':
                return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 font-mono text-[10px]">Consumido</Badge>;
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

    const firstHuUnit = orderHus[0]?.unit || 'UN';
    const isSelectedRestricted = selectedHus.some(h => String(h.qualityStatus) !== '1' && String(h.qualityStatus) !== 'Available');

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
                                Gerencie a alocação no estoque, reimpressão de etiquetas térmicas, apontamento de avarias e estornos da Nota Fiscal.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {/* ALOCAÇÃO INTELIGENTE */}
                        {metrics.pendingAllocationHus > 0 && (
                            <Button
                                onClick={() => navigate(`/inbound/operacao/${orderId}/alocacao`)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm text-xs"
                            >
                                <Sparkles className="w-4 h-4 mr-1.5" /> Alocação Inteligente ({metrics.pendingAllocationHus})
                            </Button>
                        )}

                        {/* BOTÃO REGISTRAR AVARIA EM LOTE - AMARELO (AMBER) */}
                        <Button
                            onClick={() => setHusToHold(selectedHus)}
                            disabled={selectedHus.length === 0}
                            variant="outline"
                            className="border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 text-xs font-semibold"
                        >
                            <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-600" /> Registrar Avaria ({selectedHus.length})
                        </Button>

                        {/* BOTÃO MOVER EM LOTE */}
                        <Button
                            onClick={() => handleOpenMoveModal(selectedHus)}
                            disabled={selectedHus.length === 0}
                            variant="outline"
                            className="text-xs font-semibold"
                        >
                            <MapPin className="w-4 h-4 mr-1.5 text-blue-600" /> Mover ({selectedHus.length})
                        </Button>

                        {/* BOTÃO ESTORNAR EM LOTE - VERMELHO (ROSE) */}
                        <Button
                            onClick={() => setHusToRollback(selectedHus)}
                            disabled={selectedHus.length === 0}
                            variant="outline"
                            className="border-rose-300 text-rose-800 bg-rose-50 hover:bg-rose-100 text-xs font-semibold"
                        >
                            <Undo2 className="w-4 h-4 mr-1.5 text-rose-600" /> Estornar ({selectedHus.length})
                        </Button>

                        <Button
                            onClick={() => setIsPrintModalOpen(true)}
                            disabled={selectedHus.length === 0}
                            className="bg-slate-900 hover:bg-slate-800 text-white shadow-xs text-xs font-semibold"
                        >
                            <Printer className="w-4 h-4 mr-1.5" /> Reimprimir ({selectedHus.length})
                        </Button>
                    </div>
                </div>

                {/* PAINEL DE MÉTRICAS GLOBAIS DA NF-E */}
                <div className="grid grid-cols-4 gap-4 border-t border-slate-100 pt-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-md"><Layers size={20} /></div>
                        <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Total HUs na NF-e</span>
                            <span className="text-lg font-bold font-mono text-slate-900">{metrics.totalHus}</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 text-emerald-700 rounded-md"><Box size={20} /></div>
                        <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Volume Total Recebido</span>
                            <span className="text-lg font-bold font-mono text-emerald-700">{metrics.totalUnitsInStock} {firstHuUnit}</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                        <div className="p-2 bg-amber-100 text-amber-700 rounded-md"><Warehouse size={20} /></div>
                        <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Na Doca (Aguardando Alocação)</span>
                            <span className="text-lg font-bold font-mono text-amber-800">{metrics.pendingAllocationHus}</span>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                        <div className="p-2 bg-rose-100 text-rose-700 rounded-md"><ShieldAlert size={20} /></div>
                        <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Quarentena / Retidos / Avaria</span>
                            <span className="text-lg font-bold font-mono text-rose-800">{metrics.quarantineHus}</span>
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
                            className="pl-9 bg-white border-slate-200 text-xs"
                        />
                    </div>

                    <div className="w-48">
                        <Select value={qualityFilter} onValueChange={setQualityFilter}>
                            <SelectTrigger className="bg-white border-slate-200 text-xs"><SelectValue placeholder="Qualidade..." /></SelectTrigger>
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
                            <SelectTrigger className="bg-white border-slate-200 text-xs"><SelectValue placeholder="Status da HU..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Status</SelectItem>
                                <SelectItem value="2">Na Doca</SelectItem>
                                <SelectItem value="3">Armazenado</SelectItem>
                                <SelectItem value="6">Expedido</SelectItem>
                                <SelectItem value="7">Consumido</SelectItem>
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
                                <TableRow><TableCell colSpan={10} className="h-32 text-center text-slate-500">Nenhuma HU encontrada para esta NF-e.</TableCell></TableRow>
                            ) : (
                                filteredHus.map((hu) => {
                                    const isSelected = selectedHus.some(h => h.id === hu.id);
                                    const isPendingAllocation = String(hu.status) === 'Received' || String(hu.status) === '2';
                                    const isQualityRestricted = String(hu.qualityStatus) !== 'Available' && String(hu.qualityStatus) !== '1';

                                    const skuCode = hu.productSku || hu.sku;
                                    const description = hu.productDescription || hu.description || 'Produto WMS';
                                    const unit = hu.unit || 'UN';

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
                                                    <span className="font-semibold text-slate-800 text-xs font-mono">{skuCode}</span>
                                                    <span className="text-[10px] text-slate-500 truncate max-w-[220px]" title={description}>
                                                        {description}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell className="font-mono font-bold text-xs">
                                                <span className="text-blue-700">{hu.currentQuantity ?? hu.initialQuantity}</span>
                                                <span className="text-slate-400 font-normal"> / {hu.initialQuantity} {unit}</span>
                                            </TableCell>

                                            <TableCell className="font-mono text-xs text-slate-700">
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
                                                {/* AÇÃO INDIVIDUAL: REGISTRAR AVARIA (AMARELO/AMBER) */}
                                                {!isQualityRestricted && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        title="Registrar Avaria / Bloqueio"
                                                        onClick={() => setHusToHold([hu])}
                                                        className="text-amber-600 hover:bg-amber-50"
                                                    >
                                                        <AlertTriangle size={14} />
                                                    </Button>
                                                )}

                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    title={isPendingAllocation ? "Alocar no Estoque" : "Mover Posição"}
                                                    onClick={() => handleOpenMoveModal([hu])}
                                                    className="text-blue-600 hover:bg-blue-50"
                                                >
                                                    <MapPin size={14} />
                                                </Button>

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

                                                {/* AÇÃO INDIVIDUAL: ESTORNAR (VERMELHO/ROSE) */}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    title="Estornar Entrada"
                                                    onClick={() => setHusToRollback([hu])}
                                                    className="text-rose-600 hover:bg-rose-50"
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

                {/* CONTROLES DE PAGINAÇÃO */}
                {totalCount > 0 && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                        <span className="text-xs text-slate-500 font-medium">
                            Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} HUs da NF-e
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

            {/* MODAL DE ALOCAÇÃO / MOVIMENTAÇÃO */}
            <Dialog open={isMoveModalOpen} onOpenChange={setIsMoveModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <MapPin className="text-blue-600" size={20} /> Alocar / Mover no Estoque
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Selecione a posição de destino para {husToMove.length} HU(s).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {isSelectedRestricted ? (
                            <div className="p-3 rounded-lg border bg-rose-50 border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-medium">
                                <ShieldAlert size={18} className="shrink-0 text-rose-600" />
                                <span>Volumes com avaria ou quarentena só podem ser movimentados para posições do tipo <strong>Qualidade</strong>.</span>
                            </div>
                        ) : (
                            <div className="flex border-b border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => { setLocationTypeTab('storage'); setTargetLocationId(''); }}
                                    className={`pb-2 px-3 text-xs font-bold transition-all border-b-2 ${locationTypeTab === 'storage' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    Armazenamento Geral ({storageLocations.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setLocationTypeTab('quality'); setTargetLocationId(''); }}
                                    className={`pb-2 px-3 text-xs font-bold transition-all border-b-2 ${locationTypeTab === 'quality' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    Posições de Qualidade / Retenção ({qualityLocations.length})
                                </button>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700">
                                Endereço Destino ({isSelectedRestricted || locationTypeTab === 'quality' ? 'Qualidade' : 'Armazenamento'}) *
                            </label>
                            <SearchableLocationSelect
                                value={targetLocationId}
                                onChange={(locId) => setTargetLocationId(locId)}
                                locations={isSelectedRestricted || locationTypeTab === 'quality' ? qualityLocations : storageLocations}
                                placeholder={isSelectedRestricted || locationTypeTab === 'quality' ? "Pesquisar Posição de Qualidade/Avaria..." : "Pesquisar Posição de Armazenamento..."}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMoveModalOpen(false)} disabled={isMoving}>Cancelar</Button>
                        <Button onClick={handleExecuteMove} disabled={!targetLocationId || isMoving} className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                            {isMoving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                            Confirmar Alocação / Movimento
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* MODAL DE APONTAMENTO DE AVARIA / BLOQUEIO (INDIVIDUAL E EM LOTE) */}
            {husToHold && husToHold.length > 0 && (
                <RegisterHoldModal
                    open={!!husToHold && husToHold.length > 0}
                    onOpenChange={(open) => !open && setHusToHold(null)}
                    hus={husToHold}
                    onSuccess={() => {
                        refetch();
                        queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
                        queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
                        setSelectedHus([]);
                    }}
                />
            )}

            {/* CONFIRMAÇÃO DE ESTORNO */}
            <AlertDialog open={!!husToRollback && husToRollback.length > 0} onOpenChange={(open) => !open && !isRollingBack && setHusToRollback(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Estornar {husToRollback?.length === 1 ? `HU ${husToRollback[0]?.lpn}` : `${husToRollback?.length} HU(s) selecionadas`}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja estornar a entrada deste(s) volume(s)? A quantidade recebida na NF-e e os saldos em estoque serão reajustados.
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