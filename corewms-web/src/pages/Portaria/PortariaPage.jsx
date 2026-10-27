import { useEffect, useState } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import {
    Truck, LogIn, LogOut, Search, Plus, Calendar, Clock, MapPin, Trash2, Ban,
    Loader2, User, RefreshCw, Warehouse, CheckCircle2, Pencil, CalendarClock,
    CheckCircle, Link2
} from 'lucide-react';
import { toast } from 'sonner';
import NovoAgendamentoModal from '@/pages/Portaria/NovoAgendamentoModal';
import VincularAgendamentoModal from '@/pages/Portaria/VincularAgendamentoModal';

const getLocalDateString = (date = new Date()) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export default function PortariaPage() {
    const [appointments, setAppointments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filtros da Agenda / Histórico
    const [filterDate, setFilterDate] = useState(getLocalDateString());
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterType, setFilterType] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    // Check-in Rápido
    const [checkinCode, setCheckinCode] = useState('');
    const [isCheckingIn, setIsCheckingIn] = useState(false);

    // Modais e Diálogos
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [appointmentToEdit, setAppointmentToEdit] = useState(null);
    const [appointmentToLink, setAppointmentToLink] = useState(null);

    const [docToCancel, setDocToCancel] = useState(null);
    const [docToDelete, setDocToDelete] = useState(null);
    const [docToMoveDock, setDocToMoveDock] = useState(null);
    const [selectedDockId, setSelectedDockId] = useState('');
    const [docks, setDocks] = useState([]);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (filterDate) {
                params.append('startDate', filterDate);
                params.append('endDate', filterDate);
            }
            if (filterStatus !== 'ALL') params.append('status', filterStatus);
            if (filterType !== 'ALL') params.append('type', filterType);
            if (searchTerm) params.append('search', searchTerm);

            const res = await customInstance({
                url: `/api/yard/appointments?${params.toString()}`,
                method: 'GET'
            });

            setAppointments(res?.data || res || []);
        } catch {
            toast.error('Erro ao carregar dados de pátio e agendamentos.');
        } finally {
            setIsLoading(false);
        }
    };

    const loadDocks = async () => {
        try {
            const res = await customInstance({ url: '/api/topology/locations/docks', method: 'GET' });
            setDocks(res?.data || res || []);
        } catch { }
    };

    useEffect(() => {
        loadData();
        loadDocks();
    }, [filterDate, filterStatus, filterType]);

    // Check-in rápido ou individual
    const handleCheckin = async (codeOrPlate) => {
        if (!codeOrPlate) return;
        try {
            setIsCheckingIn(true);
            const res = await customInstance({
                url: '/api/yard/checkin',
                method: 'POST',
                data: { codeOrPlate }
            });

            toast.success(res?.message || 'Check-in realizado com sucesso!');
            setCheckinCode('');
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao realizar check-in.');
        } finally {
            setIsCheckingIn(false);
        }
    };

    // Check-out do veículo
    const handleCheckout = async (appointmentId) => {
        try {
            const res = await customInstance({
                url: `/api/yard/appointments/${appointmentId}/checkout`,
                method: 'POST'
            });
            toast.success(res?.message || 'Check-out finalizado!');
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao realizar check-out.');
        }
    };

    // Confirmar Encoste na Doca
    const handleConfirmMoveDock = async () => {
        if (!selectedDockId) return toast.warning('Selecione uma doca.');
        try {
            await customInstance({
                url: `/api/yard/appointments/${docToMoveDock.id}/move-to-dock?dockLocationId=${selectedDockId}`,
                method: 'POST'
            });
            toast.success('Veículo posicionado na doca!');
            setDocToMoveDock(null);
            setSelectedDockId('');
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao posicionar na doca.');
        }
    };

    // Confirmar Cancelamento
    const handleConfirmCancel = async () => {
        try {
            await customInstance({
                url: `/api/yard/appointments/${docToCancel.id}/cancel`,
                method: 'POST'
            });
            toast.success('Agendamento cancelado com sucesso.');
            setDocToCancel(null);
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao cancelar.');
        }
    };

    // Confirmar Exclusão
    const handleConfirmDelete = async () => {
        try {
            await customInstance({
                url: `/api/yard/appointments/${docToDelete.id}`,
                method: 'DELETE'
            });
            toast.success('Agendamento excluído definitivamente.');
            setDocToDelete(null);
            loadData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao excluir agendamento.');
        }
    };

    // Agrupamento para a Dashboard do Dia (4 grupos)
    const scheduledList = appointments.filter(a => a.status === 1 || a.status === 'Scheduled');
    const inYardList = appointments.filter(a => a.status === 2 || a.status === 'InYard');
    const inDockList = appointments.filter(a => a.status === 3 || a.status === 'InDock');
    const finishedList = appointments.filter(a => a.status === 4 || a.status === 'Finished');

    return (
        <div className="flex flex-col h-full space-y-4 animate-in fade-in duration-300 min-h-0">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Truck className="h-6 w-6 text-orange-600" /> Portaria & Gestão de Pátio
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Controle de acessos, permanência de veículos, encoste em docas e agendamentos.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={loadData} className="h-9 bg-white">
                        <RefreshCw size={14} className="mr-1.5" /> Atualizar
                    </Button>
                    <Button
                        onClick={() => {
                            setAppointmentToEdit(null);
                            setIsModalOpen(true);
                        }}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9"
                    >
                        <Plus size={16} className="mr-1.5" /> Novo Agendamento / Entrada
                    </Button>
                </div>
            </div>

            {/* ABAS */}
            <Tabs defaultValue="operacao" className="flex-1 flex flex-col min-h-0">
                <TabsList className="bg-slate-100 p-1 w-full sm:w-auto self-start">
                    <TabsTrigger value="operacao" className="text-xs font-semibold gap-2">
                        <Warehouse size={15} /> Dashboard Operacional do Dia
                    </TabsTrigger>
                    <TabsTrigger value="agenda" className="text-xs font-semibold gap-2">
                        <CalendarClock size={15} /> Agenda & Histórico (CRUD Completo)
                    </TabsTrigger>
                </TabsList>

                {/* ABA 1: DASHBOARD DIÁRIA COM 4 GRUPOS */}
                <TabsContent value="operacao" className="flex-1 space-y-4 overflow-y-auto mt-3">
                    {/* BARRA DE ENTRADA RÁPIDA (CHECK-IN) */}
                    <Card className="border-slate-200 bg-white shadow-xs">
                        <CardContent className="p-3">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleCheckin(checkinCode);
                                }}
                                className="flex flex-col sm:flex-row items-center gap-3"
                            >
                                <div className="relative flex-1 w-full">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input
                                        placeholder="Bipar QR Code da reserva ou digitar a placa para dar entrada rápida..."
                                        className="pl-9 bg-white h-10 text-xs font-mono"
                                        value={checkinCode}
                                        onChange={(e) => setCheckinCode(e.target.value.toUpperCase())}
                                    />
                                </div>
                                <Button
                                    type="submit"
                                    disabled={isCheckingIn || !checkinCode}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-5 shrink-0"
                                >
                                    {isCheckingIn ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <LogIn className="h-4 w-4 mr-1.5" />}
                                    Registrar Entrada (Check-in)
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* 4 CARDS DE INDICADORES (KPIS DO DIA) */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-bold uppercase text-slate-400 block">Agendados Hoje</span>
                                <span className="text-xl font-extrabold text-slate-800 font-mono">{scheduledList.length}</span>
                            </div>
                            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                                <Calendar size={18} />
                            </div>
                        </div>

                        <div className="p-3 bg-white border border-amber-200 rounded-xl flex items-center justify-between bg-amber-50/20">
                            <div>
                                <span className="text-[10px] font-bold uppercase text-amber-700 block">No Pátio (Espera)</span>
                                <span className="text-xl font-extrabold text-amber-800 font-mono">{inYardList.length}</span>
                            </div>
                            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                                <Clock size={18} />
                            </div>
                        </div>

                        <div className="p-3 bg-white border border-blue-200 rounded-xl flex items-center justify-between bg-blue-50/20">
                            <div>
                                <span className="text-[10px] font-bold uppercase text-blue-700 block">Em Operação (Docas)</span>
                                <span className="text-xl font-extrabold text-blue-800 font-mono">{inDockList.length}</span>
                            </div>
                            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                                <Warehouse size={18} />
                            </div>
                        </div>

                        <div className="p-3 bg-white border border-emerald-200 rounded-xl flex items-center justify-between bg-emerald-50/20">
                            <div>
                                <span className="text-[10px] font-bold uppercase text-emerald-700 block">Finalizados Hoje</span>
                                <span className="text-xl font-extrabold text-emerald-800 font-mono">{finishedList.length}</span>
                            </div>
                            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                                <CheckCircle size={18} />
                            </div>
                        </div>
                    </div>

                    {/* AS 4 COLUNAS OPERACIONAIS DO DASHBOARD */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
                        {/* 1. AGENDADOS PARA HOJE */}
                        <Card className="border-slate-200 bg-slate-50/40 shadow-xs">
                            <CardHeader className="p-3 border-b bg-slate-100/70 flex flex-row items-center justify-between">
                                <CardTitle className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <Calendar size={14} className="text-slate-500" /> Agendados Hoje ({scheduledList.length})
                                </CardTitle>
                                <Badge variant="outline" className="text-[9px] bg-white">Previstos</Badge>
                            </CardHeader>
                            <CardContent className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
                                {scheduledList.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-slate-400 italic">Nenhum agendamento pendente para hoje.</div>
                                ) : (
                                    scheduledList.map(a => (
                                        <div key={a.id} className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1.5 shadow-2xs">
                                            <div className="flex justify-between items-center">
                                                <span className="font-mono font-bold text-xs text-slate-900">{a.vehiclePlate || 'SEM PLACA'}</span>
                                                <Badge className={a.type === 1 || a.type === 'Inbound' ? 'bg-blue-50 text-blue-700 border-blue-200 text-[9px]' : 'bg-purple-50 text-purple-700 border-purple-200 text-[9px]'}>
                                                    {a.type === 1 || a.type === 'Inbound' ? 'Descarga' : 'Carga'}
                                                </Badge>
                                            </div>
                                            <div className="text-[11px] text-slate-600 space-y-0.5">
                                                <p className="flex items-center gap-1"><Clock size={12} className="text-slate-400" /> Previsto: {new Date(a.scheduledDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                                {a.driverName && <p className="truncate"><User size={12} className="inline mr-1 text-slate-400" />{a.driverName}</p>}
                                                {a.inboundOrderNumber && <p className="font-mono text-blue-700 font-semibold text-[10px]">Ordem Rec. #{a.inboundOrderNumber}</p>}
                                                {a.outboundOrderNumber && <p className="font-mono text-purple-700 font-semibold text-[10px]">Ordem Exp. #{a.outboundOrderNumber}</p>}
                                                {!a.inboundOrderNumber && !a.outboundOrderNumber && a.invoiceNumber && <p className="font-mono text-slate-500 text-[10px]">NF-e #{a.invoiceNumber}</p>}
                                            </div>

                                            <div className="flex items-center gap-1.5 pt-1">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleCheckin(a.reservationCode)}
                                                    className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                                >
                                                    <LogIn size={12} className="mr-1" /> Entrada
                                                </Button>

                                                {!a.inboundOrderId && !a.outboundOrderId && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setAppointmentToLink(a)}
                                                        className="h-7 text-[11px] border-blue-200 text-blue-700 hover:bg-blue-50 px-2 font-medium"
                                                        title="Vincular a uma Ordem existente"
                                                    >
                                                        <Link2 size={12} className="mr-1 text-blue-600" /> Vincular
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>

                        {/* 2. NO PÁTIO */}
                        <Card className="border-amber-200 bg-amber-50/20 shadow-xs">
                            <CardHeader className="p-3 border-b bg-amber-100/60 flex flex-row items-center justify-between">
                                <CardTitle className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                    <Clock size={14} className="text-amber-700" /> No Pátio ({inYardList.length})
                                </CardTitle>
                                <Badge className="text-[9px] bg-amber-200 text-amber-900 border-amber-300">Aguardando Doca</Badge>
                            </CardHeader>
                            <CardContent className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
                                {inYardList.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-slate-400 italic">Nenhum veículo aguardando no pátio.</div>
                                ) : (
                                    inYardList.map(a => (
                                        <div key={a.id} className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1.5 shadow-2xs">
                                            <div className="flex justify-between items-center">
                                                <span className="font-mono font-bold text-xs text-slate-900">{a.vehiclePlate || 'SEM PLACA'}</span>
                                                <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                                    {a.stayMinutes || 0} min
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-slate-600 space-y-0.5">
                                                <p className="truncate"><User size={12} className="inline mr-1 text-slate-400" />{a.driverName || 'Motorista N/I'}</p>
                                                {a.carrierName && <p className="text-[10px] text-slate-400 truncate">{a.carrierName}</p>}
                                                {a.inboundOrderNumber && <p className="font-mono text-[10px] text-blue-700 font-semibold">Ordem Rec. #{a.inboundOrderNumber}</p>}
                                                {a.outboundOrderNumber && <p className="font-mono text-[10px] text-purple-700 font-semibold">Ordem Exp. #{a.outboundOrderNumber}</p>}
                                                {!a.inboundOrderNumber && !a.outboundOrderNumber && a.invoiceNumber && <p className="font-mono text-[10px] text-slate-500">NF-e #{a.invoiceNumber}</p>}
                                            </div>

                                            {/* BOTÃO VINCULAR ORDEM SE AVULSO */}
                                            {!a.inboundOrderId && !a.outboundOrderId && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setAppointmentToLink(a)}
                                                    className="w-full h-6 text-[10px] border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100 font-semibold"
                                                >
                                                    <Link2 size={11} className="mr-1 text-blue-600" /> Vincular Ordem Existente
                                                </Button>
                                            )}

                                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => { setDocToMoveDock(a); setSelectedDockId(a.dockLocationId || ''); }}
                                                    className="h-7 text-[11px] border-blue-200 text-blue-700 hover:bg-blue-50 font-bold px-1"
                                                >
                                                    <MapPin size={11} className="mr-1" /> Encostar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleCheckout(a.id)}
                                                    className="h-7 text-[11px] border-rose-200 text-rose-700 hover:bg-rose-50 font-bold px-1"
                                                >
                                                    <LogOut size={11} className="mr-1" /> Saída
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>

                        {/* 3. NA DOCA / EM OPERAÇÃO */}
                        <Card className="border-blue-200 bg-blue-50/20 shadow-xs">
                            <CardHeader className="p-3 border-b bg-blue-100/60 flex flex-row items-center justify-between">
                                <CardTitle className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                                    <Warehouse size={14} className="text-blue-700" /> Na Doca ({inDockList.length})
                                </CardTitle>
                                <Badge className="text-[9px] bg-blue-200 text-blue-900 border-blue-300">Carregando / Desc.</Badge>
                            </CardHeader>
                            <CardContent className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
                                {inDockList.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-slate-400 italic">Nenhum veículo em doca no momento.</div>
                                ) : (
                                    inDockList.map(a => (
                                        <div key={a.id} className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1.5 shadow-2xs">
                                            <div className="flex justify-between items-center">
                                                <span className="font-mono font-bold text-xs text-slate-900">{a.vehiclePlate || 'SEM PLACA'}</span>
                                                <Badge className="bg-blue-600 text-white text-[9px] font-bold">
                                                    <MapPin size={9} className="mr-0.5" /> {a.dockName || 'DOCA'}
                                                </Badge>
                                            </div>
                                            <div className="text-[11px] text-slate-600 space-y-0.5">
                                                <p className="truncate"><User size={12} className="inline mr-1 text-slate-400" />{a.driverName || 'Motorista N/I'}</p>
                                                {a.inboundOrderNumber && <p className="font-mono text-[10px] text-blue-700 font-semibold">Ordem Rec. #{a.inboundOrderNumber}</p>}
                                                {a.outboundOrderNumber && <p className="font-mono text-[10px] text-purple-700 font-semibold">Ordem Exp. #{a.outboundOrderNumber}</p>}
                                                <p className="text-[10px] text-slate-400 font-mono">Encostou às {a.dockedAt ? new Date(a.dockedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => handleCheckout(a.id)}
                                                className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold mt-1"
                                            >
                                                <LogOut size={12} className="mr-1" /> Liberar e Finalizar
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>

                        {/* 4. FINALIZADOS HOJE */}
                        <Card className="border-emerald-200 bg-emerald-50/20 shadow-xs">
                            <CardHeader className="p-3 border-b bg-emerald-100/60 flex flex-row items-center justify-between">
                                <CardTitle className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                                    <CheckCircle size={14} className="text-emerald-700" /> Finalizados Hoje ({finishedList.length})
                                </CardTitle>
                                <Badge className="text-[9px] bg-emerald-200 text-emerald-900 border-emerald-300">Liberados</Badge>
                            </CardHeader>
                            <CardContent className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
                                {finishedList.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-slate-400 italic">Nenhum veículo finalizado ainda hoje.</div>
                                ) : (
                                    finishedList.map(a => (
                                        <div key={a.id} className="p-2 bg-white border border-slate-200 rounded-lg space-y-1 text-xs shadow-2xs">
                                            <div className="flex justify-between items-center">
                                                <span className="font-mono font-bold text-slate-900">{a.vehiclePlate || 'SEM PLACA'}</span>
                                                <span className="text-[10px] font-mono text-emerald-800 font-bold">Total: {a.stayMinutes || 0} min</span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                                                <span>Saída: {a.departedAt ? new Date(a.departedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                                                <span className="text-slate-400">{a.type === 1 || a.type === 'Inbound' ? 'Descarga' : 'Carga'}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ABA 2: AGENDA & HISTÓRICO GERAL (CRUD COMPLETO) */}
                <TabsContent value="agenda" className="flex-1 flex flex-col min-h-0 space-y-3 mt-3">
                    {/* FILTROS */}
                    <Card className="border-slate-200 bg-white shadow-xs shrink-0">
                        <CardContent className="p-3">
                            <div className="flex flex-col sm:flex-row gap-2.5">
                                <Input
                                    type="date"
                                    className="w-full sm:w-40 h-9 text-xs bg-white font-mono"
                                    value={filterDate}
                                    onChange={(e) => setFilterDate(e.target.value)}
                                />
                                <Select value={filterStatus} onValueChange={setFilterStatus}>
                                    <SelectTrigger className="w-full sm:w-40 h-9 text-xs bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Todos os Status</SelectItem>
                                        <SelectItem value="1">Agendado</SelectItem>
                                        <SelectItem value="2">No Pátio</SelectItem>
                                        <SelectItem value="3">Na Doca</SelectItem>
                                        <SelectItem value="4">Finalizado</SelectItem>
                                        <SelectItem value="5">Cancelado</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={filterType} onValueChange={setFilterType}>
                                    <SelectTrigger className="w-full sm:w-40 h-9 text-xs bg-white"><SelectValue placeholder="Tipo" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Todos os Tipos</SelectItem>
                                        <SelectItem value="1">Entrada / Descarga</SelectItem>
                                        <SelectItem value="2">Saída / Carga</SelectItem>
                                    </SelectContent>
                                </Select>
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input
                                        placeholder="Buscar por placa, motorista, NF ou código de reserva..."
                                        className="pl-9 h-9 text-xs bg-white"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && loadData()}
                                    />
                                </div>
                                <Button variant="secondary" onClick={loadData} className="h-9 text-xs px-4">
                                    Filtrar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* TABELA CRUD GERAL */}
                    <Card className="border-slate-200 bg-white shadow-xs flex-1 flex flex-col min-h-0 overflow-hidden">
                        <CardContent className="p-0 flex-1 overflow-auto min-h-0 relative">
                            <Table>
                                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                    <TableRow>
                                        <TableHead>Reserva</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Previsão</TableHead>
                                        <TableHead>Veículo / UF</TableHead>
                                        <TableHead>Motorista & CPF</TableHead>
                                        <TableHead>Transportadora</TableHead>
                                        <TableHead>NF-e / Ordem</TableHead>
                                        <TableHead>Doca</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="h-32 text-center text-slate-500 text-xs">
                                                <Loader2 className="animate-spin h-4 w-4 mx-auto text-orange-600 mb-1" />
                                                Carregando agendamentos...
                                            </TableCell>
                                        </TableRow>
                                    ) : appointments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="h-28 text-center text-slate-400 text-xs italic">
                                                Nenhum agendamento encontrado para o período.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        appointments.map(a => {
                                            const isScheduled = a.status === 1 || a.status === 'Scheduled';
                                            const isCanceled = a.status === 5 || a.status === 'Canceled';
                                            const isFinished = a.status === 4 || a.status === 'Finished';

                                            return (
                                                <TableRow key={a.id} className="hover:bg-slate-50/50 text-xs">
                                                    <TableCell className="font-mono font-bold text-slate-900">{a.reservationCode}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={a.type === 1 || a.type === 'Inbound' ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]' : 'bg-purple-50 text-purple-700 border-purple-200 text-[10px]'}>
                                                            {a.type === 1 || a.type === 'Inbound' ? 'Entrada' : 'Saída'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-mono">{new Date(a.scheduledDate).toLocaleString('pt-BR')}</TableCell>
                                                    <TableCell className="font-mono font-bold">
                                                        {a.vehiclePlate || '-'} {a.vehiclePlateState ? `(${a.vehiclePlateState})` : ''}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="block font-medium">{a.driverName || '-'}</span>
                                                        {a.driverCpf && <span className="font-mono text-[10px] text-slate-400 block">{a.driverCpf}</span>}
                                                    </TableCell>
                                                    <TableCell className="truncate max-w-[130px]" title={a.carrierName}>{a.carrierName || '-'}</TableCell>

                                                    {/* IDENTIFICAÇÃO DE ORDENS / NOTA FISCAL */}
                                                    <TableCell className="font-mono">
                                                        {a.inboundOrderNumber && (
                                                            <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 border-blue-200 block w-fit">
                                                                Rec. #{a.inboundOrderNumber}
                                                            </Badge>
                                                        )}
                                                        {a.outboundOrderNumber && (
                                                            <Badge variant="outline" className="text-[10px] text-purple-700 bg-purple-50 border-purple-200 block w-fit">
                                                                Exp. #{a.outboundOrderNumber}
                                                            </Badge>
                                                        )}
                                                        {!a.inboundOrderNumber && !a.outboundOrderNumber && (
                                                            a.invoiceNumber ? `#${a.invoiceNumber}` : '-'
                                                        )}
                                                    </TableCell>

                                                    <TableCell className="font-mono">{a.dockName || '-'}</TableCell>
                                                    <TableCell>
                                                        <Badge className={
                                                            a.status === 1 || a.status === 'Scheduled' ? 'bg-slate-100 text-slate-700 border-slate-200 text-[10px]' :
                                                                a.status === 2 || a.status === 'InYard' ? 'bg-amber-100 text-amber-800 border-amber-200 text-[10px]' :
                                                                    a.status === 3 || a.status === 'InDock' ? 'bg-blue-100 text-blue-800 border-blue-200 text-[10px]' :
                                                                        a.status === 4 || a.status === 'Finished' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]' :
                                                                            'bg-rose-100 text-rose-800 border-rose-200 text-[10px]'
                                                        }>
                                                            {a.statusDescription}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            {/* VINCULAR ORDEM (Se não finalizado/cancelado e ainda sem ordem) */}
                                                            {!isFinished && !isCanceled && !a.inboundOrderId && !a.outboundOrderId && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setAppointmentToLink(a)}
                                                                    className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                    title="Vincular a uma Ordem existente"
                                                                >
                                                                    <Link2 size={13} />
                                                                </Button>
                                                            )}

                                                            {/* EDITAR (Disponível sempre que não finalizado) */}
                                                            {!isFinished && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        setAppointmentToEdit(a);
                                                                        setIsModalOpen(true);
                                                                    }}
                                                                    className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                                                                    title="Editar Agendamento"
                                                                >
                                                                    <Pencil size={13} />
                                                                </Button>
                                                            )}

                                                            {/* CHECK-IN */}
                                                            {isScheduled && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleCheckin(a.reservationCode)}
                                                                    className="h-7 text-[10px] bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 px-2"
                                                                    title="Registrar Check-in"
                                                                >
                                                                    <LogIn size={11} className="mr-1" /> Entrada
                                                                </Button>
                                                            )}

                                                            {/* CANCELAR */}
                                                            {isScheduled && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setDocToCancel(a)}
                                                                    className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                                    title="Cancelar"
                                                                >
                                                                    <Ban size={13} />
                                                                </Button>
                                                            )}

                                                            {/* EXCLUIR DEFINITIVAMENTE */}
                                                            {isCanceled && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setDocToDelete(a)}
                                                                    className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                                                                    title="Excluir Definitivamente"
                                                                >
                                                                    <Trash2 size={13} />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* MODAL: NOVO / EDITAR AGENDAMENTO */}
            <NovoAgendamentoModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                appointmentToEdit={appointmentToEdit}
                onSuccess={loadData}
            />

            {/* MODAL: VINCULAR ORDEM A AGENDAMENTO */}
            <VincularAgendamentoModal
                open={Boolean(appointmentToLink)}
                onOpenChange={(open) => !open && setAppointmentToLink(null)}
                appointment={appointmentToLink}
                onSuccess={loadData}
            />

            {/* DIALOG: ENCOSTAR NA DOCA */}
            <Dialog open={!!docToMoveDock} onOpenChange={(open) => !open && setDocToMoveDock(null)}>
                <DialogContent className="sm:max-w-xs bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-bold flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 text-blue-600" /> Encostar Veículo na Doca
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-2 space-y-2 text-xs">
                        <p>Selecione a doca para o veículo <strong className="font-mono">{docToMoveDock?.vehiclePlate}</strong>:</p>
                        <Select value={selectedDockId} onValueChange={setSelectedDockId}>
                            <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Selecione a doca..." /></SelectTrigger>
                            <SelectContent>
                                {docks.map(d => (
                                    <SelectItem key={d.id} value={d.id}>{d.fullPath || d.name || d.code}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setDocToMoveDock(null)}>Cancelar</Button>
                        <Button size="sm" onClick={handleConfirmMoveDock} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                            Confirmar Encoste
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ALERTA: CANCELAR AGENDAMENTO */}
            <AlertDialog open={!!docToCancel} onOpenChange={(open) => !open && setDocToCancel(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-amber-800">
                            <Ban className="h-5 w-5 text-amber-600" /> Cancelar Agendamento?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-600">
                            Deseja cancelar o agendamento <strong className="font-mono text-slate-900">{docToCancel?.reservationCode}</strong>?
                            O horário e a doca prevista serão liberados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmCancel} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                            Confirmar Cancelamento
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ALERTA: EXCLUIR AGENDAMENTO CANCELADO */}
            <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
                            <Trash2 className="h-5 w-5" /> Excluir Definitivamente?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-600">
                            Tem certeza que deseja remover o agendamento cancelado <strong className="font-mono text-slate-900">{docToDelete?.reservationCode}</strong>?
                            Esta ação removerá o registro do histórico permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} className="bg-rose-600 hover:bg-rose-700 text-white font-bold">
                            Confirmar Exclusão
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}