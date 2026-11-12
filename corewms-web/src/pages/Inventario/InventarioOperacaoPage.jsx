import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
    MapPin, Barcode, Loader2, Search, Layers, Boxes,
    RefreshCw, EyeOff, Plus, Lock, X
} from 'lucide-react';
import { customInstance } from '@/api/orval-mutator';
import { toast } from 'sonner';

export default function InventarioOperacaoPage() {
    const navigate = useNavigate();
    const [activeLocations, setActiveLocations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Estados do Modal de Inventário Espontâneo
    const [isSpontaneousOpen, setIsSpontaneousOpen] = useState(false);
    const [locationInput, setLocationInput] = useState('');
    const [spontaneousLocations, setSpontaneousLocations] = useState([]);
    const [isCreatingSpontaneous, setIsCreatingSpontaneous] = useState(false);

    const loadOperatorLocations = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/cycle-count/tasks/operator', method: 'GET' });
            setActiveLocations(Array.isArray(res) ? res : []);
        } catch {
            toast.error('Erro ao carregar endereços para contagem.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadOperatorLocations();
    }, []);

    const filteredLocations = useMemo(() => {
        if (!searchTerm.trim()) return activeLocations;
        const term = searchTerm.toLowerCase();
        return activeLocations.filter(loc =>
            loc.locationPath?.toLowerCase().includes(term) ||
            loc.planName?.toLowerCase().includes(term)
        );
    }, [activeLocations, searchTerm]);

    // Inicia contagem cega do endereço selecionado
    const handleStartLocationCount = async (loc) => {
        try {
            await customInstance({
                url: `/api/cycle-count/locations/${loc.planId}/${loc.locationId}/start`,
                method: 'POST'
            });
            navigate(`/inventario/operacao/${loc.planId}_${loc.locationId}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao iniciar contagem do endereço.');
        }
    };

    // Adiciona endereço à lista do inventário espontâneo
    const handleAddSpontaneousLocation = (e) => {
        if (e) e.preventDefault();
        const clean = locationInput.trim().toUpperCase();
        if (!clean) return;

        if (spontaneousLocations.includes(clean)) {
            toast.info(`O endereço ${clean} já foi adicionado.`);
            setLocationInput('');
            return;
        }

        setSpontaneousLocations(prev => [...prev, clean]);
        setLocationInput('');
    };

    const handleRemoveSpontaneousLocation = (code) => {
        setSpontaneousLocations(prev => prev.filter(item => item !== code));
    };

    // Cria o plano espontâneo, bloqueia movimentações e atualiza a lista
    const handleCreateSpontaneousPlan = async () => {
        if (spontaneousLocations.length === 0) {
            return toast.warning('Adicione ao menos um endereço para iniciar a contagem.');
        }

        try {
            setIsCreatingSpontaneous(true);
            const res = await customInstance({
                url: '/api/cycle-count/plans/spontaneous',
                method: 'POST',
                data: {
                    locationCodes: spontaneousLocations,
                    maxRounds: 2
                }
            });

            toast.success(res?.message || 'Contagem espontânea criada e endereços bloqueados!');
            setIsSpontaneousOpen(false);
            setSpontaneousLocations([]);
            setLocationInput('');
            await loadOperatorLocations();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao criar contagem espontânea.');
        } finally {
            setIsCreatingSpontaneous(false);
        }
    };

    return (
        <div className="flex flex-col space-y-5 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-5 border rounded-xl shadow-2xs">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <EyeOff className="text-pink-600" size={24} /> Operação de Inventário Cego
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Contagem estritamente cega por endereço: os produtos e saldos sistêmicos permanecem ocultos durante a auditoria.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => setIsSpontaneousOpen(true)}
                        className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs h-9 shadow-2xs"
                    >
                        <Plus size={15} className="mr-1.5" /> Iniciar Contagem Espontânea
                    </Button>
                    <Button onClick={loadOperatorLocations} variant="outline" size="sm" className="bg-white h-9">
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                </div>
            </div>

            {/* LISTAGEM CEGA DE ENDEREÇOS */}
            <div className="bg-white border rounded-xl p-4 space-y-4 shadow-xs">
                <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Filtrar por Endereço ou Plano..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 text-xs h-9 bg-white border-slate-300 font-mono"
                        />
                    </div>
                    <Badge variant="outline" className="bg-pink-50 text-pink-800 border-pink-200 font-mono text-xs">
                        {filteredLocations.length} Endereço(s) Liberado(s)
                    </Badge>
                </div>

                <div className="overflow-auto max-h-[550px]">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead>Endereço / Posição</TableHead>
                                <TableHead>Plano de Origem</TableHead>
                                <TableHead>Tipo Armazenamento</TableHead>
                                <TableHead className="text-center">Rodada</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-pink-600 mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredLocations.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-slate-500 text-xs">
                                        Nenhum endereço pendente de contagem no momento. Utilize "Iniciar Contagem Espontânea" para auditar uma posição.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredLocations.map((loc) => (
                                    <TableRow key={`${loc.planId}_${loc.locationId}`} className="hover:bg-slate-50/60">
                                        <TableCell>
                                            <Badge variant="outline" className="font-mono font-bold text-xs gap-1.5 bg-slate-50 text-slate-900 border-slate-300">
                                                <MapPin size={12} className="text-pink-600" /> {loc.locationPath}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-700 font-medium">{loc.planName}</TableCell>
                                        <TableCell>
                                            {loc.isDynamicStorage ? (
                                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] gap-1">
                                                    <Boxes size={12} /> Blocado
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] gap-1">
                                                    <Layers size={12} /> Porta-Palete
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-xs">
                                            <Badge variant="secondary">Rodada {loc.currentRound || 1}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                className={`text-[10px] ${loc.status === 'InCounting'
                                                    ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                                                    : 'bg-slate-100 text-slate-700'
                                                    }`}
                                            >
                                                {loc.status === 'InCounting' ? '⏳ Em Contagem' : '⏳ Aguardando'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                onClick={() => handleStartLocationCount(loc)}
                                                size="sm"
                                                className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs h-8"
                                            >
                                                <Barcode size={14} className="mr-1.5" /> Contar Endereço
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* MODAL DE INVENTÁRIO ESPONTÂNEO */}
            <Dialog
                open={isSpontaneousOpen}
                onOpenChange={(open) => {
                    if (!open && !isCreatingSpontaneous) {
                        setIsSpontaneousOpen(false);
                        setLocationInput('');
                    }
                }}
            >
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <EyeOff size={20} className="text-pink-600" /> Iniciar Inventário Espontâneo
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Informe ou bipe um ou mais endereços. O sistema criará um plano vinculado ao seu usuário e bloqueará movimentações nestas posições até a conclusão da revisão.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <form onSubmit={handleAddSpontaneousLocation} className="flex gap-2">
                            <Input
                                autoFocus
                                placeholder="Ex: P1-C1-B01"
                                value={locationInput}
                                onChange={(e) => setLocationInput(e.target.value)}
                                className="font-mono text-xs uppercase bg-white"
                            />
                            <Button
                                type="submit"
                                variant="outline"
                                disabled={!locationInput.trim()}
                                className="border-pink-200 text-pink-700 hover:bg-pink-50 font-bold text-xs shrink-0"
                            >
                                <Plus size={14} className="mr-1" /> Adicionar
                            </Button>
                        </form>

                        <div className="space-y-1.5">
                            <span className="text-[11px] font-bold text-slate-600 uppercase block">
                                Endereços Selecionados ({spontaneousLocations.length})
                            </span>
                            {spontaneousLocations.length === 0 ? (
                                <div className="p-4 text-center text-xs text-slate-400 border border-dashed rounded-lg bg-slate-50">
                                    Nenhum endereço adicionado ainda.
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50 border rounded-lg max-h-36 overflow-y-auto">
                                    {spontaneousLocations.map(code => (
                                        <Badge
                                            key={code}
                                            className="bg-pink-100 text-pink-900 border-pink-300 font-mono text-xs gap-1.5 py-1 px-2"
                                        >
                                            <MapPin size={11} className="text-pink-600" />
                                            {code}
                                            <X
                                                size={12}
                                                className="cursor-pointer hover:text-rose-600"
                                                onClick={() => handleRemoveSpontaneousLocation(code)}
                                            />
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="border-t pt-3">
                        <Button
                            variant="outline"
                            onClick={() => setIsSpontaneousOpen(false)}
                            disabled={isCreatingSpontaneous}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleCreateSpontaneousPlan}
                            disabled={isCreatingSpontaneous || spontaneousLocations.length === 0}
                            className="bg-pink-600 hover:bg-pink-700 text-white font-bold"
                        >
                            {isCreatingSpontaneous ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                            ) : (
                                <Lock className="h-4 w-4 mr-1.5" />
                            )}
                            Bloquear e Iniciar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}