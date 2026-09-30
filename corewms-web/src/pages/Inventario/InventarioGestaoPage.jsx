import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    ClipboardCheck, Plus, RefreshCw, Loader2, Search,
    TrendingUp, AlertTriangle, FileText, ChevronRight, Boxes
} from 'lucide-react';
import { customInstance } from '@/api/orval-mutator';
import { toast } from 'sonner';

// Helper de Tradução dos Badges de Status do Plano
export const renderPlanStatusBadge = (status) => {
    const statusStr = String(status);
    switch (statusStr) {
        case 'Draft':
        case '1':
            return <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 font-mono text-[10px]">Rascunho</Badge>;
        case 'ApprovedForCounting':
        case '2':
            return <Badge variant="outline" className="bg-blue-50 text-blue-900 border-blue-300 font-mono text-[10px]">Aprovado p/ Contagem</Badge>;
        case 'InCounting':
        case '3':
            return <Badge variant="outline" className="bg-indigo-50 text-indigo-900 border-indigo-300 font-mono text-[10px]">Em Contagem</Badge>;
        case 'InReview':
        case '4':
            return <Badge variant="outline" className="bg-purple-50 text-purple-900 border-purple-300 font-mono text-[10px]">Em Análise</Badge>;
        case 'Closed':
        case '5':
            return <Badge variant="outline" className="bg-emerald-50 text-emerald-900 border-emerald-300 font-mono text-[10px]">Encerrado</Badge>;
        default:
            return <Badge variant="outline" className="bg-slate-50 text-slate-700 font-mono text-[10px]">{statusStr}</Badge>;
    }
};

