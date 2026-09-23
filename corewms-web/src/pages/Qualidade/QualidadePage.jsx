import { useState } from 'react';
import { useGetApiInventoryHandlingUnits } from '@/api/generated/inventory/inventory';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { customInstance } from '@/api/orval-mutator';
import { useQueryClient } from '@tanstack/react-query';

import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
    ShieldAlert, ShieldCheck, AlertTriangle, Search, Loader2,
    Layers, MapPin, CheckCircle2, Lock, Filter, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

export default function QualidadePage() {
    const queryClient = useQueryClient();

    // Filtros
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');
    const [selectedQuality, setSelectedQuality] = useState('BLOCKED_ONLY'); // BLOCKED_ONLY, Quarantine, Damaged, Virtual_Shortage, Available, ALL
    const [searchLpn, setSearchLpn] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;

    // Seleção Múltipla
    const [selectedHuIds, setSelectedHuIds] = useState([]);

    // Modal de Ação de Qualidade
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [targetStatus, setTargetStatus] = useState('Available'); // Available, Quarantine, Damaged, Virtual_Shortage
    const [reasonNote, setReasonNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Listas de Apoio
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    // Mapeamento de Filtro do Status de Qualidade para API
    const getQualityParam = () => {
        if (selectedQuality === 'ALL' || selectedQuality === 'BLOCKED_ONLY') return undefined;
        return selectedQuality;
    };

    const queryParams = {
        Lpn: searchLpn,
        Page: page,
        PageSize: PAGE_SIZE,
        ...(selectedCustomer !== 'ALL' && { CustomerId: selectedCustomer }),
        ...(getQualityParam() && { QualityStatus: getQualityParam() })
    };

    const { data: apiResponse, isLoading, isFetching } = useGetApiInventoryHandlingUnits(queryParams);
    const rawHus = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);

    // Se o filtro for "BLOCKED_ONLY", exibe itens diferentes de Available na tela
    const hus = selectedQuality === 'BLOCKED_ONLY'
        ? rawHus.filter(h => h.qualityStatus !== 'Available')
        : rawHus;

    const totalCount = apiResponse?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    // Seleção de Checkboxes
    const toggleSelectAll = (checked) => {
        if (checked) {
            setSelectedHuIds(hus.map(h => h.id));
        } else {
            setSelectedHuIds([]);
        }
    };

    const toggleSelectHu = (id, checked) => {
        setSelectedHuIds(prev => checked ? [...prev, id] : prev.filter(i => i !== id));
    };

    // Submeter Alteração de Qualidade
    const handleExecuteQualityAction = async () => {
        if (selectedHuIds.length === 0) return;

        try {
            setIsSubmitting(true);
            const payload = {
                handlingUnitIds: selectedHuIds,
                newStatus: targetStatus,
                reason: reasonNote.trim()
            };

            await customInstance({
                url: '/api/inventory/handling-units/quality',
                method: 'POST',
                data: payload
            });

            toast.success(`Qualidade atualizada com sucesso para ${selectedHuIds.length} item(ns)!`);
            queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
            setSelectedHuIds([]);
            setIsActionModalOpen(false);
            setReasonNote('');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao alterar status de qualidade.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openModalWithStatus = (status) => {
        setTargetStatus(status);
        setIsActionModalOpen(true);
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <ShieldAlert className="text-amber-600" size={26} /> Inspeção & Controle de Qualidade
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gerencie quarentenas, avarias e liberações técnicas de mercadorias no estoque.
                    </p>
                </div>

                {selectedHuIds.length > 0 && (
                    <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                        <Badge className="bg-slate-900 text-white px-3 py-1.5 text-xs">
                            {selectedHuIds.length} selecionado(s)
                        </Badge>
                        <Button
                            onClick={() => openModalWithStatus('Available')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs"
                        >
                            <ShieldCheck size={15} className="mr-1.5" /> Liberar Qualidade
                        </Button>
                        <Button
                            onClick={() => openModalWithStatus('Quarantine')}
                            className="bg-amber-600 hover:bg-amber-700 text-white h-9 text-xs"
                        >
                            <Lock size={15} className="mr-1.5" /> Quarentena
                        </Button>
                        <Button
                            onClick={() => openModalWithStatus('Damaged')}
                            className="bg-rose-600 hover:bg-rose-700 text-white h-9 text-xs"
                        >
                            <AlertTriangle size={15} className="mr-1.5" /> Avaria
                        </Button>
                    </div>
                )}
            </div>

            {/* PAINEL DE FILTROS */}
            <Card className="border-slate-200/80 shadow-sm bg-white">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3 flex-1">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar por LPN..."
                                value={searchLpn}
                                onChange={(e) => { setSearchLpn(e.target.value); setPage(1); }}
                                className="pl-9 bg-slate-50 border-slate-200 h-9 text-xs"
                            />
                        </div>

                        <div className="w-[200px]">
                            <Select value={selectedCustomer} onValueChange={(v) => { setSelectedCustomer(v); setPage(1); }}>
                                <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-xs">
                                    <SelectValue placeholder="Depositante" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os Depositantes</SelectItem>
                                    {customers.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="w-[200px]">
                            <Select value={selectedQuality} onValueChange={(v) => { setSelectedQuality(v); setPage(1); }}>
                                <SelectTrigger className="bg-slate-50 border-slate-200 h-9 text-xs">
                                    <SelectValue placeholder="Filtro de Qualidade" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BLOCKED_ONLY">⚠️ Apenas Bloqueados (Quarentena/Avaria)</SelectItem>
                                    <SelectItem value="ALL">Todos os Status (Inclusive Livre)</SelectItem>
                                    <SelectItem value="Quarantine">🔒 Quarentena</SelectItem>
                                    <SelectItem value="Damaged">🚨 Avaria Física</SelectItem>
                                    <SelectItem value="Virtual_Shortage">❓ Falta Virtual</SelectItem>
                                    <SelectItem value="Available">✅ Livre / Liberado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/inventory'] })}
                        className="text-slate-500 hover:text-slate-900 h-9"
                    >
                        <RefreshCw size={14} className={`mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
                    </Button>
                </CardContent>
            </Card>

            {/* TABELA DE UNIDADES DE MANUSEIO */}
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/80">
                        <TableRow>
                            <TableHead className="w-12 text-center">
                                <Checkbox
                                    checked={hus.length > 0 && selectedHuIds.length === hus.length}
                                    onCheckedChange={toggleSelectAll}
                                />
                            </TableHead>
                            <TableHead>LPN / Volume</TableHead>
                            <TableHead>Depositante / SKU</TableHead>
                            <TableHead>Endereço Físico</TableHead>
                            <TableHead>Lote / Validade</TableHead>
                            <TableHead className="text-right">Qtd Física</TableHead>
                            <TableHead>Status de Qualidade</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading || isFetching ? (
                            <TableRow><TableCell colSpan={7} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : hus.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="h-28 text-center text-slate-500">Nenhum palete/volume encontrado com os filtros selecionados.</TableCell></TableRow>
                        ) : hus.map((h) => {
                            const isSelected = selectedHuIds.includes(h.id);
                            return (
                                <TableRow key={h.id} className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-amber-50/40' : ''}`}>
                                    <TableCell className="text-center">
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={(checked) => toggleSelectHu(h.id, checked)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                                <Layers size={16} />
                                            </div>
                                            <span className="font-bold font-mono text-slate-900">{h.lpn}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-800 text-xs">{h.productSku}</span>
                                            <span className="text-[10px] text-slate-400">{h.customerName}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {h.locationPath ? (
                                            <Badge variant="outline" className="bg-slate-50 font-mono text-slate-700 gap-1 text-[11px]">
                                                <MapPin size={11} className="text-blue-600" /> {h.locationPath}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Em trânsito</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono text-slate-600">
                                        <div>Lote: {h.batch || '-'}</div>
                                        <div>Val: {h.expirationDate ? new Date(h.expirationDate).toLocaleDateString('pt-BR') : '-'}</div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-slate-900 text-xs">
                                        {h.currentQuantity?.toLocaleString('pt-BR')} {h.packagingTypeCode}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={`text-[10px] px-2 py-0.5 border ${h.qualityStatus === 'Available' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                            h.qualityStatus === 'Quarantine' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                                'bg-rose-50 text-rose-800 border-rose-200'
                                            }`}>
                                            {h.qualityStatus === 'Available' ? '✅ Livre' :
                                                h.qualityStatus === 'Quarantine' ? '🔒 Quarentena' :
                                                    h.qualityStatus === 'Damaged' ? '🚨 Avaria' : h.qualityStatus}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>

                {totalCount > 0 && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                        <span>Mostrando {(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} HUs</span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs bg-white">Anterior</Button>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="h-7 text-xs bg-white">Próxima</Button>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL DE PARECER TÉCNICO DE QUALIDADE */}
            <Dialog open={isActionModalOpen} onOpenChange={setIsActionModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <ShieldAlert className="text-amber-600" size={20} /> Alteração de Qualidade ({selectedHuIds.length} HUs)
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-xs">
                            Defina o novo status de qualidade e registre a justificativa para o histórico do Kardex.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Novo Status Destino *</Label>
                            <Select value={targetStatus} onValueChange={setTargetStatus}>
                                <SelectTrigger className="bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Available">✅ Liberado (Disponível para Separação)</SelectItem>
                                    <SelectItem value="Quarantine">🔒 Bloqueio por Quarentena Técnica</SelectItem>
                                    <SelectItem value="Damaged">🚨 Avaria / Danificado</SelectItem>
                                    <SelectItem value="Virtual_Shortage">❓ Falta Virtual / Em Análise</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Parecer Técnico / Motivo</Label>
                            <Input
                                placeholder="Ex: Liberado após laudo de laboratório / Avaria na embalagem durante transporte"
                                value={reasonNote}
                                onChange={(e) => setReasonNote(e.target.value)}
                                className="bg-white text-xs"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsActionModalOpen(false)} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleExecuteQualityAction}
                            disabled={isSubmitting}
                            className="bg-slate-900 hover:bg-slate-800 text-white min-w-[130px]"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                            Gravar Parecer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}