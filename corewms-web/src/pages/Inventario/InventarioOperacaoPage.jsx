import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MapPin, Barcode, Loader2, Search, Layers, Boxes, RefreshCw } from 'lucide-react';
import { customInstance } from '@/api/orval-mutator';
import { toast } from 'sonner';

export default function InventarioOperacaoPage() {
    const navigate = useNavigate();
    const [activeTasks, setActiveTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const loadOperatorTasks = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/cycle-count/tasks/operator', method: 'GET' });
            setActiveTasks(res || []);
        } catch {
            toast.error('Erro ao carregar tarefas do coletor.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadOperatorTasks(); }, []);

    const filteredTasks = useMemo(() => {
        if (!searchTerm.trim()) return activeTasks;
        const term = searchTerm.toLowerCase();
        return activeTasks.filter(t =>
            t.locationPath?.toLowerCase().includes(term) ||
            t.productSku?.toLowerCase().includes(term) ||
            t.productDescription?.toLowerCase().includes(term)
        );
    }, [activeTasks, searchTerm]);

    // Ao clicar em Contar Posição: marca InCounting na API e redireciona para a tela dedicada
    const handleStartTask = async (task) => {
        try {
            await customInstance({ url: `/api/cycle-count/tasks/${task.id}/start`, method: 'POST' });
            navigate(`/inventario/operacao/${task.id}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao iniciar contagem.');
        }
    };

    return (
        <div className="flex flex-col space-y-5 animate-in fade-in duration-300">
            <div className="flex items-center justify-between bg-white p-5 border rounded-xl shadow-2xs">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Barcode className="text-emerald-600" size={24} /> Operação de Inventário - Chão de Fábrica
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Selecione uma posição liberada para iniciar a contagem cega com o carrinho de bipagens.</p>
                </div>
                <Button onClick={loadOperatorTasks} variant="outline" size="sm" className="bg-white">
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                </Button>
            </div>

            <div className="bg-white border rounded-xl p-4 space-y-4 shadow-xs">
                <div className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-lg border">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Filtrar por Posição ou SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 text-xs h-9 bg-white border-slate-300"
                        />
                    </div>
                    <Badge variant="outline" className="bg-blue-50 text-blue-800 font-mono text-xs">
                        {filteredTasks.length} Posições Liberadas
                    </Badge>
                </div>

                <div className="overflow-auto max-h-[550px]">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead>Endereço / Posição</TableHead>
                                <TableHead>SKU do Produto</TableHead>
                                <TableHead>Plano de Origem</TableHead>
                                <TableHead>Tipo Armazenamento</TableHead>
                                <TableHead className="text-center">Rodada</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : filteredTasks.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-500">Nenhuma posição pendente de contagem no momento.</TableCell></TableRow>
                            ) : filteredTasks.map((t) => (
                                <TableRow key={t.id} className="hover:bg-slate-50/60">
                                    <TableCell><Badge variant="outline" className="font-mono gap-1"><MapPin size={12} className="text-blue-600" /> {t.locationPath}</Badge></TableCell>
                                    <TableCell className="font-mono text-xs">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900">{t.productSku}</span>
                                            <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{t.productDescription}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600 font-medium">{t.planName}</TableCell>
                                    <TableCell>{t.isDynamicStorage ? <Badge className="bg-amber-100 text-amber-800 text-[10px]"><Boxes size={12} /> Blocado</Badge> : <Badge className="bg-purple-100 text-purple-800 text-[10px]"><Layers size={12} /> Porta-Palete</Badge>}</TableCell>
                                    <TableCell className="text-center font-mono text-xs"><Badge variant="secondary">Rodada {t.currentRound || 1}</Badge></TableCell>
                                    <TableCell>
                                        <Badge className={`text-[10px] ${t.status === 'InCounting' ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
                                            {t.status === 'InCounting' ? '⏳ Em Contagem' : '⏳ Pendente'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button onClick={() => handleStartTask(t)} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8">
                                            <Barcode size={14} className="mr-1.5" /> Contar Posição
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}