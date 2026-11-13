import { useState, useEffect, useMemo, useRef } from 'react';
import { customInstance } from '@/api/orval-mutator';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ShieldAlert, Search, Upload, Trash2, Loader2,
    MapPin, Barcode, X, CheckSquare
} from 'lucide-react';
import { toast } from 'sonner';

export default function BulkHoldModal({ open, onOpenChange, onSuccess }) {
    const [isSearching, setIsSearching] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Dados auxiliares
    const [customers, setCustomers] = useState([]);
    const [reasons, setReasons] = useState([]);
    const [qualityLocations, setQualityLocations] = useState([]);

    // Filtros de pesquisa de HUs
    const [searchLpn, setSearchLpn] = useState('');
    const [searchSku, setSearchSku] = useState('');
    const [searchBatch, setSearchBatch] = useState('');
    const [searchNfe, setSearchNfe] = useState('');
    const [customerFilter, setCustomerFilter] = useState('ALL');
    const [qualityFilter, setQualityFilter] = useState('1'); // 1 = Livre (padrão)

    // Resultados e Seleção Persistente (Map<id, hu>)
    const [searchResults, setSearchResults] = useState([]);
    const [selectedHusMap, setSelectedHusMap] = useState({});

    // Formulário de Bloqueio / Status em Massa
    const [newStatus, setNewStatus] = useState('2'); // 2 = Quarentena, 3 = Avariado, 4 = Falta Virtual
    const [reasonId, setReasonId] = useState('');
    const [notes, setNotes] = useState('');
    const [qualityLocationId, setQualityLocationId] = useState('NONE');
    const [images, setImages] = useState([]);

    const lpnInputRef = useRef(null);

    const searchHandlingUnits = async (overrides = {}) => {
        try {
            setIsSearching(true);
            const params = new URLSearchParams();
            params.append('Page', '1');
            params.append('PageSize', '60');

            const lpnVal = overrides.lpn !== undefined ? overrides.lpn : searchLpn;
            const skuVal = overrides.sku !== undefined ? overrides.sku : searchSku;
            const batchVal = overrides.batch !== undefined ? overrides.batch : searchBatch;
            const nfeVal = overrides.nfe !== undefined ? overrides.nfe : searchNfe;
            const custVal = overrides.customer !== undefined ? overrides.customer : customerFilter;
            const qualVal = overrides.quality !== undefined ? overrides.quality : qualityFilter;

            if (lpnVal.trim()) params.append('Lpn', lpnVal.trim());
            if (skuVal.trim()) params.append('Sku', skuVal.trim());
            if (batchVal.trim()) params.append('Batch', batchVal.trim());
            if (nfeVal.trim()) params.append('NfeNumber', nfeVal.trim());
            if (custVal && custVal !== 'ALL') params.append('CustomerId', custVal);
            if (qualVal && qualVal !== 'ALL') params.append('QualityStatus', qualVal);

            const res = await customInstance({
                url: `/api/inventory/handling-units?${params.toString()}`,
                method: 'GET'
            });

            const rawItems = res?.items || (Array.isArray(res) ? res : []);
            // Considera apenas HUs ativas fisicamente no armazém
            const activeHus = rawItems.filter(
                h => Number(h.currentQuantity) > 0 && h.status !== 'Consumed' && h.status !== 'Shipped'
            );

            setSearchResults(activeHus);

            // Se foi bipado um LPN exato, marca automaticamente na seleção
            if (overrides.autoSelectExactLpn && lpnVal.trim()) {
                const exact = activeHus.find(
                    h => h.lpn?.toUpperCase() === lpnVal.trim().toUpperCase()
                );
                if (exact) {
                    setSelectedHusMap(prev => ({ ...prev, [exact.id]: exact }));
                    setSearchLpn('');
                    toast.success(`HU ${exact.lpn} adicionada à seleção!`);
                }
            }
        } catch {
            toast.error('Erro ao consultar HUs no estoque.');
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        if (open) {
            setSearchLpn('');
            setSearchSku('');
            setSearchBatch('');
            setSearchNfe('');
            setCustomerFilter('ALL');
            setQualityFilter('1');
            setSelectedHusMap({});
            setNewStatus('2');
            setReasonId('');
            setNotes('');
            setQualityLocationId('NONE');
            setImages([]);

            Promise.all([
                customInstance({ url: '/api/customers/summary', method: 'GET' }).catch(() => []),
                customInstance({ url: '/api/quality/reasons?onlyActive=true', method: 'GET' }).catch(() => []),
                customInstance({ url: '/api/topology/locations/quality', method: 'GET' }).catch(() => [])
            ]).then(([custRes, reasonsRes, locRes]) => {
                setCustomers(Array.isArray(custRes) ? custRes : (custRes?.items || []));
                setReasons(Array.isArray(reasonsRes) ? reasonsRes : (reasonsRes?.items || []));
                setQualityLocations(Array.isArray(locRes) ? locRes : []);
            });

            searchHandlingUnits({
                lpn: '',
                sku: '',
                batch: '',
                nfe: '',
                customer: 'ALL',
                quality: '1'
            });
        }
    }, [open]);

    const selectedList = useMemo(() => Object.values(selectedHusMap), [selectedHusMap]);

    const allVisibleSelected = useMemo(() => {
        if (searchResults.length === 0) return false;
        return searchResults.every(h => Boolean(selectedHusMap[h.id]));
    }, [searchResults, selectedHusMap]);

    const toggleSelectAllVisible = (checked) => {
        setSelectedHusMap(prev => {
            const next = { ...prev };
            if (checked) {
                searchResults.forEach(h => {
                    next[h.id] = h;
                });
            } else {
                searchResults.forEach(h => {
                    delete next[h.id];
                });
            }
            return next;
        });
    };

    const toggleSingleHu = (hu, checked) => {
        setSelectedHusMap(prev => {
            const next = { ...prev };
            if (checked) {
                next[hu.id] = hu;
            } else {
                delete next[hu.id];
            }
            return next;
        });
    };

    const handleQuickLpnEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchHandlingUnits({ autoSelectExactLpn: true });
        }
    };

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImages(prev => [...prev, { fileName: file.name, base64Data: reader.result }]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeImage = (idx) => {
        setImages(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (selectedList.length === 0) {
            return toast.warning('Selecione ao menos uma Unidade de Manuseio (HU) na tabela.');
        }
        if (!reasonId) {
            return toast.warning('Selecione o motivo padronizado do bloqueio.');
        }
        if (!notes.trim()) {
            return toast.warning('Informe o parecer/observação do bloqueio em massa.');
        }

        setIsSubmitting(true);
        try {
            const res = await customInstance({
                url: '/api/quality/hold',
                method: 'POST',
                data: {
                    handlingUnitIds: selectedList.map(h => h.id),
                    newStatus: Number(newStatus),
                    reasonId,
                    notes: notes.trim(),
                    qualityLocationId: qualityLocationId && qualityLocationId !== 'NONE' ? qualityLocationId : null,
                    images: images.length > 0 ? images : null
                }
            });

            toast.success(res?.message || `Bloqueio/status aplicado com sucesso para ${selectedList.length} HU(s)!`);
            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao aplicar bloqueio em massa.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderHuQualityBadge = (status) => {
        switch (status) {
            case 'Available':
                return <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">Livre</Badge>;
            case 'Quarantine':
                return <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[10px]">Quarentena</Badge>;
            case 'Damaged':
                return <Badge className="bg-rose-50 text-rose-800 border-rose-200 text-[10px]">Avaria</Badge>;
            case 'Virtual_Shortage':
                return <Badge className="bg-purple-50 text-purple-800 border-purple-200 text-[10px]">Falta Virtual</Badge>;
            default:
                return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
            <DialogContent className="sm:max-w-5xl bg-white max-h-[92vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        <ShieldAlert className="text-rose-600" size={20} /> Bloqueio & Status de Qualidade em Massa
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Pesquise ou bipe múltiplas HUs (por LPN, SKU, Lote ou NF-e), monte sua seleção e aplique o bloqueio ou status de qualidade de uma só vez.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-y-auto py-1 pr-1">
                    {/* COLUNA ESQUERDA: BUSCA E SELEÇÃO DE HUs */}
                    <div className="lg:col-span-7 flex flex-col space-y-3 border border-slate-200 rounded-xl p-3 bg-slate-50/40">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <div className="relative">
                                <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rose-600" />
                                <Input
                                    ref={lpnInputRef}
                                    placeholder="Bipar LPN (Enter)..."
                                    value={searchLpn}
                                    onChange={(e) => setSearchLpn(e.target.value.toUpperCase())}
                                    onKeyDown={handleQuickLpnEnter}
                                    className="pl-8 h-8 text-xs font-mono bg-white"
                                />
                            </div>
                            <Input
                                placeholder="SKU ou Descrição..."
                                value={searchSku}
                                onChange={(e) => setSearchSku(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchHandlingUnits())}
                                className="h-8 text-xs bg-white"
                            />
                            <Input
                                placeholder="Lote físico..."
                                value={searchBatch}
                                onChange={(e) => setSearchBatch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchHandlingUnits())}
                                className="h-8 text-xs font-mono bg-white"
                            />
                            <Input
                                placeholder="Nº NF-e..."
                                value={searchNfe}
                                onChange={(e) => setSearchNfe(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchHandlingUnits())}
                                className="h-8 text-xs font-mono bg-white"
                            />
                            <Select
                                value={customerFilter}
                                onValueChange={(v) => {
                                    setCustomerFilter(v);
                                    searchHandlingUnits({ customer: v });
                                }}
                            >
                                <SelectTrigger className="h-8 text-xs bg-white">
                                    <SelectValue placeholder="Depositante" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos Depositantes</SelectItem>
                                    {customers.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="flex gap-1.5">
                                <Select
                                    value={qualityFilter}
                                    onValueChange={(v) => {
                                        setQualityFilter(v);
                                        searchHandlingUnits({ quality: v });
                                    }}
                                >
                                    <SelectTrigger className="h-8 text-xs bg-white flex-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">Apenas Livres</SelectItem>
                                        <SelectItem value="ALL">Todos Status</SelectItem>
                                        <SelectItem value="2">Quarentena</SelectItem>
                                        <SelectItem value="3">Avariados</SelectItem>
                                        <SelectItem value="4">Falta Virtual</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => searchHandlingUnits()}
                                    disabled={isSearching}
                                    className="h-8 px-2.5 bg-slate-900 hover:bg-slate-800 text-white"
                                >
                                    {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                                </Button>
                            </div>
                        </div>

                        {/* TABELA DE RESULTADOS */}
                        <div className="border border-slate-200 rounded-lg bg-white overflow-auto max-h-[260px] flex-1">
                            <Table>
                                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead className="w-10 text-center">
                                            <Checkbox
                                                checked={allVisibleSelected}
                                                onCheckedChange={toggleSelectAllVisible}
                                            />
                                        </TableHead>
                                        <TableHead className="text-xs">LPN</TableHead>
                                        <TableHead className="text-xs">SKU / Lote</TableHead>
                                        <TableHead className="text-xs">Posição</TableHead>
                                        <TableHead className="text-right text-xs">Saldo</TableHead>
                                        <TableHead className="text-xs">Atual</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isSearching ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-28 text-center">
                                                <Loader2 className="h-5 w-5 animate-spin text-rose-600 mx-auto" />
                                            </TableCell>
                                        </TableRow>
                                    ) : searchResults.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-28 text-center text-xs text-slate-400 italic">
                                                Nenhuma HU encontrada para os filtros aplicados.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        searchResults.map(hu => {
                                            const isChecked = Boolean(selectedHusMap[hu.id]);
                                            return (
                                                <TableRow
                                                    key={hu.id}
                                                    onClick={() => toggleSingleHu(hu, !isChecked)}
                                                    className={`cursor-pointer text-xs ${isChecked ? 'bg-rose-50/60' : 'hover:bg-slate-50'}`}
                                                >
                                                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                        <Checkbox
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => toggleSingleHu(hu, checked)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-mono font-bold text-slate-900">{hu.lpn}</TableCell>
                                                    <TableCell>
                                                        <span className="font-mono font-semibold text-slate-800 block">{hu.productSku}</span>
                                                        <span className="text-[10px] font-mono text-slate-400">
                                                            {hu.batch ? `Lote: ${hu.batch}` : 'Sem Lote'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-[11px] text-slate-600">
                                                        {hu.locationPath || 'DOCA'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-slate-800">
                                                        {Number(hu.currentQuantity).toLocaleString('pt-BR')} {hu.unit}
                                                    </TableCell>
                                                    <TableCell>{renderHuQualityBadge(hu.qualityStatus)}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* CHIPS DAS HUs SELECIONADAS */}
                        <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                                    <CheckSquare size={13} className="text-rose-600" />
                                    HUs Selecionadas para Bloqueio ({selectedList.length})
                                </span>
                                {selectedList.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedHusMap({})}
                                        className="text-[10px] text-rose-600 hover:underline font-semibold"
                                    >
                                        Limpar seleção
                                    </button>
                                )}
                            </div>
                            {selectedList.length === 0 ? (
                                <p className="text-[11px] text-slate-400 italic">
                                    Marque uma ou mais HUs acima para aplicar o bloqueio em lote.
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                    {selectedList.map(hu => (
                                        <Badge
                                            key={hu.id}
                                            className="bg-rose-50 text-rose-900 border-rose-200 font-mono text-[10px] gap-1 py-0.5"
                                        >
                                            {hu.lpn}
                                            <X
                                                size={11}
                                                className="cursor-pointer hover:text-rose-700"
                                                onClick={() => toggleSingleHu(hu, false)}
                                            />
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* COLUNA DIREITA: PARÂMETROS DO BLOQUEIO EM MASSA */}
                    <form id="bulk-hold-form" onSubmit={handleSubmit} className="lg:col-span-5 space-y-3.5 border border-slate-200 rounded-xl p-4 bg-white">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-800">Status de Qualidade a Aplicar *</Label>
                            <Select value={newStatus} onValueChange={setNewStatus}>
                                <SelectTrigger className="bg-slate-50 text-xs h-9 font-semibold">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="2">Quarentena / Retenção Técnica</SelectItem>
                                    <SelectItem value="3">Avariado / Danificado</SelectItem>
                                    <SelectItem value="4">Falta Virtual / Em Análise</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-800">Motivo Padronizado *</Label>
                            <Select value={reasonId} onValueChange={setReasonId}>
                                <SelectTrigger className="bg-slate-50 text-xs h-9">
                                    <SelectValue placeholder="Selecione o motivo..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {reasons.map(r => (
                                        <SelectItem key={r.id} value={r.id} className="text-xs">
                                            <span className="font-mono font-bold mr-1.5">{r.code}</span> - {r.description}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-800">Parecer / Justificativa Técnica *</Label>
                            <Input
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Ex: Lote retido preventivamente para análise de qualidade..."
                                className="text-xs h-9 bg-white"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                <MapPin size={13} className="text-amber-600" /> Mover para Posição de Qualidade (Opcional)
                            </Label>
                            <Select value={qualityLocationId} onValueChange={setQualityLocationId}>
                                <SelectTrigger className="bg-slate-50 text-xs h-9 font-mono">
                                    <SelectValue placeholder="Manter nas posições atuais..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="NONE" className="text-xs font-sans text-slate-500">
                                        Manter nas posições atuais
                                    </SelectItem>
                                    {qualityLocations.map(loc => (
                                        <SelectItem key={loc.id} value={loc.id} className="font-mono text-xs">
                                            {loc.fullPath}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5 pt-1">
                            <Label className="text-xs font-bold text-slate-800">Evidências Fotográficas (Opcional)</Label>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-rose-300 bg-rose-50/50 text-xs text-rose-800 cursor-pointer hover:bg-rose-100/50 transition-colors">
                                    <Upload size={14} /> Anexar Fotos
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                                </label>
                                <span className="text-[10px] text-slate-500">{images.length} foto(s)</span>
                            </div>
                            {images.length > 0 && (
                                <div className="flex gap-2 flex-wrap pt-1.5">
                                    {images.map((img, idx) => (
                                        <div key={idx} className="relative group w-12 h-12 rounded-lg overflow-hidden border border-rose-300">
                                            <img src={img.base64Data} alt="Evidência" className="w-full h-full object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => removeImage(idx)}
                                                className="absolute inset-0 bg-rose-900/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                <DialogFooter className="border-t pt-3">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        form="bulk-hold-form"
                        disabled={isSubmitting || selectedList.length === 0}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs min-w-[190px]"
                    >
                        {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                            <ShieldAlert className="h-4 w-4 mr-1.5" />
                        )}
                        Aplicar Bloqueio em {selectedList.length} HU(s)
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}