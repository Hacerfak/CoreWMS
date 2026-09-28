import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiInventoryHandlingUnits } from '@/api/generated/inventory/inventory';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { useGetApiProducts } from '@/api/generated/products/products';
import { useGetApiTopologyLocationsStorage } from '@/api/generated/topology/topology';
import { customInstance } from '@/api/orval-mutator';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, Loader2, Download, Layers, MapPin, ShieldAlert, AlertTriangle, Printer, CheckCircle2, Calendar, FileText, Undo2, X } from 'lucide-react';

import { downloadBackendCsv } from '@/lib/exportCsv';
import RegisterHoldModal from '@/pages/Qualidade/RegisterHoldModal';
import PrintHuModal from '@/pages/Inbound/PrintHuModal';

// Seletor Pesquisável Compacto de Posição
function SearchableLocationSelect({ value, onChange, locations, placeholder = "Selecione a Posição..." }) {
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
                className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${value ? 'border-blue-300 font-bold font-mono text-slate-900' : 'border-slate-200 text-slate-500'}`}
            >
                <span className="truncate">{selectedLocation ? selectedLocation.fullPath : placeholder}</span>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                    {value && (
                        <X
                            size={12}
                            className="text-slate-400 hover:text-rose-600 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange('ALL');
                            }}
                        />
                    )}
                    <Search size={14} className="text-slate-400" />
                </div>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Filtrar endereço..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                        />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1">
                        <div
                            onClick={() => { onChange('ALL'); setIsOpen(false); setSearchTerm(''); }}
                            className="px-2.5 py-1.5 rounded text-xs cursor-pointer hover:bg-slate-100 text-slate-500 italic"
                        >
                            Todas as Posições
                        </div>
                        {filteredLocations.map(loc => (
                            <div
                                key={loc.id}
                                onClick={() => { onChange(loc.id); setIsOpen(false); setSearchTerm(''); }}
                                className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between font-mono transition-colors ${value === loc.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'}`}
                            >
                                <span>{loc.fullPath}</span>
                                {value === loc.id && <CheckCircle2 size={12} className="text-blue-600" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function HandlingUnitsTab() {
    const queryClient = useQueryClient();

    // Filtros
    const [searchLpn, setSearchLpn] = useState('');
    const [searchBatch, setSearchBatch] = useState('');
    const [searchNfe, setSearchNfe] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');
    const [selectedProduct, setSelectedProduct] = useState('ALL');
    const [selectedLocation, setSelectedLocation] = useState('ALL');
    const [qualityFilter, setQualityFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [selectedHus, setSelectedHus] = useState([]);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    // Modais
    const [husToHold, setHusToHold] = useState(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [husToMove, setHusToMove] = useState([]);
    const [targetLocationId, setTargetLocationId] = useState('');
    const [isMoving, setIsMoving] = useState(false);
    const [locationTypeTab, setLocationTypeTab] = useState('storage');

    // Estorno de HUs
    const [husToRollback, setHusToRollback] = useState(null);
    const [isRollingBack, setIsRollingBack] = useState(false);

    // APIs
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 100 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const { data: productsData } = useGetApiProducts({ PageSize: 100 });
    const products = productsData?.items || (Array.isArray(productsData) ? productsData : []);

    const { data: storageLocations = [] } = useGetApiTopologyLocationsStorage();
    const [qualityLocations, setQualityLocations] = useState([]);

    useEffect(() => {
        customInstance({ url: '/api/topology/locations/quality', method: 'GET' })
            .then(res => setQualityLocations(Array.isArray(res) ? res : []))
            .catch(() => setQualityLocations([]));
    }, []);

    const allTopologyLocations = useMemo(() => [...storageLocations, ...qualityLocations], [storageLocations, qualityLocations]);

    // Trata formatação de datas (00:00:00 até 23:59:59)
    const formattedStartDate = useMemo(() => {
        if (!startDate) return undefined;
        return new Date(`${startDate}T00:00:00.000`).toISOString();
    }, [startDate]);

    const formattedEndDate = useMemo(() => {
        if (!endDate) return undefined;
        return new Date(`${endDate}T23:59:59.999`).toISOString();
    }, [endDate]);

    const queryParams = {
        Page: page,
        PageSize: PAGE_SIZE,
        ...(searchLpn.trim() && { Lpn: searchLpn.trim() }),
        ...(searchBatch.trim() && { Batch: searchBatch.trim() }),
        ...(searchNfe.trim() && { NfeNumber: searchNfe.trim() }),
        ...(selectedCustomer !== 'ALL' && { CustomerId: selectedCustomer }),
        ...(selectedProduct !== 'ALL' && { ProductId: selectedProduct }),
        ...(selectedLocation !== 'ALL' && { LocationId: selectedLocation }),
        ...(statusFilter !== 'ALL' && { Status: Number(statusFilter) }),
        ...(qualityFilter !== 'ALL' && { QualityStatus: Number(qualityFilter) }),
        ...(formattedStartDate && { StartDate: formattedStartDate }),
        ...(formattedEndDate && { EndDate: formattedEndDate })
    };

    const { data: apiResponse, isLoading, isFetching, refetch } = useGetApiInventoryHandlingUnits(queryParams);
    const hus = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);
    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const toggleSelectAll = () => {
        if (selectedHus.length === hus.length) setSelectedHus([]);
        else setSelectedHus(hus);
    };

    const toggleSelectHu = (hu) => {
        setSelectedHus(prev => prev.some(h => h.id === hu.id) ? prev.filter(h => h.id !== hu.id) : [...prev, hu]);
    };

    const handleOpenMoveModal = (targetHus) => {
        setHusToMove(targetHus);
        setTargetLocationId('');
        const hasQualityRestriction = targetHus.some(h => String(h.qualityStatus) !== '1' && String(h.qualityStatus) !== 'Available');
        setLocationTypeTab(hasQualityRestriction ? 'quality' : 'storage');
        setIsMoveModalOpen(true);
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
                data: { handlingUnitIds: huIds, destinationLocationId: targetLocationId }
            });

            toast.success(res?.message || 'Movimentação concluída!');
            await refetch();
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
            queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
            setSelectedHus(prev => prev.filter(h => !huIds.includes(h.id)));
            setHusToRollback(null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao realizar o estorno das HUs.');
        } finally {
            setIsRollingBack(false);
        }
    };

    const handleExport = () => {
        downloadBackendCsv('/api/inventory/handling-units/export', queryParams, 'unidades_manuseio_hus');
    };

    const renderQualityBadge = (qualityStatus) => {
        const statusStr = String(qualityStatus);
        if (statusStr === '1' || statusStr === 'Available') return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Liberado</Badge>;
        if (statusStr === '2' || statusStr === 'Quarantine') return <Badge className="bg-amber-100 text-amber-800 border-amber-200 flex items-center gap-1"><ShieldAlert size={12} /> Quarentena</Badge>;
        if (statusStr === '3' || statusStr === 'Damaged') return <Badge className="bg-rose-100 text-rose-800 border-rose-200 flex items-center gap-1"><AlertTriangle size={12} /> Avariado</Badge>;
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Divergência / Falta</Badge>;
    };

    const renderHuStatusBadge = (status) => {
        const statusStr = String(status);
        switch (statusStr) {
            case 'Received': case '2': return <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-mono text-[10px] font-bold">Na Doca</Badge>;
            case 'Stored': case '3': return <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 font-mono text-[10px]">Armazenado</Badge>;
            case 'Picking': case '4': case 'Staged': case '5': return <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 font-mono text-[10px]">Em Expedição</Badge>;
            case 'Shipped': case '6': return <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 font-mono text-[10px]">Expedido</Badge>;
            case 'Consumed': case '7': return <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300 font-mono text-[10px]">Consumido</Badge>;
            default: return <Badge variant="outline" className="font-mono text-[10px]">{statusStr}</Badge>;
        }
    };

    const isSelectedRestricted = selectedHus.some(h => String(h.qualityStatus) !== '1' && String(h.qualityStatus) !== 'Available');

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex flex-col overflow-hidden h-full">
            {/* CABEÇALHO COM AÇÕES EM LOTE */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 font-mono uppercase">Filtros Avançados</span>
                        {selectedHus.length > 0 && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-mono">
                                {selectedHus.length} selecionada(s)
                            </Badge>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* AÇÕES EM LOTE */}
                        <Button
                            onClick={() => setHusToHold(selectedHus)}
                            disabled={selectedHus.length === 0}
                            variant="outline"
                            className="border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 text-xs font-semibold h-9"
                        >
                            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" /> Avaria ({selectedHus.length})
                        </Button>

                        <Button
                            onClick={() => handleOpenMoveModal(selectedHus)}
                            disabled={selectedHus.length === 0}
                            variant="outline"
                            className="text-xs font-semibold h-9"
                        >
                            <MapPin className="w-3.5 h-3.5 mr-1 text-blue-600" /> Mover ({selectedHus.length})
                        </Button>

                        <Button
                            onClick={() => setHusToRollback(selectedHus)}
                            disabled={selectedHus.length === 0}
                            variant="outline"
                            className="border-rose-300 text-rose-800 bg-rose-50 hover:bg-rose-100 text-xs font-semibold h-9"
                        >
                            <Undo2 className="w-3.5 h-3.5 mr-1 text-rose-600" /> Estornar ({selectedHus.length})
                        </Button>

                        <Button
                            onClick={() => setIsPrintModalOpen(true)}
                            disabled={selectedHus.length === 0}
                            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-9"
                        >
                            <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir ({selectedHus.length})
                        </Button>

                        <Button onClick={handleExport} variant="outline" size="sm" disabled={totalCount === 0} className="bg-white border-slate-200 text-slate-700 text-xs h-9">
                            <Download className="mr-1 h-3.5 w-3.5" /> CSV
                        </Button>
                    </div>
                </div>

                {/* GRID RESPONSIVO DE FILTROS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
                    {/* LPN */}
                    <div className="relative col-span-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="LPN..."
                            value={searchLpn}
                            onChange={(e) => { setSearchLpn(e.target.value); setPage(1); }}
                            className="pl-8 bg-white text-xs h-9 font-mono"
                        />
                    </div>

                    {/* LOTE */}
                    <div className="col-span-1">
                        <Input
                            placeholder="Lote Físico..."
                            value={searchBatch}
                            onChange={(e) => { setSearchBatch(e.target.value); setPage(1); }}
                            className="bg-white text-xs h-9 font-mono"
                        />
                    </div>

                    {/* NF-E */}
                    <div className="relative col-span-1">
                        <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="NF-e / Chave..."
                            value={searchNfe}
                            onChange={(e) => { setSearchNfe(e.target.value); setPage(1); }}
                            className="pl-8 bg-white text-xs h-9 font-mono"
                        />
                    </div>

                    {/* ENDEREÇO COMPLETO (POSIÇÃO UNIFICADA) */}
                    <div className="col-span-1 sm:col-span-2">
                        <SearchableLocationSelect
                            value={selectedLocation}
                            onChange={(locId) => { setSelectedLocation(locId); setPage(1); }}
                            locations={allTopologyLocations}
                            placeholder="Pesquisar Endereço/Posição..."
                        />
                    </div>

                    {/* DEPOSITANTE */}
                    <div className="col-span-1">
                        <Select value={selectedCustomer} onValueChange={(v) => { setSelectedCustomer(v); setPage(1); }}>
                            <SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="Depositante" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos Depositantes</SelectItem>
                                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* SKU */}
                    <div className="col-span-1">
                        <Select value={selectedProduct} onValueChange={(v) => { setSelectedProduct(v); setPage(1); }}>
                            <SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="SKU Produto" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os SKUs</SelectItem>
                                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.sku}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* QUALIDADE */}
                    <div className="col-span-1">
                        <Select value={qualityFilter} onValueChange={(v) => { setQualityFilter(v); setPage(1); }}>
                            <SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="Qualidade" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todas Qualidades</SelectItem>
                                <SelectItem value="1">Liberado</SelectItem>
                                <SelectItem value="2">Quarentena</SelectItem>
                                <SelectItem value="3">Avariado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* STATUS HU */}
                    <div className="col-span-1">
                        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                            <SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="Status HU" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Status</SelectItem>
                                <SelectItem value="2">Na Doca</SelectItem>
                                <SelectItem value="3">Armazenado</SelectItem>
                                <SelectItem value="6">Expedido</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* FILTRO DE DATAS DE ENTRADA (00:00 ÀS 23:59) */}
                    <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-2 xl:col-span-2 flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 h-9">
                        <Calendar size={14} className="text-slate-400 shrink-0" />
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                            className="border-none shadow-none text-xs h-7 p-0 w-28 bg-transparent font-mono"
                        />
                        <span className="text-slate-300 text-xs">até</span>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                            className="border-none shadow-none text-xs h-7 p-0 w-28 bg-transparent font-mono"
                        />
                    </div>
                </div>
            </div>

            {/* TABELA DE HUS */}
            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 backdrop-blur-sm">
                        <TableRow>
                            <TableHead className="w-[40px]">
                                <Checkbox
                                    checked={hus.length > 0 && selectedHus.length === hus.length}
                                    onCheckedChange={toggleSelectAll}
                                />
                            </TableHead>
                            <TableHead>LPN / Unidade</TableHead>
                            <TableHead>Depositante / SKU</TableHead>
                            <TableHead>Data Entrada</TableHead>
                            <TableHead>NF-e / Série</TableHead>
                            <TableHead>Endereço Atual</TableHead>
                            <TableHead>Lote / Validade</TableHead>
                            <TableHead className="text-right">Qtd Atual</TableHead>
                            <TableHead>Qualidade</TableHead>
                            <TableHead>Status HU</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading || isFetching ? (
                            <TableRow><TableCell colSpan={11} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : hus.length === 0 ? (
                            <TableRow><TableCell colSpan={11} className="h-32 text-center text-slate-500">Nenhuma HU encontrada.</TableCell></TableRow>
                        ) : hus.map((h) => {
                            const isSelected = selectedHus.some(x => x.id === h.id);
                            const isQualityRestricted = String(h.qualityStatus) !== 'Available' && String(h.qualityStatus) !== '1';

                            return (
                                <TableRow key={h.id} className={isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/50'}>
                                    <TableCell>
                                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectHu(h)} />
                                    </TableCell>

                                    {/* LPN */}
                                    <TableCell>
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                                <Layers size={16} />
                                            </div>
                                            <span className="font-bold font-mono text-slate-900 text-xs">{h.lpn}</span>
                                        </div>
                                    </TableCell>

                                    {/* SKU / DEPOSITANTE */}
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-800 text-xs font-mono">{h.productSku}</span>
                                            <span className="text-[10px] text-slate-400">{h.customerName}</span>
                                        </div>
                                    </TableCell>

                                    {/* DATA ENTRADA */}
                                    <TableCell className="text-xs font-mono text-slate-600">
                                        {h.createdAt ? new Date(h.createdAt).toLocaleString('pt-BR') : '-'}
                                    </TableCell>

                                    {/* NF-E / SÉRIIE */}
                                    <TableCell>
                                        {h.nfeNumber ? (
                                            <div className="flex flex-col">
                                                <span className="font-mono font-bold text-slate-800 text-xs">NF {h.nfeNumber}</span>
                                                <span className="text-[10px] text-slate-400 font-mono">Série {h.nfeSeries || '1'}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">S/N</span>
                                        )}
                                    </TableCell>

                                    {/* ENDEREÇO */}
                                    <TableCell>
                                        {h.locationPath ? (
                                            <Badge variant="outline" className="bg-slate-50 font-mono text-slate-700 text-[10px] gap-1">
                                                <MapPin size={12} className="text-blue-600" /> {h.locationPath}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Em Trânsito / Doca</span>
                                        )}
                                    </TableCell>

                                    {/* LOTE E VALIDADE */}
                                    <TableCell className="text-xs font-mono text-slate-600">
                                        <div>Lote: {h.batch || '-'}</div>
                                        <div>Val: {h.expirationDate ? new Date(h.expirationDate).toLocaleDateString('pt-BR') : '-'}</div>
                                    </TableCell>

                                    {/* QTD ATUAL */}
                                    <TableCell className="text-right font-mono font-bold text-slate-900 text-xs">
                                        {h.currentQuantity?.toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-slate-500">{h.packagingTypeCode}</span>
                                    </TableCell>

                                    <TableCell>{renderQualityBadge(h.qualityStatus)}</TableCell>
                                    <TableCell>{renderHuStatusBadge(h.status)}</TableCell>

                                    {/* AÇÕES INDIVIDUAIS */}
                                    <TableCell className="text-right space-x-1">
                                        {!isQualityRestricted && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                title="Registrar Avaria / Bloqueio"
                                                onClick={() => setHusToHold([h])}
                                                className="text-amber-600 hover:bg-amber-50"
                                            >
                                                <AlertTriangle size={14} />
                                            </Button>
                                        )}

                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            title="Mover Posição"
                                            onClick={() => handleOpenMoveModal([h])}
                                            className="text-blue-600 hover:bg-blue-50"
                                        >
                                            <MapPin size={14} />
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            title="Reimprimir Etiqueta"
                                            onClick={() => {
                                                setSelectedHus([h]);
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
                                            onClick={() => setHusToRollback([h])}
                                            className="text-rose-600 hover:bg-rose-50"
                                        >
                                            <Undo2 size={14} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {totalCount > 0 && (
                <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0 text-xs text-slate-500">
                    <span>Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} HUs</span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                        <span className="text-xs font-mono self-center text-slate-600 px-1">Página {page} de {totalPages || 1}</span>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                    </div>
                </div>
            )}

            {/* MODAL DE MOVIMENTAÇÃO */}
            <Dialog open={isMoveModalOpen} onOpenChange={setIsMoveModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <MapPin className="text-blue-600" size={20} /> Mover no Estoque
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Selecione a posição de destino para {husToMove.length} HU(s).
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {isSelectedRestricted ? (
                            <div className="p-3 rounded-lg border bg-rose-50 border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-medium">
                                <ShieldAlert size={18} className="shrink-0 text-rose-600" />
                                <span>Volumes com restrição só podem ser movimentados para posições do tipo <strong>Qualidade</strong>.</span>
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
                            <label className="text-xs font-semibold text-slate-700">Endereço Destino *</label>
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
                            Confirmar Movimento
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* MODAL DE APONTAMENTO DE AVARIA */}
            {husToHold && husToHold.length > 0 && (
                <RegisterHoldModal
                    open={!!husToHold && husToHold.length > 0}
                    onOpenChange={(open) => !open && setHusToHold(null)}
                    hus={husToHold}
                    onSuccess={() => {
                        refetch();
                        setSelectedHus([]);
                    }}
                />
            )}

            {/* MODAL DE IMPRESSÃO */}
            {isPrintModalOpen && (
                <PrintHuModal
                    open={isPrintModalOpen}
                    onOpenChange={setIsPrintModalOpen}
                    husToPrint={selectedHus}
                />
            )}

            {/* CONFIRMAÇÃO DE ESTORNO DE HUs */}
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
        </div>
    );
}