import { useState, useEffect, useMemo } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { useGetApiCustomers } from '@/api/generated/customers/customers';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Receipt, DollarSign, Calendar, RefreshCw, Code2, TrendingUp, Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';

// Importações dos módulos na mesma pasta
import TabCiclos from './TabCiclos';
import TabTarifas from './TabTarifas';
import TabServicos from './TabServicos';
import ModalCiclo from './ModalCiclo';
import ModalTarifa from './ModalTarifa';
import ModalServico from './ModalServico';

export default function TarifasECiclosPage() {
    // A aba principal passa a ser a de Ciclos Mensais
    const [activeTab, setActiveTab] = useState('cycles');
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');

    // Modais
    const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
    const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
    const [editingService, setEditingService] = useState(null);

    // Listas Auxiliares
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    // Estados da API
    const [cycles, setCycles] = useState([]);
    const [tariffs, setTariffs] = useState([]);
    const [services, setServices] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const customerParam = selectedCustomer !== 'ALL' ? `?customerId=${selectedCustomer}` : '';

            const [cyclesRes, tariffsRes, servicesRes] = await Promise.all([
                customInstance({ url: `/api/billing/cycles${customerParam}`, method: 'GET' }),
                customInstance({ url: `/api/billing/tariffs${customerParam}`, method: 'GET' }),
                customInstance({ url: '/api/billing/services', method: 'GET' })
            ]);

            setCycles(Array.isArray(cyclesRes) ? cyclesRes : []);
            setTariffs(Array.isArray(tariffsRes) ? tariffsRes : []);
            setServices(Array.isArray(servicesRes) ? servicesRes : []);
        } catch {
            toast.error('Erro ao carregar dados de faturamento.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedCustomer]);

    // Resumo de KPIs do Topo
    const kpis = useMemo(() => {
        const activeCycles = cycles.filter(c => c.status === 'Draft');
        return {
            openCyclesCount: activeCycles.length,
            openCyclesAmount: activeCycles.reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0),
            totalTariffs: tariffs.length,
            totalServices: services.length
        };
    }, [cycles, tariffs, services]);

    const handleEditService = (service) => {
        setEditingService(service);
        setIsServiceModalOpen(true);
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO ORQUESTRADOR */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
                        <Receipt className="text-emerald-600" size={26} /> Gestão de Faturamento & Tarifação WMS
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Controle de ciclos mensais, extratos de apuração, regras tarifárias e serviços de banco de dados.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="w-[240px]">
                        <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                            <SelectTrigger className="bg-slate-50 h-9 text-xs border-slate-200 font-medium">
                                <SelectValue placeholder="Filtrar por Depositante" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">🏢 Todos os Depositantes</SelectItem>
                                {customers.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={loadData} variant="outline" size="sm" className="bg-white h-9 px-3" title="Atualizar dados">
                        <RefreshCw size={14} className={isLoading ? 'animate-spin text-slate-700' : 'text-slate-700'} />
                    </Button>
                </div>
            </div>

            {/* CARDS DE KPIS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-blue-200 bg-blue-50/20 shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-blue-800 uppercase flex items-center justify-between">
                            <span>Ciclos em Aberto</span>
                            <Clock size={16} className="text-blue-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-blue-700">{kpis.openCyclesCount}</p>
                        <span className="text-[10px] text-blue-600/80">Competências em apuração</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Valor Acumulado no Mês</span>
                            <TrendingUp size={16} className="text-emerald-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-emerald-700">
                            {kpis.openCyclesAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        <span className="text-[10px] text-slate-400">Total nos ciclos abertos</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Tarifas em Vigor</span>
                            <DollarSign size={16} className="text-emerald-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-slate-900">{kpis.totalTariffs}</p>
                        <span className="text-[10px] text-slate-400">Regras por cliente</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Serviços / SQL Ativos</span>
                            <Code2 size={16} className="text-purple-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-slate-900">{kpis.totalServices}</p>
                        <span className="text-[10px] text-slate-400">Diários & Operacionais</span>
                    </CardContent>
                </Card>
            </div>

            {/* ABAS COM CICLOS EM PRIMEIRO */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 space-y-4">
                <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-1.5 shadow-2xs">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="cycles" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-bold gap-2 rounded-lg">
                            <Calendar className="w-4 h-4 text-blue-600" /> Ciclos Mensais & Extratos ({cycles.length})
                        </TabsTrigger>
                        <TabsTrigger value="tariffs" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-bold gap-2 rounded-lg">
                            <DollarSign className="w-4 h-4 text-emerald-600" /> Tarifas por Depositante ({tariffs.length})
                        </TabsTrigger>
                        <TabsTrigger value="services" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-bold gap-2 rounded-lg">
                            <Code2 className="w-4 h-4 text-purple-600" /> Catálogo de Serviços & SQL ({services.length})
                        </TabsTrigger>
                    </TabsList>

                    <div>
                        {activeTab === 'cycles' && (
                            <Button onClick={() => setIsCycleModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs font-bold shadow-xs">
                                <Plus size={14} className="mr-1" /> Abrir Ciclo de Cobrança
                            </Button>
                        )}
                        {activeTab === 'tariffs' && (
                            <Button onClick={() => setIsTariffModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-bold shadow-xs">
                                <Plus size={14} className="mr-1" /> Nova Tarifa
                            </Button>
                        )}
                        {activeTab === 'services' && (
                            <Button onClick={() => { setEditingService(null); setIsServiceModalOpen(true); }} className="bg-purple-600 hover:bg-purple-700 text-white h-8 text-xs font-bold shadow-xs">
                                <Plus size={14} className="mr-1" /> Novo Serviço / SQL
                            </Button>
                        )}
                    </div>
                </div>

                <TabsContent value="cycles" className="mt-0 outline-none">
                    <TabCiclos cycles={cycles} isLoading={isLoading} />
                </TabsContent>

                <TabsContent value="tariffs" className="mt-0 outline-none">
                    <TabTarifas tariffs={tariffs} isLoading={isLoading} reload={loadData} />
                </TabsContent>

                <TabsContent value="services" className="mt-0 outline-none">
                    <TabServicos services={services} isLoading={isLoading} onEdit={handleEditService} reload={loadData} />
                </TabsContent>
            </Tabs>

            {/* MODAIS GLOBAIS */}
            <ModalCiclo isOpen={isCycleModalOpen} onOpenChange={setIsCycleModalOpen} customers={customers} reload={loadData} />
            <ModalTarifa isOpen={isTariffModalOpen} onOpenChange={setIsTariffModalOpen} customers={customers} services={services} reload={loadData} />
            <ModalServico isOpen={isServiceModalOpen} onOpenChange={setIsServiceModalOpen} editingService={editingService} reload={loadData} />
        </div>
    );
}