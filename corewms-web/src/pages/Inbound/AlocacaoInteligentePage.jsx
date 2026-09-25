import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiInboundId } from '@/api/generated/inbound/inbound';
import { useGetApiTopologyLocationsStorage } from '@/api/generated/topology/topology';
import { customInstance } from '@/api/orval-mutator';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    ArrowLeft, MapPin, CheckCircle2, Loader2, Search,
    Sparkles, ShieldAlert, Warehouse, Box, RefreshCw, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

// SELETOR PESQUISÁVEL COMPACTO PARA A TABELA
function SearchableLocationCell({ value, onChange, locations }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const selectedLoc = locations.find(l => l.id === value);

    const filtered = useMemo(() => {
        if (!searchTerm) return locations.slice(0, 30);
        return locations.filter(l => l.fullPath.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 30);
    }, [locations, searchTerm]);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-300 hover:border-blue-500 rounded-md font-mono font-bold text-slate-900 flex items-center justify-between w-44"
            >
                <span>{selectedLoc?.fullPath || "Selecionar..."}</span>
                <Search size={12} className="text-slate-400 ml-1" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 space-y-1">
                    <input
                        type="text"
                        autoFocus
                        placeholder="Filtrar posição..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-2 py-1 text-xs border rounded font-mono outline-none focus:border-blue-500"
                    />
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {filtered.map(loc => (
                            <div
                                key={loc.id}
                                onClick={() => {
                                    onChange(loc.id, loc.fullPath);
                                    setIsOpen(false);
                                    setSearchTerm('');
                                }}
                                className={`px-2 py-1 rounded text-xs font-mono cursor-pointer flex justify-between ${value === loc.id ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100'}`}
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

export default function AlocacaoInteligentePage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [suggestions, setSuggestions] = useState([]);
    const [selectedHuIds, setSelectedHuIds] = useState([]);
    const [search, setSearch] = useState('');

    // Bulk override
    const [bulkLocationId, setBulkLocationId] = useState('');

    // 1. Dados da Ordem
    const { data: order } = useGetApiInboundId(orderId);

    // 2. Busca todas as Posições (Armazenamento + Qualidade)
    const { data: storageLocations = [] } = useGetApiTopologyLocationsStorage();
    const [qualityLocations, setQualityLocations] = useState([]);

    useEffect(() => {
        customInstance({ url: '/api/topology/locations/quality', method: 'GET' })
            .then(res => setQualityLocations(Array.isArray(res) ? res : []))
            .catch(() => setQualityLocations([]));
    }, []);

    const allLocations = useMemo(() => [...storageLocations, ...qualityLocations], [storageLocations, qualityLocations]);

    // 3. Carrega Sugestões do Backend
    const loadSuggestions = async () => {
        setIsLoading(true);
        try {
            const res = await customInstance({
                url: `/api/inventory/putaway/suggestions/${orderId}`,
                method: 'GET'
            });
            const list = Array.isArray(res) ? res : [];
            setSuggestions(list);
            setSelectedHuIds(list.map(s => s.handlingUnitId));
        } catch (err) {
            toast.error('Erro ao carregar sugestões de alocação.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (orderId) loadSuggestions();
    }, [orderId]);

    // Atualização de Posição Individual
    const handleUpdateLocation = (huId, newLocId, newLocPath) => {
        setSuggestions(prev => prev.map(s => {
            if (s.handlingUnitId === huId) {
                return {
                    ...s,
                    suggestedLocationId: newLocId,
                    suggestedLocationFullPath: newLocPath,
                    suggestionReason: 'Alterado manualmente pelo operador'
                };
            }
            return s;
        }));
    };

    // Aplicação de Posição em Lote
    const handleApplyBulkLocation = () => {
        if (!bulkLocationId) return toast.warning('Selecione uma posição para aplicar em lote.');
        if (selectedHuIds.length === 0) return toast.warning('Selecione ao menos uma HU na tabela.');

        const targetLoc = allLocations.find(l => l.id === bulkLocationId);
        if (!targetLoc) return;

        setSuggestions(prev => prev.map(s => {
            if (selectedHuIds.includes(s.handlingUnitId)) {
                return {
                    ...s,
                    suggestedLocationId: targetLoc.id,
                    suggestedLocationFullPath: targetLoc.fullPath,
                    suggestionReason: 'Alteração em lote'
                };
            }
            return s;
        }));

        toast.info(`Posição ${targetLoc.fullPath} aplicada para ${selectedHuIds.length} HU(s).`);
        setBulkLocationId('');
    };

    // Execução Final da Alocação
    const handleConfirmPutaway = async () => {
        const itemsToAllocate = suggestions.filter(s => selectedHuIds.includes(s.handlingUnitId));
        if (itemsToAllocate.length === 0) {
            return toast.warning('Selecione ao menos uma HU para alocar.');
        }

        setIsSubmitting(true);
        try {
            // Agrupa por Posição para chamadas limpas
            const groupedByLocation = itemsToAllocate.reduce((acc, item) => {
                const locId = item.suggestedLocationId;
                if (!acc[locId]) acc[locId] = [];
                acc[locId].push(item.handlingUnitId);
                return acc;
            }, {});

            for (const [locId, huIds] of Object.entries(groupedByLocation)) {
                await customInstance({
                    url: '/api/inventory/handling-units/move',
                    method: 'POST',
                    data: {
                        handlingUnitIds: huIds,
                        destinationLocationId: locId
                    }
                });
            }

            toast.success(`${itemsToAllocate.length} HU(s) alocadas no estoque com sucesso!`);
            queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
            queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });

            navigate(`/inbound/operacao/${orderId}/hus`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao efetivar a alocação.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredSuggestions = useMemo(() => {
        return suggestions.filter(s =>
            !search ||
            s.lpn.toLowerCase().includes(search.toLowerCase()) ||
            s.productSku.toLowerCase().includes(search.toLowerCase()) ||
            s.batch?.toLowerCase().includes(search.toLowerCase())
        );
    }, [suggestions, search]);

    const documentNumber = order?.accessKey && order.accessKey.length >= 34
        ? parseInt(order.accessKey.substring(25, 34), 10)
        : 'N/A';

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* CABEÇALHO DEDICADO */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/inbound/operacao/${orderId}/hus`)}>
                        <ArrowLeft className="h-5 w-5 text-slate-500" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold font-mono text-slate-900 flex items-center gap-2">
                                <Sparkles className="text-blue-600" size={24} /> Alocação Inteligente (Putaway)
                            </h1>
                            <Badge className="bg-blue-50 text-blue-700 border-blue-200">NF {documentNumber}</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            O WMS calculou as melhores posições para os volumes da Doca com base nas regras de empilhamento, capacidade e qualidade.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={loadSuggestions} disabled={isLoading} className="text-xs font-semibold">
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} /> Recalcular Sugestões
                    </Button>
                    <Button
                        onClick={handleConfirmPutaway}
                        disabled={selectedHuIds.length === 0 || isSubmitting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 text-xs shadow-sm"
                    >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Confirmar e Gravar Alocação ({selectedHuIds.length})
                    </Button>
                </div>
            </div>

            {/* TABELA DE REVISÃO E AÇÕES EM LOTE */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por LPN, SKU ou Lote..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white border-slate-200 text-xs h-9"
                        />
                    </div>

                    {/* AÇÃO EM LOTE */}
                    <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200">
                        <span className="text-xs text-slate-500 px-2 font-semibold">Alterar Selecionados ({selectedHuIds.length}):</span>
                        <div className="w-56">
                            <SearchableLocationCell
                                value={bulkLocationId}
                                onChange={(locId) => setBulkLocationId(locId)}
                                locations={allLocations}
                            />
                        </div>
                        <Button size="sm" onClick={handleApplyBulkLocation} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                            Aplicar Posição
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[40px]">
                                    <Checkbox
                                        checked={filteredSuggestions.length > 0 && selectedHuIds.length === filteredSuggestions.length}
                                        onCheckedChange={() => {
                                            if (selectedHuIds.length === filteredSuggestions.length) setSelectedHuIds([]);
                                            else setSelectedHuIds(filteredSuggestions.map(s => s.handlingUnitId));
                                        }}
                                    />
                                </TableHead>
                                <TableHead>LPN / Código HU</TableHead>
                                <TableHead>SKU / Produto</TableHead>
                                <TableHead>Quantidade</TableHead>
                                <TableHead>Lote Físico</TableHead>
                                <TableHead>Qualidade</TableHead>
                                <TableHead className="w-[220px]">Posição Sugerida (WMS)</TableHead>
                                <TableHead>Motivo / Regra Aplicada</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={8} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : filteredSuggestions.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500">Nenhum volume pendente de alocação na Doca.</TableCell></TableRow>
                            ) : (
                                filteredSuggestions.map((item) => {
                                    const isSelected = selectedHuIds.includes(item.handlingUnitId);
                                    const isQualityRestricted = item.qualityStatus !== 'Available' && item.qualityStatus !== '1';

                                    return (
                                        <TableRow key={item.handlingUnitId} className={isSelected ? 'bg-blue-50/30' : 'hover:bg-slate-50/50'}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() => {
                                                        setSelectedHuIds(prev =>
                                                            prev.includes(item.handlingUnitId)
                                                                ? prev.filter(id => id !== item.handlingUnitId)
                                                                : [...prev, item.handlingUnitId]
                                                        );
                                                    }}
                                                />
                                            </TableCell>

                                            <TableCell className="font-mono font-bold text-slate-900 text-xs">
                                                {item.lpn}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-800 text-xs font-mono">{item.productSku}</span>
                                                    <span className="text-[10px] text-slate-500 truncate max-w-[220px]" title={item.productDescription}>
                                                        {item.productDescription}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell className="font-mono font-bold text-xs text-blue-700">
                                                {item.quantity} {item.unit}
                                            </TableCell>

                                            <TableCell className="font-mono text-xs text-slate-700">
                                                {item.batch || 'N/A'}
                                            </TableCell>

                                            <TableCell>
                                                {isQualityRestricted ? (
                                                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                                                        <ShieldAlert size={10} className="mr-1" /> {item.qualityStatus}
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                                                        Liberado
                                                    </Badge>
                                                )}
                                            </TableCell>

                                            {/* SELETOR DE POSIÇÃO INDIVIDUAL */}
                                            <TableCell>
                                                <SearchableLocationCell
                                                    value={item.suggestedLocationId}
                                                    onChange={(newLocId, newPath) => handleUpdateLocation(item.handlingUnitId, newLocId, newPath)}
                                                    locations={isQualityRestricted ? qualityLocations : storageLocations}
                                                />
                                            </TableCell>

                                            <TableCell className="text-xs text-slate-500">
                                                <span className="bg-slate-100 px-2 py-1 rounded text-[10px] font-mono text-slate-700">
                                                    {item.suggestionReason}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}