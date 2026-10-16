import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { customInstance } from '@/api/orval-mutator';
import { useGetApiCustomers } from '@/api/generated/customers/customers';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Receipt, DollarSign, Calendar, Plus, Trash2, Loader2,
    CheckCircle2, RefreshCw, Code2, Edit3, Info, Eye,
    TrendingUp, Clock
} from 'lucide-react';
import { toast } from 'sonner';

// Utilitário para formatar datas UTC sem retroceder o dia devido ao fuso horário
const formatDatePtBr = (dateValue) => {
    if (!dateValue) return '-';
    if (typeof dateValue === 'string') {
        const clean = dateValue.split('T')[0];
        const parts = clean.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${day}/${month}/${year}`;
        }
    }
    return new Date(dateValue).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

// Data local atual em formato YYYY-MM-DD para defaultValues
const getTodayLocalString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Schemas Zod
const tariffSchema = z.object({
    customerId: z.string().min(1, 'Selecione o depositante.'),
    billingServiceId: z.string().min(1, 'Selecione o serviço.'),
    unitValue: z.number().min(0, 'Informe um valor válido.'),
    validFrom: z.string().min(1, 'Informe a data de início da vigência.')
});

const cycleSchema = z.object({
    customerId: z.string().min(1, 'Selecione o depositante.'),
    referenceMonth: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/, 'Formato deve ser MM/YYYY (Ex: 10/2026)'),
    startDate: z.string().min(1, 'Informe a data inicial.'),
    endDate: z.string().min(1, 'Informe a data final.')
});

const serviceSchema = z.object({
    name: z.string().min(1, 'Informe o nome do serviço.'),
    type: z.string().min(1, 'Selecione a modalidade.'),
    sqlTemplate: z.string().optional()
});

export default function TarifasECiclosPage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('tariffs');
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');

    // Modais
    const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);
    const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
    const [editingServiceId, setEditingServiceId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Listas Auxiliares
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    // Forms
    const { handleSubmit: submitTariff, setValue: setTariffValue, watch: watchTariff, reset: resetTariff, formState: { errors: tariffErrors } } = useForm({
        resolver: zodResolver(tariffSchema),
        defaultValues: {
            customerId: '',
            billingServiceId: '',
            unitValue: 0,
            validFrom: getTodayLocalString()
        }
    });

    const { handleSubmit: submitCycle, setValue: setCycleValue, watch: watchCycle, reset: resetCycle, formState: { errors: cycleErrors } } = useForm({
        resolver: zodResolver(cycleSchema),
        defaultValues: {
            customerId: '',
            referenceMonth: `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`,
            startDate: '',
            endDate: ''
        }
    });

    const { handleSubmit: submitService, setValue: setServiceValue, watch: watchService, reset: resetService, formState: { errors: serviceErrors } } = useForm({
        resolver: zodResolver(serviceSchema),
        defaultValues: { name: '', type: 'Automatic_Daily', sqlTemplate: '' }
    });

    const watchServiceType = watchService('type');

    // Estados da API
    const [tariffs, setTariffs] = useState([]);
    const [services, setServices] = useState([]);
    const [cycles, setCycles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const customerParam = selectedCustomer !== 'ALL' ? `?customerId=${selectedCustomer}` : '';

            const [tariffsRes, servicesRes, cyclesRes] = await Promise.all([
                customInstance({ url: `/api/billing/tariffs${customerParam}`, method: 'GET' }),
                customInstance({ url: '/api/billing/services', method: 'GET' }),
                customInstance({ url: `/api/billing/cycles${customerParam}`, method: 'GET' })
            ]);

            setTariffs(Array.isArray(tariffsRes) ? tariffsRes : []);
            setServices(Array.isArray(servicesRes) ? servicesRes : []);
            setCycles(Array.isArray(cyclesRes) ? cyclesRes : []);
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
        const totalTariffsCount = tariffs.length;
        const totalServicesCount = services.length;
        const activeCycles = cycles.filter(c => c.status === 'Draft');
        const openCyclesAmount = activeCycles.reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0);

        return {
            totalTariffsCount,
            totalServicesCount,
            openCyclesCount: activeCycles.length,
            openCyclesAmount
        };
    }, [tariffs, services, cycles]);

    // Handlers Tarifas (Garante que a data seja salva exatamente como informada)
    const onSaveTariff = async (data) => {
        try {
            setIsSubmitting(true);
            // Monta a data no início do dia UTC correspondente ao dia civil selecionado
            const validFromUtc = `${data.validFrom.split('T')[0]}T00:00:00.000Z`;

            await customInstance({
                url: '/api/billing/tariffs',
                method: 'POST',
                data: {
                    customerId: data.customerId,
                    billingServiceId: data.billingServiceId,
                    unitValue: Number(data.unitValue),
                    validFrom: validFromUtc
                }
            });
            toast.success('Tarifa configurada com sucesso!');
            setIsTariffModalOpen(false);
            resetTariff({ customerId: '', billingServiceId: '', unitValue: 0, validFrom: getTodayLocalString() });
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar tarifa.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTariff = async (id) => {
        if (!confirm('Deseja realmente remover esta tarifa contratual?')) return;
        try {
            await customInstance({ url: `/api/billing/tariffs/${id}`, method: 'DELETE' });
            toast.success('Tarifa removida!');
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao remover tarifa.');
        }
    };

    // Handlers Ciclos (Garante o início do dia para startDate e fim do dia para endDate)
    const onSaveCycle = async (data) => {
        try {
            setIsSubmitting(true);
            const startUtc = `${data.startDate.split('T')[0]}T00:00:00.000Z`;
            const endUtc = `${data.endDate.split('T')[0]}T23:59:59.999Z`;

            await customInstance({
                url: '/api/billing/cycles/generate',
                method: 'POST',
                data: {
                    customerId: data.customerId,
                    referenceMonth: data.referenceMonth,
                    startDate: startUtc,
                    endDate: endUtc
                }
            });
            toast.success('Ciclo de faturamento aberto com sucesso!');
            setIsCycleModalOpen(false);
            resetCycle();
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao abrir ciclo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handlers Serviços & SQL
    const onSaveService = async (data) => {
        try {
            setIsSubmitting(true);
            const isAutoDaily = data.type === 'Automatic_Daily' || data.type === 'Automatic_SQL' || data.type === 1;
            const payload = {
                name: data.name.trim(),
                type: isAutoDaily ? 1 : 2,
                sqlTemplate: data.sqlTemplate?.trim() || null,
                isActive: true
            };

            if (editingServiceId) {
                await customInstance({ url: `/api/billing/services/${editingServiceId}`, method: 'PUT', data: payload });
                toast.success('Serviço logístico atualizado com sucesso!');
            } else {
                await customInstance({ url: '/api/billing/services', method: 'POST', data: payload });
                toast.success('Serviço logístico cadastrado com sucesso!');
            }

            setIsServiceModalOpen(false);
            setEditingServiceId(null);
            resetService();
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar serviço logístico.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditService = (service) => {
        setEditingServiceId(service.id);
        setServiceValue('name', service.name);
        setServiceValue('type', service.type === 'Automatic_Daily' || service.type === 'Automatic_SQL' || service.type === 1 ? 'Automatic_Daily' : 'Operational_Event');
        setServiceValue('sqlTemplate', service.sqlTemplate || '');
        setIsServiceModalOpen(true);
    };

    const handleDeleteService = async (id) => {
        if (!confirm('Deseja realmente excluir este serviço?')) return;
        try {
            await customInstance({ url: `/api/billing/services/${id}`, method: 'DELETE' });
            toast.success('Serviço excluído!');
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir serviço.');
        }
    };

    const applySqlPreset = (presetKey) => {
        let sql = '';
        switch (presetKey) {
            case 'storage_daily':
                sql = `-- Armazenagem Diária (Rotina Noturna)
SELECT 
    DATE(@DataReferencia) AS "DATA",
    COUNT(h."Id") AS "VOLUME",
    COUNT(h."Id") * @ServicoValor AS "VALOR_TOTAL"
FROM "HandlingUnits" h
WHERE h."CompanyId" = @ArmazemId
  AND h."CustomerId" = @DepositanteId
  AND h."Status" IN (1, 2)
  AND h."CreatedAt" <= @CobrancaDataFim;`;
                break;
            case 'ad_valorem':
                sql = `-- Seguro / Ad-Valorem Diário (Sobre valor de mercadoria)
SELECT 
    DATE(@DataReferencia) AS "DATA",
    COUNT(h."Id") AS "VOLUME",
    ROUND(SUM(h."CurrentQuantity" * h."UnitValue") * (@ServicoValor / 100.0) / 30.0, 2) AS "VALOR_TOTAL"
FROM "HandlingUnits" h
WHERE h."CompanyId" = @ArmazemId
  AND h."CustomerId" = @DepositanteId
  AND h."Status" IN (1, 2)
  AND h."CreatedAt" <= @CobrancaDataFim;`;
                break;
            case 'inbound_volumes':
                sql = `-- Recebimento por Tipo de Volume (Inbound)
SELECT
    pt."Code" AS "TIPO_VOLUME",
    pt."Description" AS "DESCRICAO",
    COUNT(h."Id") AS "VOLUME",
    ROUND(
        CASE pt."Code"
            WHEN 'PLT' THEN 12.00
            WHEN 'CX'  THEN 1.80
            WHEN 'UN'  THEN 0.90
            ELSE 0.90
        END * COALESCE(NULLIF(@ServicoValor, 0), 1.0),
        2
    ) AS "VALOR_UNITARIO",
    ROUND(
        COUNT(h."Id") *
        (CASE pt."Code"
            WHEN 'PLT' THEN 12.00
            WHEN 'CX'  THEN 1.80
            WHEN 'UN'  THEN 0.90
            ELSE 0.90
        END * COALESCE(NULLIF(@ServicoValor, 0), 1.0)),
        2
    ) AS "VALOR_TOTAL"
FROM "HandlingUnits" h
JOIN "PackagingTypes" pt ON pt."Id" = h."PackagingTypeId"
WHERE h."ReceiptDocumentId" = @OrdemId
  AND h."CustomerId" = @DepositanteId
GROUP BY pt."Code", pt."Description";`;
                break;
            case 'outbound_handling':
                sql = `-- Expedição / Handling Out por Embalagem (Outbound - Momento 1)
SELECT
    pt."Code" AS "TIPO_VOLUME",
    pt."Description" AS "DESCRICAO",
    SUM(p."VolumeCount") AS "VOLUME",
    ROUND(
        CASE pt."Code"
            WHEN 'PLT' THEN 12.00
            WHEN 'CX'  THEN 1.80
            WHEN 'UN'  THEN 0.90
            ELSE 0.90
        END * COALESCE(NULLIF(@ServicoValor, 0), 1.0),
        2
    ) AS "VALOR_UNITARIO",
    ROUND(
        SUM(p."VolumeCount") *
        (CASE pt."Code"
            WHEN 'PLT' THEN 12.00
            WHEN 'CX'  THEN 1.80
            WHEN 'UN'  THEN 0.90
            ELSE 0.90
        END * COALESCE(NULLIF(@ServicoValor, 0), 1.0)),
        2
    ) AS "VALOR_TOTAL"
FROM "OutboundItemPacks" p
JOIN "PackagingTypes" pt ON pt."Id" = p."PackagingTypeId"
WHERE p."OutboundOrderId" = @OrdemId
GROUP BY pt."Code", pt."Description";`;
                break;
            case 'outbound_stretch':
                sql = `-- Insumo Filme Stretch Aplicado (Outbound - Momento 2)
SELECT
    pt."Code" AS "TIPO_VOLUME",
    'Aplicação Filme Stretch' AS "DESCRICAO",
    COUNT(v."Id") AS "VOLUME",
    ROUND(COALESCE(NULLIF(@ServicoValor, 0), 15.00), 2) AS "VALOR_UNITARIO",
    ROUND(COUNT(v."Id") * COALESCE(NULLIF(@ServicoValor, 0), 15.00), 2) AS "VALOR_TOTAL"
FROM "OutboundVolumes" v
JOIN "PackagingTypes" pt ON pt."Id" = v."PackagingTypeId"
WHERE v."OutboundOrderId" = @OrdemId
  AND v."UsedStretchFilm" = TRUE
GROUP BY pt."Code";`;
                break;
            default:
                break;
        }
        setServiceValue('sqlTemplate', sql);
        toast.info('Template SQL carregado!');
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
                        <Receipt className="text-emerald-600" size={26} /> Gestão de Faturamento & Tarifação WMS
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Regras contratuais de diárias (Armazenagem/Ad-Valorem), eventos operacionais (Inbound/Outbound) e fechamento de ciclos.
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

                    <Button onClick={loadData} variant="outline" size="sm" className="bg-white h-9 px-3">
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                </div>
            </div>

            {/* CARDS DE INDICADORES (KPIS) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Tarifas em Vigor</span>
                            <DollarSign size={16} className="text-emerald-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-slate-900">{kpis.totalTariffsCount}</p>
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
                        <p className="text-2xl font-bold font-mono text-slate-900">{kpis.totalServicesCount}</p>
                        <span className="text-[10px] text-slate-400">Diários & Operacionais</span>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 bg-white shadow-2xs">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-semibold text-slate-500 uppercase flex items-center justify-between">
                            <span>Ciclos em Aberto</span>
                            <Clock size={16} className="text-blue-600" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <p className="text-2xl font-bold font-mono text-blue-700">{kpis.openCyclesCount}</p>
                        <span className="text-[10px] text-slate-400">Recebendo lançamentos</span>
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
                        <span className="text-[10px] text-slate-400">Soma dos ciclos abertos</span>
                    </CardContent>
                </Card>
            </div>

            {/* NAVEGAÇÃO DE TABS */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 space-y-4">
                <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl p-1.5 shadow-2xs">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="tariffs" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-bold gap-2">
                            <DollarSign className="w-4 h-4 text-emerald-600" /> Tarifas Contratuais ({tariffs.length})
                        </TabsTrigger>
                        <TabsTrigger value="services" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-bold gap-2">
                            <Code2 className="w-4 h-4 text-purple-600" /> Catálogo de Serviços & SQL ({services.length})
                        </TabsTrigger>
                        <TabsTrigger value="cycles" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-bold gap-2">
                            <Calendar className="w-4 h-4 text-blue-600" /> Ciclos Mensais & Extratos ({cycles.length})
                        </TabsTrigger>
                    </TabsList>

                    <div>
                        {activeTab === 'tariffs' && (
                            <Button onClick={() => setIsTariffModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-bold shadow-xs">
                                <Plus size={14} className="mr-1" /> Nova Tarifa
                            </Button>
                        )}
                        {activeTab === 'services' && (
                            <Button onClick={() => { setEditingServiceId(null); resetService(); setIsServiceModalOpen(true); }} className="bg-purple-600 hover:bg-purple-700 text-white h-8 text-xs font-bold shadow-xs">
                                <Plus size={14} className="mr-1" /> Novo Serviço / SQL
                            </Button>
                        )}
                        {activeTab === 'cycles' && (
                            <Button onClick={() => setIsCycleModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs font-bold shadow-xs">
                                <Plus size={14} className="mr-1" /> Abrir Ciclo de Cobrança
                            </Button>
                        )}
                    </div>
                </div>

                {/* TAB 1: TARIFAS */}
                {activeTab === 'tariffs' && (
                    <Card className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Depositante</TableHead>
                                    <TableHead>Serviço Vinculado</TableHead>
                                    <TableHead>Início Vigência</TableHead>
                                    <TableHead className="text-right">Tarifa Contratual (R$)</TableHead>
                                    <TableHead className="text-right w-20"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={5} className="h-28 text-center text-xs text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto text-emerald-600" /></TableCell></TableRow>
                                ) : tariffs.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="h-28 text-center text-xs text-slate-400 italic">Nenhuma tarifa cadastrada para o filtro selecionado.</TableCell></TableRow>
                                ) : tariffs.map(t => (
                                    <TableRow key={t.id} className="hover:bg-slate-50/50">
                                        <TableCell className="font-bold text-slate-900 text-xs">{t.customerName}</TableCell>
                                        <TableCell className="text-xs text-slate-700 font-medium">
                                            <span className="font-semibold text-slate-800">{t.serviceName}</span>
                                        </TableCell>
                                        <TableCell className="text-xs font-mono text-slate-700">
                                            {formatDatePtBr(t.validFrom)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-emerald-700 text-sm">
                                            R$ {t.unitValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 10 })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteTariff(t.id)} className="text-slate-400 hover:text-rose-600 h-8 w-8 p-0">
                                                <Trash2 size={14} />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>
                )}

                {/* TAB 2: SERVIÇOS & QUERIES SQL */}
                {activeTab === 'services' && (
                    <Card className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Nome do Serviço</TableHead>
                                    <TableHead>Modalidade de Apuração</TableHead>
                                    <TableHead>Modelo SQL de Cobrança</TableHead>
                                    <TableHead className="text-right w-24">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={4} className="h-28 text-center text-xs text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto text-purple-600" /></TableCell></TableRow>
                                ) : services.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="h-28 text-center text-xs text-slate-400 italic">Nenhum serviço logístico cadastrado.</TableCell></TableRow>
                                ) : services.map(s => {
                                    const isAutoDaily = s.type === 'Automatic_Daily' || s.type === 'Automatic_SQL' || s.type === 1;

                                    return (
                                        <TableRow key={s.id} className="hover:bg-slate-50/50">
                                            <TableCell className="font-bold text-slate-900 text-xs">
                                                {s.name}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={`text-[10px] font-semibold border ${isAutoDaily
                                                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                                                    : 'bg-blue-50 text-blue-800 border-blue-200'
                                                    }`}>
                                                    {isAutoDaily ? '⚡ Diário (Rotina Noturna / Cron)' : '📦 Operacional (Eventos / Apontamento)'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-[11px] text-slate-600 max-w-lg truncate">
                                                {s.sqlTemplate ? (
                                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                                                        {s.sqlTemplate.replace(/\s+/g, ' ')}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 italic">Sem query vinculada (Tarifação Direta)</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => handleEditService(s)} className="text-blue-600 hover:bg-blue-50 h-8 w-8 p-0" title="Editar">
                                                        <Edit3 size={14} />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteService(s.id)} className="text-rose-500 hover:bg-rose-50 h-8 w-8 p-0" title="Excluir">
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </Card>
                )}

                {/* TAB 3: CICLOS */}
                {activeTab === 'cycles' && (
                    <Card className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Competência</TableHead>
                                    <TableHead>Depositante</TableHead>
                                    <TableHead>Período Contábil</TableHead>
                                    <TableHead className="text-right">Total Acumulado</TableHead>
                                    <TableHead className="text-center">Situação</TableHead>
                                    <TableHead className="text-right w-36">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={6} className="h-28 text-center text-xs text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-600" /></TableCell></TableRow>
                                ) : cycles.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="h-28 text-center text-xs text-slate-400 italic">Nenhum ciclo de apuração aberto.</TableCell></TableRow>
                                ) : cycles.map(c => {
                                    const isDraft = c.status === 'Draft' || c.status === '1';

                                    return (
                                        <TableRow key={c.id} className="hover:bg-slate-50/50">
                                            <TableCell className="font-bold font-mono text-slate-900 text-xs">{c.referenceMonth}</TableCell>
                                            <TableCell className="font-semibold text-slate-800 text-xs">{c.customerName}</TableCell>
                                            <TableCell className="text-xs font-mono text-slate-700">
                                                {formatDatePtBr(c.startDate)} a {formatDatePtBr(c.endDate)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold text-emerald-700 text-sm">
                                                {(c.totalAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge className={`text-[10px] font-semibold border ${isDraft
                                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                                    }`}>
                                                    {isDraft ? '🟢 Aberto (Acumulando)' : '🔒 Encerrado'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    onClick={() => navigate(`/billing/ciclos/${c.id}`)}
                                                    variant="outline" size="sm"
                                                    className="h-8 text-xs bg-white text-slate-700 hover:bg-slate-100 font-semibold"
                                                >
                                                    <Eye size={13} className="mr-1 text-slate-500" /> Extrato Analítico
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </Card>
                )}
            </Tabs>

            {/* MODAL CONFIGURAR TARIFA */}
            <Dialog open={isTariffModalOpen} onOpenChange={setIsTariffModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <DollarSign className="text-emerald-600" size={20} /> Cadastrar Tarifa por Depositante
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Defina o valor cobrado para o serviço contratado pelo cliente.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={submitTariff(onSaveTariff)} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Depositante *</Label>
                            <Select value={watchTariff('customerId')} onValueChange={(v) => setTariffValue('customerId', v, { shouldValidate: true })}>
                                <SelectTrigger className="bg-white text-xs h-9"><SelectValue placeholder="Escolha o depositante..." /></SelectTrigger>
                                <SelectContent>
                                    {customers.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {tariffErrors.customerId && <p className="text-[10px] text-rose-500">{tariffErrors.customerId.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Serviço Logístico *</Label>
                            <Select value={watchTariff('billingServiceId')} onValueChange={(v) => setTariffValue('billingServiceId', v, { shouldValidate: true })}>
                                <SelectTrigger className="bg-white text-xs h-9"><SelectValue placeholder="Escolha o serviço..." /></SelectTrigger>
                                <SelectContent>
                                    {services.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {tariffErrors.billingServiceId && <p className="text-[10px] text-rose-500">{tariffErrors.billingServiceId.message}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Valor Unitário R$ *</Label>
                                <Input
                                    type="number"
                                    step="any"
                                    placeholder="0,0000000000"
                                    onChange={(e) => setTariffValue('unitValue', parseFloat(e.target.value) || 0, { shouldValidate: true })}
                                    className="bg-white font-mono text-xs h-9"
                                />
                                {tariffErrors.unitValue && <p className="text-[10px] text-rose-500">{tariffErrors.unitValue.message}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Início da Vigência *</Label>
                                <Input
                                    type="date"
                                    value={watchTariff('validFrom')}
                                    onChange={(e) => setTariffValue('validFrom', e.target.value, { shouldValidate: true })}
                                    className="bg-white text-xs font-mono h-9"
                                />
                                {tariffErrors.validFrom && <p className="text-[10px] text-rose-500">{tariffErrors.validFrom.message}</p>}
                            </div>
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsTariffModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                                Gravar Tarifa
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL SERVIÇO LOGÍSTICO & TEMPLATES SQL */}
            <Dialog open={isServiceModalOpen} onOpenChange={setIsServiceModalOpen}>
                <DialogContent className="sm:max-w-3xl bg-white max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Code2 className="text-purple-600" size={20} />
                            {editingServiceId ? 'Editar Serviço Logístico' : 'Cadastrar Serviço & Regra SQL'}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Configure o modelo de tarifação. Serviços com query SQL são calculados automaticamente pelo motor de banco de dados.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={submitService(onSaveService)} className="space-y-4 py-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Nome do Serviço *</Label>
                                <Input
                                    placeholder="Ex: Armazenagem Diária (Palete) / Expedição de Caixa"
                                    value={watchService('name')}
                                    onChange={(e) => setServiceValue('name', e.target.value, { shouldValidate: true })}
                                    className="bg-white text-xs h-9"
                                />
                                {serviceErrors.name && <p className="text-[10px] text-rose-500">{serviceErrors.name.message}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Modalidade de Apuração *</Label>
                                <Select value={watchServiceType} onValueChange={(v) => setServiceValue('type', v, { shouldValidate: true })}>
                                    <SelectTrigger className="bg-white text-xs h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Automatic_Daily">⚡ Diário Automático (Armazenagem / Ad-Valorem Noturno)</SelectItem>
                                        <SelectItem value="Operational_Event">📦 Operacional / Evento (Recebimento, Expedição, Stretch, Manual)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* PRESETS SQL DE 1-CLIQUE */}
                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <Code2 size={14} className="text-purple-600" /> Query SQL Dinâmica (PostgreSQL Dapper)
                                </Label>

                                <div className="flex flex-wrap gap-1">
                                    <span className="text-[10px] text-slate-400 self-center mr-1">Carregar Modelo:</span>
                                    <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('storage_daily')} className="h-6 text-[10px] px-2 bg-slate-50">
                                        Armazenagem
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('ad_valorem')} className="h-6 text-[10px] px-2 bg-slate-50">
                                        Ad-Valorem
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('inbound_volumes')} className="h-6 text-[10px] px-2 bg-slate-50">
                                        Recebimento
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('outbound_handling')} className="h-6 text-[10px] px-2 bg-slate-50">
                                        Handling Out
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('outbound_stretch')} className="h-6 text-[10px] px-2 bg-slate-50">
                                        Stretch
                                    </Button>
                                </div>
                            </div>

                            <Textarea
                                rows={8}
                                placeholder="SELECT COUNT(*) AS VOLUME, COUNT(*) * @ServicoValor AS VALOR_TOTAL FROM ..."
                                value={watchService('sqlTemplate')}
                                onChange={(e) => setServiceValue('sqlTemplate', e.target.value)}
                                className="font-mono text-xs bg-slate-900 text-emerald-400 p-3 leading-relaxed border-slate-800 focus:ring-purple-500 rounded-xl"
                            />

                            <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl text-xs space-y-1.5 text-purple-950">
                                <p className="font-bold flex items-center gap-1">
                                    <Info size={14} className="text-purple-700" /> Parâmetros Dinâmicos Substituídos pelo Motor:
                                </p>
                                <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                                    <Badge variant="outline" className="bg-white">@ArmazemId</Badge>
                                    <Badge variant="outline" className="bg-white">@DepositanteId</Badge>
                                    <Badge variant="outline" className="bg-white">@ServicoValor</Badge>
                                    <Badge variant="outline" className="bg-white">@DataReferencia</Badge>
                                    <Badge variant="outline" className="bg-white">@OrdemId</Badge>
                                    <Badge variant="outline" className="bg-white">@OrderItemId</Badge>
                                    <Badge variant="outline" className="bg-white">@CobrancaDataIni</Badge>
                                    <Badge variant="outline" className="bg-white">@CobrancaDataFim</Badge>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsServiceModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700 text-white min-w-[130px] font-bold h-9">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                                Salvar Serviço
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL ABERTURA DE CICLO */}
            <Dialog open={isCycleModalOpen} onOpenChange={setIsCycleModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Calendar className="text-blue-600" size={20} /> Abertura de Ciclo de Faturamento
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Abre o período mensal para coletar lançamentos operacionais e diárias automatizadas.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={submitCycle(onSaveCycle)} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Depositante *</Label>
                            <Select value={watchCycle('customerId')} onValueChange={(v) => setCycleValue('customerId', v, { shouldValidate: true })}>
                                <SelectTrigger className="bg-white text-xs h-9"><SelectValue placeholder="Escolha o depositante..." /></SelectTrigger>
                                <SelectContent>
                                    {customers.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {cycleErrors.customerId && <p className="text-[10px] text-rose-500">{cycleErrors.customerId.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Competência (MM/YYYY) *</Label>
                            <Input
                                placeholder="Ex: 10/2026"
                                value={watchCycle('referenceMonth')}
                                onChange={(e) => setCycleValue('referenceMonth', e.target.value, { shouldValidate: true })}
                                className="bg-white font-mono text-xs h-9"
                            />
                            {cycleErrors.referenceMonth && <p className="text-[10px] text-rose-500">{cycleErrors.referenceMonth.message}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Data Inicial *</Label>
                                <Input
                                    type="date"
                                    onChange={(e) => setCycleValue('startDate', e.target.value, { shouldValidate: true })}
                                    className="bg-white text-xs h-9"
                                />
                                {cycleErrors.startDate && <p className="text-[10px] text-rose-500">{cycleErrors.startDate.message}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Data Final *</Label>
                                <Input
                                    type="date"
                                    onChange={(e) => setCycleValue('endDate', e.target.value, { shouldValidate: true })}
                                    className="bg-white text-xs h-9"
                                />
                                {cycleErrors.endDate && <p className="text-[10px] text-rose-500">{cycleErrors.endDate.message}</p>}
                            </div>
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsCycleModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                                Abrir Ciclo
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}