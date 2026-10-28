import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Calendar, Clock, MapPin, Loader2, User, Warehouse, LogIn, LogOut,
    Search, CheckCircle, Link2, Timer
} from 'lucide-react';

const getDurationMinutes = (start, end) => {
    if (!start) return null;
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate - startDate;
    return Math.max(0, Math.floor(diffMs / 60000));
};

const formatDuration = (minutes) => {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '-';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
};

export default function OperacaoTab({
    appointments = [],
    checkinCode,
    setCheckinCode,
    isCheckingIn,
    handleCheckin,
    handleCheckout,
    setDocToMoveDock,
    setSelectedDockId,
    setAppointmentToLink,
}) {
    const scheduledList = appointments.filter(a => a.status === 1 || a.status === 'Scheduled');
    const inYardList = appointments.filter(a => a.status === 2 || a.status === 'InYard');
    const inDockList = appointments.filter(a => a.status === 3 || a.status === 'InDock');
    const finishedList = appointments.filter(a => a.status === 4 || a.status === 'Finished');

    return (
        <div className="flex flex-col space-y-4 h-full overflow-y-auto pr-1 pb-6">
            {/* ENTRADA RÁPIDA (CHECK-IN) */}
            <div className="bg-white border border-slate-200/60 rounded-xl p-3.5 shadow-xs shrink-0">
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
                            className="pl-9 bg-white h-9 text-xs font-mono border-slate-200"
                            value={checkinCode}
                            onChange={(e) => setCheckinCode(e.target.value.toUpperCase())}
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={isCheckingIn || !checkinCode}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 px-5 shrink-0 shadow-xs text-xs"
                    >
                        {isCheckingIn ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <LogIn className="h-4 w-4 mr-1.5" />}
                        Registrar Entrada (Check-in)
                    </Button>
                </form>
            </div>

            {/* KPIS (ESTILO ESTOQUE / KARDEX) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
                <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
                    <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Agendados Hoje</span>
                        <span className="text-xl font-bold font-mono text-slate-900 mt-0.5 block">{scheduledList.length}</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 text-slate-600 border border-slate-200/60 rounded-lg shrink-0">
                        <Calendar size={18} />
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
                    <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">No Pátio (Espera)</span>
                        <span className="text-xl font-bold font-mono text-amber-700 mt-0.5 block">{inYardList.length}</span>
                    </div>
                    <div className="p-2.5 bg-amber-50 text-amber-800 border border-amber-200/60 rounded-lg shrink-0">
                        <Clock size={18} />
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
                    <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Em Operação (Docas)</span>
                        <span className="text-xl font-bold font-mono text-blue-700 mt-0.5 block">{inDockList.length}</span>
                    </div>
                    <div className="p-2.5 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-lg shrink-0">
                        <Warehouse size={18} />
                    </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex items-center justify-between">
                    <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Finalizados Hoje</span>
                        <span className="text-xl font-bold font-mono text-emerald-700 mt-0.5 block">{finishedList.length}</span>
                    </div>
                    <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-lg shrink-0">
                        <CheckCircle size={18} />
                    </div>
                </div>
            </div>

            {/* 4 CARDS EM 2 COLUNAS (2 CARDS POR COLUNA) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {/* COLUNA 1: ENTRADA E ESPERA */}
                <div className="space-y-4">
                    {/* 1. AGENDADOS PARA HOJE */}
                    <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs overflow-hidden flex flex-col">
                        <div className="p-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                            <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                                <Calendar size={15} className="text-slate-500" /> Agendados Hoje ({scheduledList.length})
                            </span>
                            <Badge variant="outline" className="text-[10px] bg-white font-medium">Previstos</Badge>
                        </div>
                        <div className="p-3.5 space-y-3 min-h-[140px] max-h-[460px] overflow-y-auto">
                            {scheduledList.length === 0 ? (
                                <div className="py-8 text-center text-xs text-slate-400 italic">
                                    Nenhum agendamento pendente para hoje.
                                </div>
                            ) : (
                                scheduledList.map(a => (
                                    <div key={a.id} className="p-3.5 bg-slate-50/50 border border-slate-200/70 rounded-lg space-y-2 shadow-2xs hover:border-slate-300 transition-colors">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-sm text-slate-900">{a.vehiclePlate || 'SEM PLACA'}</span>
                                                <span className="font-mono text-xs text-slate-400">({a.reservationCode})</span>
                                            </div>
                                            <Badge className={a.type === 1 || a.type === 'Inbound' ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]' : 'bg-purple-50 text-purple-700 border-purple-200 text-[10px]'}>
                                                {a.type === 1 || a.type === 'Inbound' ? 'Descarga' : 'Carga'}
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                                            <p className="flex items-center gap-1 font-mono">
                                                <Clock size={12} className="text-slate-400" />
                                                Previsto: <strong>{new Date(a.scheduledDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
                                            </p>
                                            <p className="truncate">
                                                <User size={12} className="inline mr-1 text-slate-400" />
                                                {a.driverName || 'Motorista não informado'}
                                            </p>
                                        </div>

                                        <div className="text-xs text-slate-500 flex justify-between items-center font-mono pt-1 border-t border-slate-200/50">
                                            <span>{a.carrierName || 'Transportadora N/I'}</span>
                                            {a.inboundOrderNumber && <span className="text-blue-700 font-bold font-sans">Ordem Rec. #{a.inboundOrderNumber}</span>}
                                            {a.outboundOrderNumber && <span className="text-purple-700 font-bold font-sans">Ordem Exp. #{a.outboundOrderNumber}</span>}
                                            {!a.inboundOrderNumber && !a.outboundOrderNumber && a.invoiceNumber && <span>NF-e #{a.invoiceNumber}</span>}
                                        </div>

                                        <div className="flex items-center gap-2 pt-1">
                                            <Button
                                                size="sm"
                                                onClick={() => handleCheckin(a.reservationCode)}
                                                className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                            >
                                                <LogIn size={13} className="mr-1" /> Dar Entrada (Check-in)
                                            </Button>

                                            {!a.inboundOrderId && !a.outboundOrderId && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setAppointmentToLink(a)}
                                                    className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50 px-3 font-semibold bg-white"
                                                >
                                                    <Link2 size={13} className="mr-1 text-blue-600" /> Vincular
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* 2. NO PÁTIO (ESPERA) */}
                    <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs overflow-hidden flex flex-col">
                        <div className="p-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
                            <span className="text-xs font-bold text-amber-900 uppercase flex items-center gap-2">
                                <Clock size={15} className="text-amber-600" /> No Pátio ({inYardList.length})
                            </span>
                            <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-[10px] font-medium">Aguardando Doca</Badge>
                        </div>
                        <div className="p-3.5 space-y-3 min-h-[140px] max-h-[460px] overflow-y-auto">
                            {inYardList.length === 0 ? (
                                <div className="py-8 text-center text-xs text-slate-400 italic">
                                    Nenhum veículo aguardando no pátio.
                                </div>
                            ) : (
                                inYardList.map(a => {
                                    const esperaMin = getDurationMinutes(a.arrivedAt, null);
                                    return (
                                        <div key={a.id} className="p-3.5 bg-slate-50/50 border border-slate-200/70 rounded-lg space-y-2 shadow-2xs hover:border-slate-300 transition-colors">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sm text-slate-900">{a.vehiclePlate || 'SEM PLACA'}</span>
                                                    <span className="font-mono text-xs text-slate-400">({a.reservationCode})</span>
                                                </div>
                                                <span className="font-mono text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                                                    <Timer size={12} /> Espera: {formatDuration(esperaMin)}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 font-mono">
                                                <p className="font-sans truncate">
                                                    <User size={12} className="inline mr-1 text-slate-400" />
                                                    {a.driverName || 'Motorista N/I'}
                                                </p>
                                                <p className="text-slate-500">
                                                    Chegada: <strong>{a.arrivedAt ? new Date(a.arrivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong>
                                                </p>
                                            </div>

                                            <div className="text-xs text-slate-500 flex justify-between items-center font-mono pt-1 border-t border-slate-200/50">
                                                <span>{a.carrierName || 'Transportadora N/I'}</span>
                                                {a.inboundOrderNumber && <span className="text-blue-700 font-bold font-sans">Ordem Rec. #{a.inboundOrderNumber}</span>}
                                                {a.outboundOrderNumber && <span className="text-purple-700 font-bold font-sans">Ordem Exp. #{a.outboundOrderNumber}</span>}
                                                {!a.inboundOrderNumber && !a.outboundOrderNumber && a.invoiceNumber && <span>NF-e #{a.invoiceNumber}</span>}
                                            </div>

                                            {!a.inboundOrderId && !a.outboundOrderId && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setAppointmentToLink(a)}
                                                    className="w-full h-7 text-xs border-blue-200 text-blue-700 bg-white hover:bg-blue-50 font-semibold"
                                                >
                                                    <Link2 size={12} className="mr-1 text-blue-600" /> Vincular Ordem Existente
                                                </Button>
                                            )}

                                            <div className="grid grid-cols-2 gap-2 pt-1">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => { setDocToMoveDock(a); setSelectedDockId(a.dockLocationId || ''); }}
                                                    className="h-8 text-xs border-blue-200 text-blue-700 bg-white hover:bg-blue-50 font-bold"
                                                >
                                                    <MapPin size={13} className="mr-1" /> Encostar na Doca
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleCheckout(a.id)}
                                                    className="h-8 text-xs border-rose-200 text-rose-700 bg-white hover:bg-rose-50 font-bold"
                                                >
                                                    <LogOut size={13} className="mr-1" /> Saída (Check-out)
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* COLUNA 2: OPERAÇÃO E SAÍDA */}
                <div className="space-y-4">
                    {/* 3. NA DOCA / EM OPERAÇÃO */}
                    <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs overflow-hidden flex flex-col">
                        <div className="p-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                            <span className="text-xs font-bold text-blue-900 uppercase flex items-center gap-2">
                                <Warehouse size={15} className="text-blue-600" /> Na Doca ({inDockList.length})
                            </span>
                            <Badge className="bg-blue-100 text-blue-900 border-blue-200 text-[10px] font-medium">Carregando / Desc.</Badge>
                        </div>
                        <div className="p-3.5 space-y-3 min-h-[140px] max-h-[460px] overflow-y-auto">
                            {inDockList.length === 0 ? (
                                <div className="py-8 text-center text-xs text-slate-400 italic">
                                    Nenhum veículo em doca no momento.
                                </div>
                            ) : (
                                inDockList.map(a => {
                                    const esperaPátio = getDurationMinutes(a.arrivedAt, a.dockedAt);
                                    const operacaoMin = getDurationMinutes(a.dockedAt, null);
                                    const totalMin = getDurationMinutes(a.arrivedAt, null);

                                    return (
                                        <div key={a.id} className="p-3.5 bg-slate-50/50 border border-slate-200/70 rounded-lg space-y-2 shadow-2xs hover:border-slate-300 transition-colors">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sm text-slate-900">{a.vehiclePlate || 'SEM PLACA'}</span>
                                                    <Badge className="bg-blue-600 text-white text-[10px] font-bold">
                                                        <MapPin size={10} className="mr-0.5" /> {a.dockName || 'DOCA'}
                                                    </Badge>
                                                </div>
                                                <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                                    Operação: {formatDuration(operacaoMin)}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                                                <p className="truncate">
                                                    <User size={12} className="inline mr-1 text-slate-400" />
                                                    {a.driverName || 'Motorista N/I'}
                                                </p>
                                                <div className="text-right">
                                                    {a.inboundOrderNumber && <span className="font-mono text-xs text-blue-700 font-bold">Ordem Rec. #{a.inboundOrderNumber}</span>}
                                                    {a.outboundOrderNumber && <span className="font-mono text-xs text-purple-700 font-bold">Ordem Exp. #{a.outboundOrderNumber}</span>}
                                                </div>
                                            </div>

                                            {/* TEMPOS CALCULADOS */}
                                            <div className="p-2.5 bg-white border border-slate-200/60 rounded-lg text-xs font-mono grid grid-cols-3 gap-2 text-center">
                                                <div>
                                                    <span className="text-[10px] text-slate-400 block font-sans">Espera Pátio</span>
                                                    <span className="font-semibold text-amber-800">{formatDuration(esperaPátio)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-400 block font-sans">Operação Doca</span>
                                                    <span className="font-bold text-blue-800">{formatDuration(operacaoMin)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-400 block font-sans">Permanência Total</span>
                                                    <span className="font-bold text-slate-800">{formatDuration(totalMin)}</span>
                                                </div>
                                            </div>

                                            <Button
                                                size="sm"
                                                onClick={() => handleCheckout(a.id)}
                                                className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold mt-1 shadow-2xs"
                                            >
                                                <LogOut size={13} className="mr-1" /> Liberar e Finalizar
                                            </Button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 4. FINALIZADOS HOJE */}
                    <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs overflow-hidden flex flex-col">
                        <div className="p-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
                            <span className="text-xs font-bold text-emerald-900 uppercase flex items-center gap-2">
                                <CheckCircle size={15} className="text-emerald-600" /> Finalizados Hoje ({finishedList.length})
                            </span>
                            <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-medium">Liberados</Badge>
                        </div>
                        <div className="p-3.5 space-y-3 min-h-[140px] max-h-[460px] overflow-y-auto">
                            {finishedList.length === 0 ? (
                                <div className="py-8 text-center text-xs text-slate-400 italic">
                                    Nenhum veículo finalizado ainda hoje.
                                </div>
                            ) : (
                                finishedList.map(a => {
                                    const esperaPátio = getDurationMinutes(a.arrivedAt, a.dockedAt);
                                    const operacaoDoca = getDurationMinutes(a.dockedAt, a.departedAt);
                                    const permanenciaTotal = getDurationMinutes(a.arrivedAt, a.departedAt);

                                    return (
                                        <div key={a.id} className="p-3.5 bg-slate-50/50 border border-slate-200/70 rounded-lg space-y-2 text-xs shadow-2xs hover:border-slate-300 transition-colors">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sm text-slate-900">{a.vehiclePlate || 'SEM PLACA'}</span>
                                                    <span className="font-mono text-xs text-slate-400">({a.reservationCode})</span>
                                                </div>
                                                <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                    Permanência Total: {formatDuration(permanenciaTotal)}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-600 bg-white p-2 rounded-lg border border-slate-200/60 text-center">
                                                <div>
                                                    <span className="text-[9px] text-slate-400 block font-sans">Chegada</span>
                                                    <strong>{a.arrivedAt ? new Date(a.arrivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong>
                                                </div>
                                                <div>
                                                    <span className="text-[9px] text-slate-400 block font-sans">Encoste</span>
                                                    <strong>{a.dockedAt ? new Date(a.dockedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong>
                                                </div>
                                                <div>
                                                    <span className="text-[9px] text-slate-400 block font-sans">Saída</span>
                                                    <strong>{a.departedAt ? new Date(a.departedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong>
                                                </div>
                                            </div>

                                            <div className="flex justify-between text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-200/50">
                                                <span>Espera: <strong className="text-amber-800">{formatDuration(esperaPátio)}</strong></span>
                                                <span>Operação: <strong className="text-blue-800">{formatDuration(operacaoDoca)}</strong></span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}