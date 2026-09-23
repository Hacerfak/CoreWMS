import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { customInstance } from '@/api/orval-mutator';
import { useGetApiCustomers } from '@/api/generated/customers/customers';

import { Card, CardContent } from '@/components/ui/card';
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
    CheckCircle2, Lock, RefreshCw, Code2, Edit3, Info, Eye
} from 'lucide-react';
import { toast } from 'sonner';

// Schemas
const tariffSchema = z.object({
    customerId: z.string().min(1, 'Selecione o depositante.'),
    billingServiceId: z.string().min(1, 'Selecione o serviço.'),
    unitValue: z.number().min(0, 'Informe um valor válido.'),
    validFrom: z.string().min(1, 'Informe a data de início da vigência.')
});

const cycleSchema = z.object({
    customerId: z.string().min(1, 'Selecione o depositante.'),
    referenceMonth: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/, 'Formato deve ser MM/YYYY'),
    startDate: z.string().min(1, 'Informe a data inicial.'),
    endDate: z.string().min(1, 'Informe a data final.')
});

const serviceSchema = z.object({
    name: z.string().min(1, 'Informe o nome do serviço.'),
    type: z.string().min(1, 'Selecione o tipo do cálculo.'),
    sqlTemplate: z.string().optional()
});

export default function TarifasECiclosPage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('tariffs');
    const [selectedCustomer, setSelectedCustomer] = useState('ALL');

    // Modais
    const [isTariffModalOpen, setIsTariffModalOpen] = useState(false);
    const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
    const [isServiceModalOpen, setIsActionServiceModalOpen] = useState(false);
    const [editingServiceId, setEditingServiceId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Support Lists
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 500 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    // Forms
    const { handleSubmit: submitTariff, setValue: setTariffValue, watch: watchTariff, reset: resetTariff, formState: { errors: tariffErrors } } = useForm({
        resolver: zodResolver(tariffSchema),
        defaultValues: {
            customerId: '',
            billingServiceId: '',
            unitValue: 0,
            validFrom: new Date().toISOString().slice(0, 10)
        }
    });

    const { handleSubmit: submitCycle, setValue: setCycleValue, watch: watchCycle, reset: resetCycle, formState: { errors: cycleErrors } } = useForm({
        resolver: zodResolver(cycleSchema),
        defaultValues: { customerId: '', referenceMonth: '', startDate: '', endDate: '' }
    });

    const { handleSubmit: submitService, setValue: setServiceValue, watch: watchService, reset: resetService, formState: { errors: serviceErrors } } = useForm({
        resolver: zodResolver(serviceSchema),
        defaultValues: { name: '', type: 'Automatic_SQL', sqlTemplate: '' }
    });

    const watchServiceType = watchService('type');

    // API States
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

            setTariffs(tariffsRes || []);
            setServices(servicesRes || []);
            setCycles(cyclesRes || []);
        } catch {
            toast.error('Erro ao carregar dados de faturamento.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedCustomer]);

    // Handlers Tarifas
    const onSaveTariff = async (data) => {
        try {
            setIsSubmitting(true);
            await customInstance({
                url: '/api/billing/tariffs',
                method: 'POST',
                data: {
                    customerId: data.customerId,
                    billingServiceId: data.billingServiceId,
                    unitValue: Number(data.unitValue),
                    validFrom: new Date(data.validFrom).toISOString()
                }
            });
            toast.success('Tarifa configurada com sucesso!');
            setIsTariffModalOpen(false);
            resetTariff({ customerId: '', billingServiceId: '', unitValue: 0, validFrom: new Date().toISOString().slice(0, 10) });
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.message || error.response?.data?.detail || 'Erro ao salvar tarifa.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTariff = async (id) => {
        try {
            await customInstance({ url: `/api/billing/tariffs/${id}`, method: 'DELETE' });
            toast.success('Tarifa removida!');
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao remover tarifa.');
        }
    };

    // Handlers Ciclos
    const onSaveCycle = async (data) => {
        try {
            setIsSubmitting(true);
            await customInstance({
                url: '/api/billing/cycles/generate',
                method: 'POST',
                data: {
                    customerId: data.customerId,
                    referenceMonth: data.referenceMonth,
                    startDate: new Date(data.startDate).toISOString(),
                    endDate: new Date(data.endDate).toISOString()
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
            const isAutomatic = data.type === 'Automatic_SQL';
            const payload = {
                name: data.name.trim(),
                type: isAutomatic ? 1 : 2,
                sqlTemplate: isAutomatic ? data.sqlTemplate?.trim() : null
            };

            if (editingServiceId) {
                await customInstance({ url: `/api/billing/services/${editingServiceId}`, method: 'PUT', data: payload });
                toast.success('Serviço logístico atualizado!');
            } else {
                await customInstance({ url: '/api/billing/services', method: 'POST', data: payload });
                toast.success('Serviço logístico criado com sucesso!');
            }

            setIsActionServiceModalOpen(false);
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
        setServiceValue('type', service.type === 'Automatic_SQL' || service.type === 1 ? 'Automatic_SQL' : 'Manual_Entry');
        setServiceValue('sqlTemplate', service.sqlTemplate || '');
        setIsActionServiceModalOpen(true);
    };

    const handleDeleteService = async (id) => {
        try {
            await customInstance({ url: `/api/billing/services/${id}`, method: 'DELETE' });
            toast.success('Serviço excluído!');
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir serviço.');
        }
    };

    const applyDefaultSqlExample = () => {
        const exampleSql = `-- Exemplo: Armazenagem Diária por Palete
SELECT 
    COUNT(DISTINCT h."Id") AS "VOLUME",
    COUNT(DISTINCT h."Id") * {servico_valor} AS "VALOR_DIARIA"
FROM "HandlingUnits" h
WHERE h."CompanyId" = {armazem_id}
  AND h."CustomerId" = {depositante_id}
  AND h."CreatedAt" <= {cobranca_data_fim};`;
        setServiceValue('sqlTemplate', exampleSql);
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Receipt className="text-emerald-600" size={26} /> Faturamento WMS & Tabela de Tarifas
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gerencie os preços por depositante, cadastre as regras/queries SQL e controle os ciclos de apuração.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="w-[220px]">
                        <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                            <SelectTrigger className="bg-white h-9 text-xs">
                                <SelectValue placeholder="Filtrar por Depositante" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Depositantes</SelectItem>
                                {customers.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button onClick={loadData} variant="outline" size="sm" className="bg-white h-9">
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                </div>
            </div>

            {/* TABS PRINCIPAIS */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between bg-white border border-slate-200/60 rounded-xl p-1 shadow-sm">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="tariffs" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4">
                            <DollarSign className="w-4 h-4 mr-2 text-emerald-600" /> Tarifas por Depositante
                        </TabsTrigger>
                        <TabsTrigger value="services" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4">
                            <Code2 className="w-4 h-4 mr-2 text-purple-600" /> Serviços Logísticos (Queries SQL)
                        </TabsTrigger>
                        <TabsTrigger value="cycles" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4">
                            <Calendar className="w-4 h-4 mr-2 text-blue-600" /> Ciclos de Faturamento
                        </TabsTrigger>
                    </TabsList>

                    {activeTab === 'tariffs' && (
                        <Button onClick={() => setIsTariffModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs mr-1">
                            <Plus size={15} className="mr-1" /> Nova Tarifa
                        </Button>
                    )}
                    {activeTab === 'services' && (
                        <Button onClick={() => { setEditingServiceId(null); resetService(); setIsActionServiceModalOpen(true); }} className="bg-purple-600 hover:bg-purple-700 text-white h-8 text-xs mr-1">
                            <Plus size={15} className="mr-1" /> Novo Serviço / SQL
                        </Button>
                    )}
                    {activeTab === 'cycles' && (
                        <Button onClick={() => setIsCycleModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs mr-1">
                            <Plus size={15} className="mr-1" /> Abrir Novo Ciclo
                        </Button>
                    )}
                </div>

                {/* TAB 1: TARIFAS */}
                {activeTab === 'tariffs' && (
                    <div className="mt-4 bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50/80">
                                <TableRow>
                                    <TableHead>Depositante</TableHead>
                                    <TableHead>Serviço Logístico</TableHead>
                                    <TableHead className="text-right">Valor Unitário R$</TableHead>
                                    <TableHead className="text-right w-24">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={4} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600 mx-auto" /></TableCell></TableRow>
                                ) : tariffs.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="h-28 text-center text-slate-500">Nenhuma tarifa cadastrada para este filtro.</TableCell></TableRow>
                                ) : tariffs.map((t) => (
                                    <TableRow key={t.id} className="hover:bg-slate-50/60">
                                        <TableCell className="font-semibold text-slate-900 text-xs">{t.customerName}</TableCell>
                                        <TableCell className="text-xs text-slate-800 font-medium">{t.serviceName}</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-emerald-700 text-sm">
                                            R$ {t.unitValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteTariff(t.id)} className="text-rose-500 hover:bg-rose-50 h-8 w-8 p-0">
                                                <Trash2 size={15} />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* TAB 2: SERVIÇOS & QUERIES SQL */}
                {activeTab === 'services' && (
                    <div className="mt-4 bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50/80">
                                <TableRow>
                                    <TableHead>Nome do Serviço Logístico</TableHead>
                                    <TableHead>Tipo do Cálculo</TableHead>
                                    <TableHead>Query SQL Template</TableHead>
                                    <TableHead className="text-right w-28">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={4} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin text-purple-600 mx-auto" /></TableCell></TableRow>
                                ) : services.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="h-28 text-center text-slate-500">Nenhum serviço logístico cadastrado.</TableCell></TableRow>
                                ) : services.map((s) => {
                                    const isAuto = s.type === 'Automatic_SQL' || s.type === 1;
                                    return (
                                        <TableRow key={s.id} className="hover:bg-slate-50/60">
                                            <TableCell className="font-bold text-slate-900 text-xs">{s.name}</TableCell>
                                            <TableCell>
                                                <Badge className={`text-[10px] px-2 py-0.5 border ${isAuto ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                                    {isAuto ? '⚡ Automático (SQL)' : '✍️ Apontamento Manual'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-mono text-[11px] text-slate-600 max-w-md truncate">
                                                {s.sqlTemplate ? s.sqlTemplate.replace(/\s+/g, ' ') : <span className="text-slate-400 italic">Sem SQL (Lançamento Direto)</span>}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => handleEditService(s)} className="text-blue-600 hover:bg-blue-50 h-8 w-8 p-0">
                                                        <Edit3 size={15} />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteService(s.id)} className="text-rose-500 hover:bg-rose-50 h-8 w-8 p-0">
                                                        <Trash2 size={15} />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {/* TAB 3: CICLOS */}
                {activeTab === 'cycles' && (
                    <div className="mt-4 bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50/80">
                                <TableRow>
                                    <TableHead>Competência</TableHead>
                                    <TableHead>Depositante</TableHead>
                                    <TableHead>Período de Apuração</TableHead>
                                    <TableHead className="text-right">Total Acumulado R$</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right w-36">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                                ) : cycles.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="h-28 text-center text-slate-500">Nenhum ciclo de faturamento aberto.</TableCell></TableRow>
                                ) : cycles.map((c) => (
                                    <TableRow key={c.id} className="hover:bg-slate-50/60">
                                        <TableCell className="font-bold font-mono text-slate-900 text-xs">{c.referenceMonth}</TableCell>
                                        <TableCell className="font-medium text-slate-800 text-xs">{c.customerName}</TableCell>
                                        <TableCell className="text-xs font-mono text-slate-600">
                                            {new Date(c.startDate).toLocaleDateString('pt-BR')} a {new Date(c.endDate).toLocaleDateString('pt-BR')}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-900 text-sm">
                                            R$ {c.totalAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={`text-[10px] px-2 py-0.5 border ${c.status === 'Draft' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                                {c.status === 'Draft' ? '🟢 Aberto (Coletando)' : '🔒 Encerrado/Fechado'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                onClick={() => navigate(`/billing/ciclos/${c.id}`)}
                                                variant="outline" size="sm"
                                                className="h-7 text-xs bg-white text-slate-700 hover:bg-slate-100"
                                            >
                                                <Eye size={13} className="mr-1" /> Ver Extrato
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </Tabs>

            {/* MODAL TARIFA */}
            <Dialog open={isTariffModalOpen} onOpenChange={setIsTariffModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <DollarSign className="text-emerald-600" size={20} /> Configurar Tarifa por Depositante
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={submitTariff(onSaveTariff)} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Depositante *</Label>
                            <Select value={watchTariff('customerId')} onValueChange={(v) => setTariffValue('customerId', v, { shouldValidate: true })}>
                                <SelectTrigger className="bg-white"><SelectValue placeholder="Escolha o depositante..." /></SelectTrigger>
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
                                <SelectTrigger className="bg-white"><SelectValue placeholder="Escolha o serviço..." /></SelectTrigger>
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
                                    step="0.01"
                                    placeholder="0,00"
                                    onChange={(e) => setTariffValue('unitValue', parseFloat(e.target.value) || 0, { shouldValidate: true })}
                                    className="bg-white font-mono"
                                />
                                {tariffErrors.unitValue && <p className="text-[10px] text-rose-500">{tariffErrors.unitValue.message}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Início da Vigência *</Label>
                                <Input
                                    type="date"
                                    value={watchTariff('validFrom')}
                                    onChange={(e) => setTariffValue('validFrom', e.target.value, { shouldValidate: true })}
                                    className="bg-white text-xs font-mono"
                                />
                                {tariffErrors.validFrom && <p className="text-[10px] text-rose-500">{tariffErrors.validFrom.message}</p>}
                            </div>
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsTariffModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Gravar Tarifa
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL SERVIÇO LOGÍSTICO & EDITOR SQL */}
            <Dialog open={isServiceModalOpen} onOpenChange={setIsActionServiceModalOpen}>
                <DialogContent className="sm:max-w-2xl bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Code2 className="text-purple-600" size={20} />
                            {editingServiceId ? 'Editar Serviço Logístico' : 'Cadastrar Serviço & Query SQL'}
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={submitService(onSaveService)} className="space-y-4 py-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Nome do Serviço *</Label>
                                <Input
                                    placeholder="Ex: Armazenagem Diária (Palete) / Separação de Caixa"
                                    value={watchService('name')}
                                    onChange={(e) => setServiceValue('name', e.target.value, { shouldValidate: true })}
                                    className="bg-white text-xs"
                                />
                                {serviceErrors.name && <p className="text-[10px] text-rose-500">{serviceErrors.name.message}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Tipo de Cálculo *</Label>
                                <Select value={watchServiceType} onValueChange={(v) => setServiceValue('type', v, { shouldValidate: true })}>
                                    <SelectTrigger className="bg-white text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Automatic_SQL">⚡ Automático (SQL Dinâmico)</SelectItem>
                                        <SelectItem value="Manual_Entry">✍️ Apontamento Manual</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {watchServiceType === 'Automatic_SQL' && (
                            <div className="space-y-2 pt-2 border-t">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                        Query SQL Template (PostgreSQL)
                                    </Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={applyDefaultSqlExample}
                                        className="h-6 text-[10px] px-2 bg-slate-50 text-purple-700 border-purple-200"
                                    >
                                        Carregar Exemplo
                                    </Button>
                                </div>

                                <Textarea
                                    rows={8}
                                    placeholder="SELECT COUNT(*) AS VOLUME, COUNT(*) * {servico_valor} AS VALOR_DIARIA FROM ..."
                                    value={watchService('sqlTemplate')}
                                    onChange={(e) => setServiceValue('sqlTemplate', e.target.value)}
                                    className="font-mono text-xs bg-slate-900 text-emerald-400 p-3 leading-relaxed border-slate-800 focus:ring-purple-500"
                                />

                                <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-lg text-xs space-y-1.5 text-purple-950">
                                    <p className="font-bold flex items-center gap-1">
                                        <Info size={14} className="text-purple-700" /> Tags de Substituição Automática no SQL:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                                        <Badge variant="outline" className="bg-white">{'{armazem_id}'}</Badge>
                                        <Badge variant="outline" className="bg-white">{'{depositante_id}'}</Badge>
                                        <Badge variant="outline" className="bg-white">{'{servico_valor}'}</Badge>
                                        <Badge variant="outline" className="bg-white">{'{cobranca_data_ini}'}</Badge>
                                        <Badge variant="outline" className="bg-white">{'{cobranca_data_fim}'}</Badge>
                                    </div>
                                </div>
                            </div>
                        )}

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsActionServiceModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700 text-white min-w-[130px]">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Salvar Serviço
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL NOVO CICLO */}
            <Dialog open={isCycleModalOpen} onOpenChange={setIsCycleModalOpen}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Calendar className="text-blue-600" size={20} /> Abertura de Ciclo de Apuração
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={submitCycle(onSaveCycle)} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Depositante *</Label>
                            <Select value={watchCycle('customerId')} onValueChange={(v) => setCycleValue('customerId', v, { shouldValidate: true })}>
                                <SelectTrigger className="bg-white"><SelectValue placeholder="Escolha o depositante..." /></SelectTrigger>
                                <SelectContent>
                                    {customers.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Mês de Referência (MM/YYYY) *</Label>
                            <Input
                                placeholder="Ex: 09/2026"
                                value={watchCycle('referenceMonth')}
                                onChange={(e) => setCycleValue('referenceMonth', e.target.value, { shouldValidate: true })}
                                className="bg-white font-mono text-xs"
                            />
                            {cycleErrors.referenceMonth && <p className="text-[10px] text-rose-500">{cycleErrors.referenceMonth.message}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Data Inicial *</Label>
                                <Input
                                    type="date"
                                    onChange={(e) => setCycleValue('startDate', e.target.value, { shouldValidate: true })}
                                    className="bg-white text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-700">Data Final *</Label>
                                <Input
                                    type="date"
                                    onChange={(e) => setCycleValue('endDate', e.target.value, { shouldValidate: true })}
                                    className="bg-white text-xs"
                                />
                            </div>
                        </div>

                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setIsCycleModalOpen(false)} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Abrir e Calcular Ciclo
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}