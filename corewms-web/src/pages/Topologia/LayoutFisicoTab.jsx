import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
    useGetApiTopologyWarehouses, usePostApiTopologyWarehouses, usePutApiTopologyWarehousesId, useDeleteApiTopologyWarehousesId,
    useGetApiTopologyZonesWarehouseId, usePostApiTopologyZones, usePutApiTopologyZonesId, useDeleteApiTopologyZonesId,
    useGetApiTopologyLocationsZoneId, usePostApiTopologyLocations, usePutApiTopologyLocationsId, useDeleteApiTopologyLocationsId,
    useGetApiTopologyStorageTypes
} from '@/api/generated/topology/topology';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, Trash2, Building, MapPin, BoxSelect, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

// Schemas Zod
const warehouseSchema = z.object({ code: z.string().min(1), name: z.string().min(1), clearanceHeight: z.coerce.number().min(0.1) });
const zoneSchema = z.object({ code: z.string().min(1), name: z.string().min(1) });
const locationSchema = z.object({
    code: z.string().min(1), storageTypeId: z.string().min(1), baseCapacity: z.coerce.number().min(1),
    aisle: z.string().optional(), building: z.string().optional(), level: z.string().optional(), slot: z.string().optional(), isActive: z.boolean().default(true)
});

export default function LayoutFisicoTab() {
    const queryClient = useQueryClient();

    // Estados de Navegação
    const [selectedWarehouse, setSelectedWarehouse] = useState(null);
    const [selectedZone, setSelectedZone] = useState(null);

    // Controle de Modais
    const [modalConfig, setModalConfig] = useState({ open: false, type: null, data: null }); // type: 'warehouse' | 'zone' | 'location'
    const [deleteConfig, setDeleteConfig] = useState({ open: false, type: null, data: null });

    // Consultas API
    const { data: warehouses = [], isLoading: loadingWarehouses } = useGetApiTopologyWarehouses();
    const { data: storageTypes = [] } = useGetApiTopologyStorageTypes();

    // Zonas daquele armazém
    const { data: zones = [], isLoading: loadingZones } = useGetApiTopologyZonesWarehouseId(selectedWarehouse?.id, { query: { enabled: !!selectedWarehouse } });

    // Endereços daquela Zona
    const { data: locations = [], isLoading: loadingLocations } = useGetApiTopologyLocationsZoneId(selectedZone?.id, { query: { enabled: !!selectedZone } });

    // Forms
    const { register: regW, handleSubmit: submitW, reset: resetW } = useForm({ resolver: zodResolver(warehouseSchema) });
    const { register: regZ, handleSubmit: submitZ, reset: resetZ } = useForm({ resolver: zodResolver(zoneSchema) });
    const { register: regL, handleSubmit: submitL, reset: resetL, setValue: setLValue, watch: watchL } = useForm({ resolver: zodResolver(locationSchema), defaultValues: { isActive: true } });

    useEffect(() => {
        if (!modalConfig.open) return;
        if (modalConfig.type === 'warehouse') resetW(modalConfig.data || { code: '', name: '', clearanceHeight: '' });
        if (modalConfig.type === 'zone') resetZ(modalConfig.data || { code: '', name: '' });
        if (modalConfig.type === 'location') resetL(modalConfig.data || { code: '', storageTypeId: '', baseCapacity: 1, aisle: '', building: '', level: '', slot: '', isActive: true });
    }, [modalConfig, resetW, resetZ, resetL]);

    // Mutações de Escrita (Simplificadas para poupar código, ideal é criar constantes para isPending)
    const mPostW = usePostApiTopologyWarehouses({ onSuccess: () => { toast.success('Sucesso!'); setModalConfig({ open: false }); queryClient.invalidateQueries({ queryKey: ['/api/topology/warehouses'] }); } });
    const mPutW = usePutApiTopologyWarehousesId({ onSuccess: () => { toast.success('Sucesso!'); setModalConfig({ open: false }); queryClient.invalidateQueries({ queryKey: ['/api/topology/warehouses'] }); } });
    const mDelW = useDeleteApiTopologyWarehousesId({ onSuccess: () => { toast.success('Excluído!'); setDeleteConfig({ open: false }); queryClient.invalidateQueries({ queryKey: ['/api/topology/warehouses'] }); setSelectedWarehouse(null); } });

    const mPostZ = usePostApiTopologyZones({ onSuccess: () => { toast.success('Sucesso!'); setModalConfig({ open: false }); queryClient.invalidateQueries({ queryKey: [`/api/topology/zones/${selectedWarehouse.id}`] }); } });
    const mPutZ = usePutApiTopologyZonesId({ onSuccess: () => { toast.success('Sucesso!'); setModalConfig({ open: false }); queryClient.invalidateQueries({ queryKey: [`/api/topology/zones/${selectedWarehouse.id}`] }); } });
    const mDelZ = useDeleteApiTopologyZonesId({ onSuccess: () => { toast.success('Excluído!'); setDeleteConfig({ open: false }); queryClient.invalidateQueries({ queryKey: [`/api/topology/zones/${selectedWarehouse.id}`] }); setSelectedZone(null); } });

    const mPostL = usePostApiTopologyLocations({ onSuccess: () => { toast.success('Sucesso!'); setModalConfig({ open: false }); queryClient.invalidateQueries({ queryKey: [`/api/topology/locations/${selectedZone.id}`] }); } });
    const mPutL = usePutApiTopologyLocationsId({ onSuccess: () => { toast.success('Sucesso!'); setModalConfig({ open: false }); queryClient.invalidateQueries({ queryKey: [`/api/topology/locations/${selectedZone.id}`] }); } });
    const mDelL = useDeleteApiTopologyLocationsId({ onSuccess: () => { toast.success('Excluído!'); setDeleteConfig({ open: false }); queryClient.invalidateQueries({ queryKey: [`/api/topology/locations/${selectedZone.id}`] }); } });

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

    const isSaving = mPostW.isPending || mPutW.isPending || mPostZ.isPending || mPutZ.isPending || mPostL.isPending || mPutL.isPending;

    return (
        <div className="flex h-[calc(100vh-200px)] gap-4">

            {/* ÁRVORE LATERAL (WAREHOUSES E ZONES) */}
            <div className="w-1/3 min-w-[300px] flex flex-col bg-white border border-slate-200/60 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="font-semibold text-slate-800 text-sm">Pavilhões</h3>
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
                                        <span className="text-[10px] text-slate-500 uppercase">{w.name} ({w.clearanceHeight}m)</span>
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <button onClick={(e) => { e.stopPropagation(); setModalConfig({ open: true, type: 'warehouse', data: w }); }} className="p-1.5 text-slate-400 hover:text-blue-600"><Edit size={14} /></button>
                                    {selectedWarehouse?.id !== w.id && <ChevronRight size={16} className="text-slate-300 ml-1" />}
                                </div>
                            </div>

                            {/* RENDERIZAÇÃO DAS ZONAS SE O PAVILHÃO ESTIVER ABERTO */}
                            {selectedWarehouse?.id === w.id && (
                                <div className="bg-slate-50/50 p-2 border-t border-blue-50">
                                    {loadingZones ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-blue-600 my-2" /> : zones.map(z => (
                                        <div
                                            key={z.id}
                                            onClick={() => setSelectedZone(z)}
                                            className={`p-2 flex items-center justify-between text-sm rounded-md cursor-pointer mb-1 ${selectedZone?.id === z.id ? 'bg-white shadow-sm border border-blue-200 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
                                        >
                                            <span className="font-medium flex items-center gap-2"><MapPin size={14} /> {z.code} - {z.name}</span>
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

            {/* ÁREA DIREITA (LOCATIONS DA ZONA SELECIONADA) */}
            <div className="flex-1 bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden">
                {!selectedZone ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <BoxSelect className="w-12 h-12 mb-3 opacity-20" />
                        <p>Selecione ou crie uma Zona à esquerda para gerenciar os endereços físicos.</p>
                    </div>
                ) : (
                    <>
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="font-semibold text-slate-800 text-sm">Posições (Boxes/Endereços)</h3>
                                <p className="text-[10px] font-mono text-slate-500 uppercase mt-0.5">{selectedWarehouse.code} &gt; {selectedZone.code}</p>
                            </div>
                            <Button size="sm" onClick={() => setModalConfig({ open: true, type: 'location', data: null })} className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-3 text-xs"><Plus className="w-3 h-3 mr-1" /> Criar Endereço</Button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <Table>
                                <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead>Código Final (Etiqueta)</TableHead>
                                        <TableHead>Tipo de Armazenagem</TableHead>
                                        <TableHead>Capacidade (Chão)</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loadingLocations ? (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                                    ) : locations.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">Nenhum endereço cadastrado nesta zona.</TableCell></TableRow>
                                    ) : locations.map(l => (
                                        <TableRow key={l.id}>
                                            <TableCell className="font-mono text-sm font-semibold text-slate-900">{l.fullPath}</TableCell>
                                            <TableCell><Badge variant="secondary" className="bg-slate-100 text-slate-700">{l.storageTypeName}</Badge></TableCell>
                                            <TableCell>{l.baseCapacity} posições</TableCell>
                                            <TableCell>{l.isActive ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Ativo</Badge> : <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Inativo</Badge>}</TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button variant="ghost" size="sm" onClick={() => setModalConfig({ open: true, type: 'location', data: l })} className="text-blue-600"><Edit className="w-4 h-4" /></Button>
                                                <Button variant="ghost" size="sm" onClick={() => setDeleteConfig({ open: true, type: 'location', data: l })} className="text-rose-600"><Trash2 className="w-4 h-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                )}
            </div>

            {/* ========================================================================================= */}
            {/* MODAL GLOBAL PARA CRIAR/EDITAR (DINÂMICO CONFORME O TYPE) */}
            <Dialog open={modalConfig.open} onOpenChange={(v) => !v && setModalConfig({ open: false })}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle>
                            {modalConfig.data ? 'Editar ' : 'Novo '}
                            {modalConfig.type === 'warehouse' ? 'Pavilhão' : modalConfig.type === 'zone' ? 'Corredor/Zona' : 'Endereço Físico'}
                        </DialogTitle>
                    </DialogHeader>

                    {/* FORM WAREHOUSE */}
                    {modalConfig.type === 'warehouse' && (
                        <form onSubmit={submitW(handleSave)} className="space-y-4 py-2">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1.5 col-span-1">
                                    <Label>Código *</Label>
                                    <Input {...regW('code')} placeholder="Ex: P1" disabled={!!modalConfig.data} className="font-mono uppercase" />
                                </div>
                                <div className="space-y-1.5 col-span-2">
                                    <Label>Nome / Descrição *</Label>
                                    <Input {...regW('name')} placeholder="Ex: Galpão Seco Principal" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Pé Direito Livre (Metros) *</Label>
                                <Input type="number" step="0.1" {...regW('clearanceHeight')} placeholder="Ex: 10.5" />
                                <p className="text-[10px] text-slate-500">Usado para travar o limite de empilhamento de pallets.</p>
                            </div>
                            <DialogFooter><Button type="submit" disabled={isSaving} className="bg-slate-900 text-white">Salvar</Button></DialogFooter>
                        </form>
                    )}

                    {/* FORM ZONE */}
                    {modalConfig.type === 'zone' && (
                        <form onSubmit={submitZ(handleSave)} className="space-y-4 py-2">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1.5 col-span-1">
                                    <Label>Código *</Label>
                                    <Input {...regZ('code')} placeholder="Ex: C1" disabled={!!modalConfig.data} className="font-mono uppercase" />
                                </div>
                                <div className="space-y-1.5 col-span-2">
                                    <Label>Descrição *</Label>
                                    <Input {...regZ('name')} placeholder="Ex: Corredor de Químicos" />
                                </div>
                            </div>
                            <DialogFooter><Button type="submit" disabled={isSaving} className="bg-slate-900 text-white">Salvar</Button></DialogFooter>
                        </form>
                    )}

                    {/* FORM LOCATION */}
                    {modalConfig.type === 'location' && (
                        <form onSubmit={submitL(handleSave)} className="space-y-4 py-2">
                            {!modalConfig.data && (
                                <div className="space-y-1.5">
                                    <Label>Código (Box/Posição) *</Label>
                                    <Input {...regL('code')} placeholder="Ex: B01" className="font-mono uppercase" />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Regra/Tipo de Endereço *</Label>
                                    <Select value={watchL('storageTypeId')} onValueChange={(v) => setLValue('storageTypeId', v)}>
                                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                        <SelectContent>
                                            {storageTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Capacidade Chão (Footprint) *</Label>
                                    <Input type="number" {...regL('baseCapacity')} placeholder="Ex: 10" />
                                </div>
                            </div>

                            {/* Detalhes 3D só na criação */}
                            {!modalConfig.data && (
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-3">
                                    <Label className="text-xs text-slate-500">Coordenadas Cartesianas (Opcional - Porta-Pallets)</Label>
                                    <div className="grid grid-cols-4 gap-2">
                                        <Input {...regL('aisle')} placeholder="Rua" className="h-8 text-xs" />
                                        <Input {...regL('building')} placeholder="Prédio" className="h-8 text-xs" />
                                        <Input {...regL('level')} placeholder="Nível" className="h-8 text-xs" />
                                        <Input {...regL('slot')} placeholder="Vão" className="h-8 text-xs" />
                                    </div>
                                </div>
                            )}

                            {/* Status só na edição */}
                            {modalConfig.data && (
                                <div className="flex items-center justify-between p-3 border border-slate-100 rounded-lg bg-slate-50">
                                    <Label>Endereço Ativo para Operações</Label>
                                    <Switch checked={watchL('isActive')} onCheckedChange={(v) => setLValue('isActive', v)} />
                                </div>
                            )}

                            <DialogFooter><Button type="submit" disabled={isSaving} className="bg-slate-900 text-white">Salvar Endereço</Button></DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {/* ALERT DIALOG DE EXCLUSÃO */}
            <AlertDialog open={deleteConfig.open} onOpenChange={(v) => !v && setDeleteConfig({ open: false })}>
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