export default function InventarioGestaoPage() {
    const navigate = useNavigate();
    const [plans, setPlans] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Filtros de Lista
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Paginação dos Cards
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 6;

    const loadData = async () => {
        try {
            setIsLoading(true);
            const [plansRes, metricsRes] = await Promise.all([
                customInstance({ url: '/api/cycle-count/plans', method: 'GET' }),
                customInstance({ url: '/api/cycle-count/metrics', method: 'GET' })
            ]);
            setPlans(plansRes || []);
            setMetrics(metricsRes || null);
        } catch {
            toast.error('Erro ao carregar dados de inventário.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Filtro Client-side
    const filteredPlans = useMemo(() => {
        return plans.filter(p => {
            const matchesSearch = !searchTerm.trim() || p.name?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [plans, searchTerm, statusFilter]);

    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
        setPage(1);
    };

    const handleStatusChange = (value) => {
        setStatusFilter(value);
        setPage(1);
    };

    const totalCount = filteredPlans.length;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const paginatedPlans = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filteredPlans.slice(start, start + PAGE_SIZE);
    }, [filteredPlans, page]);

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-200/80 rounded-xl shadow-2xs">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <ClipboardCheck className="text-blue-600" size={24} /> Gestão & Painel de Inventários Cíclicos
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Acompanhe o Índice de Acuracidade Global (IRA), gerencie planos de contagem cega e efetue conciliações fiscais.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button onClick={loadData} variant="outline" size="sm" className="bg-white border-slate-200 text-slate-700 text-xs h-9">
                        <RefreshCw size={14} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
                    </Button>
                    <Button onClick={() => navigate('/inventario/gestao/novo')} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 shadow-2xs">
                        <Plus size={16} className="mr-1.5" /> Novo Plano de Inventário
                    </Button>
                </div>
            </div>

            {/* KPI CARDS EXECUTIVOS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-white border-slate-200/80 shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Acuracidade Global (IRA)</span>
                            <TrendingUp size={16} className="text-emerald-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <span className="text-2xl font-bold font-mono text-emerald-700">{metrics?.globalIraRate ?? 100}%</span>
                        <p className="text-[10px] text-slate-400 mt-1">Taxa de acuracidade das posições contadas</p>
                    </CardContent>
                </Card>

                <Card className="bg-white border-slate-200/80 shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Planos Em Contagem</span>
                            <Boxes size={16} className="text-blue-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <span className="text-2xl font-bold font-mono text-blue-700">{metrics?.activePlansCount ?? 0}</span>
                        <p className="text-[10px] text-slate-400 mt-1">De um total de {metrics?.totalPlansCount ?? 0} inventários</p>
                    </CardContent>
                </Card>

                <Card className="bg-white border-slate-200/80 shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Divergências Físicas</span>
                            <AlertTriangle size={16} className="text-amber-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <span className="text-2xl font-bold font-mono text-amber-700">{metrics?.divergentTasksCount ?? 0}</span>
                        <p className="text-[10px] text-slate-400 mt-1">Posições com divergência entre físico e sistêmico</p>
                    </CardContent>
                </Card>

                <Card className="bg-white border-slate-200/80 shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Ajustes Fiscais Pendentes</span>
                            <FileText size={16} className="text-purple-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <span className="text-2xl font-bold font-mono text-purple-700">{metrics?.pendingFiscalAdjustmentsCount ?? 0}</span>
                        <p className="text-[10px] text-slate-400 mt-1">Aguardando emissão/vínculo de NF-e</p>
                    </CardContent>
                </Card>
            </div>

            {/* FILTROS E LISTA DE PLANOS */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 max-w-lg">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Buscar inventário por nome..."
                                value={searchTerm}
                                onChange={handleSearchChange}
                                className="pl-9 bg-white text-xs h-9 border-slate-200"
                            />
                        </div>

                        <div className="w-48">
                            <Select value={statusFilter} onValueChange={handleStatusChange}>
                                <SelectTrigger className="bg-white text-xs h-9 border-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Todos os Status</SelectItem>
                                    <SelectItem value="Draft">Rascunho</SelectItem>
                                    <SelectItem value="ApprovedForCounting">Aprovado p/ Contagem</SelectItem>
                                    <SelectItem value="InCounting">Em Contagem</SelectItem>
                                    <SelectItem value="InReview">Em Análise / Revisão</SelectItem>
                                    <SelectItem value="Closed">Encerrado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Badge variant="outline" className="bg-slate-50 font-mono text-xs text-slate-600">
                        {totalCount} {totalCount === 1 ? 'Inventário' : 'Inventários'}
                    </Badge>
                </div>

                {/* CARDS NAVEGÁVEIS DOS PLANOS */}
                {isLoading ? (
                    <div className="h-32 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
                ) : paginatedPlans.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        Nenhum inventário encontrado para os filtros aplicados.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                            {paginatedPlans.map((p) => {
                                const progressPercent = p.totalTasks > 0 ? Math.round((p.resolvedTasks / p.totalTasks) * 100) : 0;

                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => navigate(`/inventario/gestao/${p.id}`)}
                                        className="bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all rounded-xl p-4 cursor-pointer flex flex-col justify-between space-y-3 group"
                                    >
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                {renderPlanStatusBadge(p.status)}
                                                <span className="text-xs font-bold font-mono text-blue-700">{progressPercent}% Concluído</span>
                                            </div>

                                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">{p.name}</h3>
                                            <p className="text-xs text-slate-500 truncate">Depositante: <span className="font-semibold text-slate-700">{p.customerName || 'Todos os Depositantes'}</span></p>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                                            <span>{p.resolvedTasks} de {p.totalTasks} Posições</span>
                                            <span className="text-blue-600 font-semibold flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                                                Detalhes <ChevronRight size={14} />
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* CONTROLES DE PAGINAÇÃO */}
                        {totalCount > 0 && (
                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
                                <span>
                                    Mostrando {Math.min((page - 1) * PAGE_SIZE + 1, totalCount)} a {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount} inventários
                                </span>
                                <div className="flex gap-2 items-center">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="h-7 text-xs bg-white border-slate-200"
                                    >
                                        Anterior
                                    </Button>
                                    <span className="text-xs font-mono text-slate-600 px-1">
                                        Página {page} de {totalPages || 1}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page >= totalPages || totalPages === 0}
                                        className="h-7 text-xs bg-white border-slate-200"
                                    >
                                        Próxima
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}