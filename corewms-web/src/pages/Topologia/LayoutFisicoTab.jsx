import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
    useGetApiTopologyWarehouses, usePostApiTopologyWarehouses, usePutApiTopologyWarehousesId, useDeleteApiTopologyWarehousesId,
    useGetApiTopologyZonesWarehouseId, usePostApiTopologyZones, usePutApiTopologyZonesId, useDeleteApiTopologyZonesId,
    useGetApiTopologyLocationsZoneId, usePostApiTopologyLocations, usePutApiTopologyLocationsId, useDeleteApiTopologyLocationsId,
    useGetApiTopologyStorageTypes, usePostApiTopologyLocationsImport
} from '@/api/generated/topology/topology';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, Trash2, Building, MapPin, BoxSelect, ChevronRight, FileSpreadsheet, Download, UploadCloud, AlertCircle, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

// Schemas Zod Simplificados
const warehouseSchema = z.object({ code: z.string().min(1), name: z.string().min(1), clearanceHeight: z.coerce.number().min(0.1) });
const zoneSchema = z.object({ code: z.string().min(1), name: z.string().min(1) });
const locationSchema = z.object({
    code: z.string().min(1), storageTypeId: z.string().min(1), baseCapacity: z.coerce.number().min(1), isActive: z.boolean().default(true)
});

