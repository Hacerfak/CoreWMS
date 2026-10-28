import { useEffect, useState } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    Truck, Plus, RefreshCw, Warehouse, CalendarClock, MapPin, Ban, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

import OperacaoTab from './Tabs/OperacaoTab';
import AgendaTab from './Tabs/AgendaTab';
import NovoAgendamentoModal from './NovoAgendamentoModal';
import VincularAgendamentoModal from './VincularAgendamentoModal';

export default function PortariaPage() {
    const [currentTab, setCurrentTab] = useState('operacao');
    const [appointments, setAppointments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filtros de Agenda (padrão Date estrito)
    const [filterDate, setFilterDate] = useState(() => new Date());
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterType, setFilterType] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    // Check-in
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

            if (filterDate instanceof Date && !isNaN(filterDate.getTime())) {
                const pad = (n) => String(n).padStart(2, '0');
                const dStr = `${filterDate.getFullYear()}-${pad(filterDate.getMonth() + 1)}-${pad(filterDate.getDate())}`;
                params.append('startDate', dStr);
                params.append('endDate', dStr);
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

    // Abertura atômica do modal em modo de edição
    const handleEditAppointment = (appointment) => {
        setAppointmentToEdit(appointment);
        setIsModalOpen(true);
    };

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

    return (
        <div className="flex flex-col space-y-6 h-full">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Truck className="h-6 w-6 text-orange-600" /> Portaria & Gestão de Pátio
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Controle de acessos, permanência de veículos, encoste em docas e agendamentos.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={loadData} className="h-9 bg-white border-slate-200 text-slate-700 text-xs font-semibold shadow-xs">
                        <RefreshCw size={14} className="mr-1.5" /> Atualizar
                    </Button>
                    <Button
                        onClick={() => {
                            setAppointmentToEdit(null);
                            setIsModalOpen(true);
                        }}
                        className="bg-orange-600 hover:bg-orange-700 text-white shadow-sm text-xs font-semibold h-9"
                    >
                        <Plus size={16} className="mr-1.5" /> Novo Agendamento / Entrada
                    </Button>
                </div>
            </div>

            {/* ABAS PADRÃO ESTOQUE */}
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-300">
                <div className="bg-white border border-slate-200/60 rounded-xl p-1 w-fit shadow-xs shrink-0">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="operacao" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-semibold">
                            <Warehouse className="w-4 h-4 mr-2" /> Dashboard Operacional do Dia
                        </TabsTrigger>
                        <TabsTrigger value="agenda" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4 text-xs font-semibold">
                            <CalendarClock className="w-4 h-4 mr-2" /> Agenda & Histórico (CRUD Completo)
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 mt-4 relative min-h-0">
                    {currentTab === 'operacao' && (
                        <div className="h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <OperacaoTab
                                appointments={appointments}
                                checkinCode={checkinCode}
                                setCheckinCode={setCheckinCode}
                                isCheckingIn={isCheckingIn}
                                handleCheckin={handleCheckin}
                                handleCheckout={handleCheckout}
                                setDocToMoveDock={setDocToMoveDock}
                                setSelectedDockId={setSelectedDockId}
                                setAppointmentToLink={setAppointmentToLink}
                            />
                        </div>
                    )}

                    {currentTab === 'agenda' && (
                        <div className="h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <AgendaTab
                                appointments={appointments}
                                isLoading={isLoading}
                                filterDate={filterDate}
                                setFilterDate={setFilterDate}
                                filterStatus={filterStatus}
                                setFilterStatus={setFilterStatus}
                                filterType={filterType}
                                setFilterType={setFilterType}
                                searchTerm={searchTerm}
                                setSearchTerm={setSearchTerm}
                                loadData={loadData}
                                handleCheckin={handleCheckin}
                                setAppointmentToLink={setAppointmentToLink}
                                onEditAppointment={handleEditAppointment}
                                setDocToCancel={setDocToCancel}
                                setDocToDelete={setDocToDelete}
                            />
                        </div>
                    )}
                </div>
            </Tabs>

            {/* MODAL NOVO/EDITAR AGENDAMENTO */}
            <NovoAgendamentoModal
                open={isModalOpen}
                onOpenChange={(open) => {
                    setIsModalOpen(open);
                    if (!open) setAppointmentToEdit(null);
                }}
                appointmentToEdit={appointmentToEdit}
                onSuccess={loadData}
            />

            {/* MODAL VINCULAR ORDEM A AGENDAMENTO */}
            <VincularAgendamentoModal
                open={Boolean(appointmentToLink)}
                onOpenChange={(open) => !open && setAppointmentToLink(null)}
                appointment={appointmentToLink}
                onSuccess={loadData}
            />

            {/* DIALOG: ENCOSTE NA DOCA */}
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

            {/* ALERTA: CANCELAR */}
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

            {/* ALERTA: EXCLUIR */}
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