export default function LayoutFisicoTab() {
    const queryClient = useQueryClient();

    // Estados
    const [selectedWarehouse, setSelectedWarehouse] = useState(null);
    const [selectedZone, setSelectedZone] = useState(null);
    const [modalConfig, setModalConfig] = useState({ open: false, type: null, data: null });
    const [deleteConfig, setDeleteConfig] = useState({ open: false, type: null, data: null });

    // Estados do Modal de Importação
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importResult, setImportResult] = useState(null);

    // Estados de Filtro e Simulação
    const [searchLocation, setSearchLocation] = useState('');
    const [filterType, setFilterType] = useState('ALL');
    const [simulatedPalletHeight, setSimulatedPalletHeight] = useState('1.5');

    // Estado da Paginação
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;

    // Queries (Passando o simulatedPalletHeight para recalcular os DTOs em tempo real)
    const { data: warehouses = [], isLoading: loadingWarehouses } = useGetApiTopologyWarehouses({ palletHeight: parseFloat(simulatedPalletHeight) || 1.5 });
    const { data: storageTypes = [] } = useGetApiTopologyStorageTypes();

    const { data: zones = [], isLoading: loadingZones } = useGetApiTopologyZonesWarehouseId(
        selectedWarehouse?.id,
        { palletHeight: parseFloat(simulatedPalletHeight) || 1.5 },
        { query: { enabled: !!selectedWarehouse } }
    );

    const { data: locations = [], isLoading: loadingLocations } = useGetApiTopologyLocationsZoneId(
        selectedZone?.id,
        { palletHeight: parseFloat(simulatedPalletHeight) || 1.5 },
        { query: { enabled: !!selectedZone } }
    );

    // Forms
    const { register: regW, handleSubmit: submitW, reset: resetW } = useForm({ resolver: zodResolver(warehouseSchema) });
    const { register: regZ, handleSubmit: submitZ, reset: resetZ } = useForm({ resolver: zodResolver(zoneSchema) });
    const { register: regL, handleSubmit: submitL, reset: resetL, setValue: setLValue, watch: watchL } = useForm({ resolver: zodResolver(locationSchema), defaultValues: { isActive: true } });

    // Resetar a página ao filtrar ou mudar a zona
    useEffect(() => {
        setPage(1);
    }, [searchLocation, filterType, selectedZone, simulatedPalletHeight]);

    useEffect(() => {
        if (!modalConfig.open) return;
        if (modalConfig.type === 'warehouse') resetW(modalConfig.data || { code: '', name: '', clearanceHeight: '' });
        if (modalConfig.type === 'zone') resetZ(modalConfig.data || { code: '', name: '' });
        if (modalConfig.type === 'location') resetL(modalConfig.data || { code: '', storageTypeId: '', baseCapacity: 1, isActive: true });
    }, [modalConfig, resetW, resetZ, resetL]);

    // Mutações
    const mPostW = usePostApiTopologyWarehouses({ mutation: { onSuccess: () => { toast.success('Criado!'); setModalConfig({ open: false, type: null, data: null }); queryClient.invalidateQueries({ queryKey: ['/api/topology/warehouses'] }); }, onError: (e) => toast.error(e.response?.data?.message || 'Erro!') } });
    const mPutW = usePutApiTopologyWarehousesId({ mutation: { onSuccess: () => { toast.success('Atualizado!'); setModalConfig({ open: false, type: null, data: null }); queryClient.invalidateQueries({ queryKey: ['/api/topology/warehouses'] }); }, onError: (e) => toast.error(e.response?.data?.message || 'Erro!') } });
    const mDelW = useDeleteApiTopologyWarehousesId({ mutation: { onSuccess: () => { toast.success('Excluído!'); setDeleteConfig({ open: false, type: null, data: null }); queryClient.invalidateQueries({ queryKey: ['/api/topology/warehouses'] }); setSelectedWarehouse(null); }, onError: (e) => toast.error(e.response?.data?.message || 'Erro!') } });

    const mPostZ = usePostApiTopologyZones({ mutation: { onSuccess: () => { toast.success('Criado!'); setModalConfig({ open: false, type: null, data: null }); queryClient.invalidateQueries({ queryKey: [`/api/topology/zones/${selectedWarehouse.id}`] }); }, onError: (e) => toast.error(e.response?.data?.message || 'Erro!') } });
    const mPutZ = usePutApiTopologyZonesId({ mutation: { onSuccess: () => { toast.success('Atualizado!'); setModalConfig({ open: false, type: null, data: null }); queryClient.invalidateQueries({ queryKey: [`/api/topology/zones/${selectedWarehouse.id}`] }); }, onError: (e) => toast.error(e.response?.data?.message || 'Erro!') } });
    const mDelZ = useDeleteApiTopologyZonesId({ mutation: { onSuccess: () => { toast.success('Excluído!'); setDeleteConfig({ open: false, type: null, data: null }); queryClient.invalidateQueries({ queryKey: [`/api/topology/zones/${selectedWarehouse.id}`] }); setSelectedZone(null); }, onError: (e) => toast.error(e.response?.data?.message || 'Erro!') } });

    const mPostL = usePostApiTopologyLocations({ mutation: { onSuccess: () => { toast.success('Criado!'); setModalConfig({ open: false, type: null, data: null }); queryClient.invalidateQueries({ queryKey: [`/api/topology/locations/${selectedZone.id}`] }); }, onError: (e) => toast.error(e.response?.data?.message || 'Erro!') } });
    const mPutL = usePutApiTopologyLocationsId({ mutation: { onSuccess: () => { toast.success('Atualizado!'); setModalConfig({ open: false, type: null, data: null }); queryClient.invalidateQueries({ queryKey: [`/api/topology/locations/${selectedZone.id}`] }); }, onError: (e) => toast.error(e.response?.data?.message || 'Erro!') } });
    const mDelL = useDeleteApiTopologyLocationsId({ mutation: { onSuccess: () => { toast.success('Excluído!'); setDeleteConfig({ open: false, type: null, data: null }); queryClient.invalidateQueries({ queryKey: [`/api/topology/locations/${selectedZone.id}`] }); }, onError: (e) => toast.error(e.response?.data?.message || 'Erro!') } });

    const mImport = usePostApiTopologyLocationsImport({
        mutation: {
            onSuccess: (data) => {
                toast.success('Arquivo processado!');
                setImportResult(data);
                if (selectedZone) {
                    queryClient.invalidateQueries({ queryKey: [`/api/topology/locations/${selectedZone.id}`] });
                }
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Falha ao processar o arquivo.')
        }
    });

    const handleSave = (data) => {
        if (modalConfig.type === 'warehouse') modalConfig.data ? mPutW.mutate({ id: modalConfig.data.id, data }) : mPostW.mutate({ data });
        if (modalConfig.type === 'zone') modalConfig.data ? mPutZ.mutate({ id: modalConfig.data.id, data }) : mPostZ.mutate({ data: { ...data, warehouseId: selectedWarehouse.id } });
        if (modalConfig.type === 'location') modalConfig.data ? mPutL.mutate({ id: modalConfig.data.id, data }) : mPostL.mutate({ data: { ...data, zoneId: selectedZone.id } });
    };

    const handleDelete = () => {
        if (deleteConfig.type === 'warehouse') mDelW.mutate({ id: deleteConfig.data.id });
        if (deleteConfig.type === 'zone') mDelZ.mutate({ id: deleteConfig.data.id });
        if (deleteConfig.type === 'location') mDelL.mutate({ id: deleteConfig.data.id });
    };

    const handleDownloadTemplate = () => {
        const url = `${import.meta.env.VITE_API_URL}/api/topology/locations/template`;
        const authStore = JSON.parse(localStorage.getItem('corewms-auth') || '{}');
        const token = authStore?.state?.token;

        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => res.blob())
            .then(blob => {
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                link.download = "Modelo_Enderecos.csv";
                link.click();
            })
            .catch(() => toast.error('Erro ao baixar o modelo.'));
    };

    const handleExecuteImport = () => {
        if (!importFile) return;
        setImportResult(null);
        mImport.mutate({ data: { file: importFile } });
    };

    const isSaving = mPostW.isPending || mPutW.isPending || mPostZ.isPending || mPutZ.isPending || mPostL.isPending || mPutL.isPending;

    // Filtros e Paginação
    const filteredLocations = locations.filter(l => {
        const matchSearch = l.fullPath.toLowerCase().includes(searchLocation.toLowerCase());
        const matchType = filterType === 'ALL' || l.storageTypeId === filterType;
        return matchSearch && matchType;
    });

    const totalItems = filteredLocations.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    const paginatedLocations = filteredLocations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    // Totais consolidados globais
    const totalGlobalEstimated = warehouses.reduce((sum, w) => sum + (w.totalEstimatedCapacity || 0), 0);

    return (
        <div className="flex h-full gap-4">

            {/* ÁRVORE LATERAL */}
            <div className="w-1/3 min-w-[300px] flex flex-col bg-white border border-slate-200/60 rounded-xl shadow-sm min-h-0">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                    <div>
                        <h3 className="font-semibold text-slate-800 text-sm">Pavilhões</h3>
                        <p className="text-[10px] text-slate-500 uppercase mt-0.5">Total CD: <span className="font-bold text-blue-600">{totalGlobalEstimated} pos</span></p>
                    </div>
                    <Button size="sm" onClick={() => setModalConfig({ open: true, type: 'warehouse', data: null })} className="bg-slate-900 text-white h-7 px-2 text-xs"><Plus className="w-3 h-3 mr-1" /> Pavilhão</Button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {loadingWarehouses && <Loader2 className="w-5 h-5 animate-spin mx-auto mt-4 text-blue-600" />}
                    {warehouses.map(w => (
                        <div key={w.id} className="border border-slate-100 rounded-lg overflow-hidden bg-white">
                            <div
                                onClick={() => { setSelectedWarehouse(w); setSelectedZone(null); }}
                                className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${selectedWarehouse?.id === w.id ? 'bg-blue-50 border-b border-blue-100' : 'hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <Building className={`w-4 h-4 ${selectedWarehouse?.id === w.id ? 'text-blue-600' : 'text-slate-400'}`} />
                                    <div className="flex flex-col">
                                        <span className={`text-sm font-semibold ${selectedWarehouse?.id === w.id ? 'text-blue-900' : 'text-slate-700'}`}>{w.code}</span>
                                        <span className="text-[10px] text-slate-500 uppercase">
                                            {w.name} ({w.clearanceHeight}m livre) • <span className="font-bold text-emerald-600">{w.totalEstimatedCapacity} pos</span>
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <button onClick={(e) => { e.stopPropagation(); setModalConfig({ open: true, type: 'warehouse', data: w }); }} className="p-1.5 text-slate-400 hover:text-blue-600"><Edit size={14} /></button>
                                    {selectedWarehouse?.id !== w.id && <ChevronRight size={16} className="text-slate-300 ml-1" />}
                                </div>
                            </div>

                            {/* RENDERIZAÇÃO DAS ZONAS */}
                            {selectedWarehouse?.id === w.id && (
                                <div className="bg-slate-50/50 p-2 border-t border-blue-50">
                                    {loadingZones ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-blue-600 my-2" /> : zones.map(z => (
                                        <div
                                            key={z.id}
                                            onClick={() => setSelectedZone(z)}
                                            className={`p-2 flex items-center justify-between text-sm rounded-md cursor-pointer mb-1 ${selectedZone?.id === z.id ? 'bg-white shadow-sm border border-blue-200 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium flex items-center gap-2"><MapPin size={14} /> {z.code} - {z.name}</span>
                                                <span className="text-[10px] text-slate-500 ml-5">{z.totalEstimatedCapacity} posições</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); setModalConfig({ open: true, type: 'zone', data: z }); }} className="p-1 hover:text-blue-600"><Edit size={12} /></button>
                                        </div>
                                    ))}
                                    <Button variant="ghost" size="sm" onClick={() => setModalConfig({ open: true, type: 'zone', data: null })} className="w-full text-xs text-blue-600 hover:bg-blue-50 mt-1 h-7">
                                        <Plus className="w-3 h-3 mr-1" /> Nova Zona
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* ÁREA DIREITA */}
            <div className="flex-1 bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col min-h-0">
                {!selectedZone ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <BoxSelect className="w-12 h-12 mb-3 opacity-20" />
                        <p>Selecione ou crie uma Zona à esquerda para gerenciar os endereços físicos.</p>
                        <Button variant="outline" className="mt-4 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => setIsImportModalOpen(true)}>
                            <FileSpreadsheet className="w-4 h-4 mr-2" /> Importação em Massa (Planilha CSV)
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <div>
                                <h3 className="font-semibold text-slate-800 text-sm">Posições (Boxes/Endereços)</h3>
                                <p className="text-[10px] font-mono text-slate-500 uppercase mt-0.5">{selectedWarehouse.code} &gt; {selectedZone.code}</p>
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => setIsImportModalOpen(true)} className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 h-7 px-3 text-xs"><FileSpreadsheet className="w-3 h-3 mr-1" /> Planilha</Button>
                                <Button size="sm" onClick={() => setModalConfig({ open: true, type: 'location', data: null })} className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-3 text-xs"><Plus className="w-3 h-3 mr-1" /> Criar Manual</Button>
                            </div>
                        </div>

                        {/* BARRA DE PESQUISA E SIMULAÇÃO */}
                        <div className="p-3 border-b border-slate-100 bg-white flex gap-3 items-center shrink-0">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar código final..."
                                    value={searchLocation}
                                    onChange={(e) => setSearchLocation(e.target.value)}
                                    className="pl-8 h-8 text-xs bg-slate-50"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-slate-400" />
                                <Select value={filterType} onValueChange={setFilterType}>
                                    <SelectTrigger className="h-8 text-xs w-[180px] bg-slate-50">
                                        <SelectValue placeholder="Todos os Tipos" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Todos os Tipos</SelectItem>
                                        {storageTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Simulador de Pé Direito */}
                            <div className="flex items-center gap-2 border-l border-slate-200 pl-3 ml-auto">
                                <Label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Alt. Palete Simulação (m)</Label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    value={simulatedPalletHeight}
                                    onChange={(e) => setSimulatedPalletHeight(e.target.value)}
                                    className="w-16 h-8 text-xs bg-blue-50 border-blue-200 font-bold text-center"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto">
                            <Table>
                                <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead className="w-[180px]">Código Final (Etiqueta)</TableHead>
                                        <TableHead>Tipo de Armazenagem</TableHead>
                                        <TableHead className="w-[200px]">Capacidade (Estimada)</TableHead>
                                        <TableHead className="w-[100px] text-center">Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loadingLocations ? (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                                    ) : paginatedLocations.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">Nenhum endereço listado.</TableCell></TableRow>
                                    ) : paginatedLocations.map(l => (
                                        <TableRow key={l.id}>
                                            <TableCell className="font-mono text-sm font-semibold text-slate-900">{l.fullPath}</TableCell>
                                            <TableCell><Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-default">{l.storageTypeName}</Badge></TableCell>

                                            <TableCell>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-semibold text-slate-800 text-xs">{l.baseCapacity} posições (Chão)</span>
                                                    <span className="text-[10px] text-blue-600 font-medium">
                                                        Máx {l.maxCapacity} pos. ({l.clearanceHeight}m pé direito)
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell className="text-center">{l.isActive ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Ativo</Badge> : <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Inativo</Badge>}</TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="icon" onClick={() => setModalConfig({ open: true, type: 'location', data: l })} className="text-blue-600 w-8 h-8"><Edit className="w-4 h-4" /></Button>
                                                <Button variant="ghost" size="icon" onClick={() => setDeleteConfig({ open: true, type: 'location', data: l })} className="text-rose-600 w-8 h-8"><Trash2 className="w-4 h-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {/* PAGINAÇÃO FIXA NO RODAPÉ */}
                        {totalItems > 0 && (
                            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                                <span className="text-xs text-slate-500 font-medium">
                                    Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalItems)} de {totalItems} posições
                                </span>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ========================================================================================= */}
            {/* MODAL GLOBAL PARA CRIAR/EDITAR (DINÂMICO CONFORME O TYPE) */}
            <Dialog open={modalConfig.open} onOpenChange={(v) => !v && setModalConfig({ open: false, type: null, data: null })}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle>
                            {modalConfig.data ? 'Editar ' : 'Novo '}
                            {modalConfig.type === 'warehouse' ? 'Pavilhão' : modalConfig.type === 'zone' ? 'Corredor/Zona' : 'Endereço Físico'}
                        </DialogTitle>
                    </DialogHeader>

                    {modalConfig.type === 'warehouse' && (
                        <form onSubmit={submitW(handleSave)} className="space-y-4 py-2">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1.5 col-span-1"><Label>Código *</Label><Input {...regW('code')} placeholder="Ex: P1" disabled={!!modalConfig.data} className="font-mono uppercase" /></div>
                                <div className="space-y-1.5 col-span-2"><Label>Nome / Descrição *</Label><Input {...regW('name')} placeholder="Ex: Galpão Seco Principal" /></div>
                            </div>
                            <div className="space-y-1.5"><Label>Pé Direito Livre (m) *</Label><Input type="number" step="0.1" {...regW('clearanceHeight')} /></div>
                            <DialogFooter><Button type="submit" disabled={isSaving} className="bg-slate-900 text-white">Salvar</Button></DialogFooter>
                        </form>
                    )}

                    {modalConfig.type === 'zone' && (
                        <form onSubmit={submitZ(handleSave)} className="space-y-4 py-2">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1.5 col-span-1"><Label>Código *</Label><Input {...regZ('code')} placeholder="Ex: C1" disabled={!!modalConfig.data} className="font-mono uppercase" /></div>
                                <div className="space-y-1.5 col-span-2"><Label>Descrição *</Label><Input {...regZ('name')} placeholder="Ex: Corredor de Químicos" /></div>
                            </div>
                            <DialogFooter><Button type="submit" disabled={isSaving} className="bg-slate-900 text-white">Salvar</Button></DialogFooter>
                        </form>
                    )}

                    {modalConfig.type === 'location' && (
                        <form onSubmit={submitL(handleSave)} className="space-y-4 py-2">
                            {!modalConfig.data && (
                                <div className="space-y-1.5"><Label>Código (Box/Posição) *</Label><Input {...regL('code')} placeholder="Ex: B01" className="font-mono uppercase" /></div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Regra/Tipo *</Label>
                                    <Select value={watchL('storageTypeId')} onValueChange={(v) => setLValue('storageTypeId', v)}>
                                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                        <SelectContent>{storageTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5"><Label>Capacidade Chão *</Label><Input type="number" {...regL('baseCapacity')} /></div>
                            </div>
                            {modalConfig.data && (
                                <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg bg-slate-50">
                                    <Label>Endereço Ativo</Label><Switch checked={watchL('isActive')} onCheckedChange={(v) => setLValue('isActive', v)} />
                                </div>
                            )}
                            <DialogFooter><Button type="submit" disabled={isSaving} className="bg-slate-900 text-white">Salvar Endereço</Button></DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {/* MODAL DE IMPORTAÇÃO (CSV) */}
            <Dialog open={isImportModalOpen} onOpenChange={(v) => { if (!mImport.isPending) setIsImportModalOpen(v); if (!v) { setImportFile(null); setImportResult(null); } }}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="text-emerald-600" /> Importação em Massa</DialogTitle>
                        <DialogDescription>
                            Crie múltiplos endereços físicos vinculando-os automaticamente aos Armazéns, Zonas e Tipos de Armazenamento.
                        </DialogDescription>
                    </DialogHeader>

                    {!importResult ? (
                        <div className="space-y-4 py-4">
                            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                <p className="text-xs text-emerald-800 font-medium mb-3">1. Baixe o modelo e preencha as colunas com os dados exatos (códigos e nomes) já cadastrados no WMS.</p>
                                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="w-full bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-100">
                                    <Download size={16} className="mr-2" /> Baixar Planilha Modelo (.csv)
                                </Button>
                            </div>

                            <div className="space-y-1.5">
                                <Label>2. Anexe a planilha preenchida (.csv)</Label>
                                <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${importFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-blue-300'}`}>
                                    <div className="flex flex-col items-center justify-center pt-3 pb-3">
                                        {importFile ? (
                                            <p className="text-sm font-semibold text-emerald-900">{importFile.name}</p>
                                        ) : (
                                            <>
                                                <UploadCloud className="w-6 h-6 mb-2 text-slate-400" />
                                                <p className="text-xs text-slate-600 font-medium">Clique ou arraste o arquivo CSV</p>
                                            </>
                                        )}
                                    </div>
                                    <input type="file" accept=".csv" disabled={mImport.isPending} className="hidden" onChange={(e) => setImportFile(e.target.files[0])} />
                                </label>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 py-4">
                            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <div className="text-center flex-1 border-r"><p className="text-2xl font-bold text-emerald-600">{importResult.inserted}</p><p className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Criados</p></div>
                                <div className="text-center flex-1 border-r"><p className="text-2xl font-bold text-blue-600">{importResult.updated}</p><p className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Atualizados</p></div>
                                <div className="text-center flex-1"><p className="text-2xl font-bold text-rose-600">{importResult.errors?.length || 0}</p><p className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Erros</p></div>
                            </div>
                            {importResult.errors?.length > 0 && (
                                <div className="space-y-2">
                                    <Label className="text-rose-700 flex items-center gap-1.5"><AlertCircle size={14} /> Detalhe dos Erros</Label>
                                    <div className="bg-rose-50 border border-rose-100 p-3 rounded-md max-h-40 overflow-y-auto">
                                        {importResult.errors.map((e, idx) => (
                                            <p key={idx} className="text-xs text-rose-800 font-mono mb-1 pb-1 border-b border-rose-100/50 last:border-0">{e}</p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {!importResult ? (
                            <>
                                <Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>Cancelar</Button>
                                <Button onClick={handleExecuteImport} disabled={!importFile || mImport.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]">
                                    {mImport.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : 'Processar Planilha'}
                                </Button>
                            </>
                        ) : (
                            <Button onClick={() => setIsImportModalOpen(false)} className="bg-slate-900 text-white w-full">Concluir</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ALERT DIALOG DE EXCLUSÃO */}
            <AlertDialog open={deleteConfig.open} onOpenChange={(v) => !v && setDeleteConfig({ open: false, type: null, data: null })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirma a exclusão?</AlertDialogTitle>
                        <AlertDialogDescription>Essa operação não poderá ser desfeita e pode ser bloqueada se houver dependências no banco.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-rose-600 text-white hover:bg-rose-700">Confirmar Exclusão</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}