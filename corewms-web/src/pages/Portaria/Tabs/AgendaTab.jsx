import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, LogIn, Ban, Trash2, Pencil, Link2 } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

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

export default function AgendaTab({
    appointments = [],
    isLoading,
    filterDate,
    setFilterDate,
    filterStatus,
    setFilterStatus,
    filterType,
    setFilterType,
    searchTerm,
    setSearchTerm,
    loadData,
    handleCheckin,
    setAppointmentToLink,
    onEditAppointment,
    setDocToCancel,
    setDocToDelete
}) {
    const handleSearchSubmit = (e) => {
        if (e) e.preventDefault();
        loadData();
    };

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-xs flex flex-col overflow-hidden h-full">
            {/* PAINEL DE FILTROS PADRÃO ESTOQUE */}
            <form onSubmit={handleSearchSubmit} className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-700 font-mono uppercase">Filtros de Agenda & Histórico</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-3 space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700 uppercase">Data Agendamento</Label>
                        <DatePicker
                            date={filterDate}
                            setDate={setFilterDate}
                            placeholder="DD/MM/AAAA"
                        />
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700 uppercase">Status</Label>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="bg-white h-9 text-xs border-slate-200"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Status</SelectItem>
                                <SelectItem value="1">Agendado</SelectItem>
                                <SelectItem value="2">No Pátio</SelectItem>
                                <SelectItem value="3">Na Doca</SelectItem>
                                <SelectItem value="4">Finalizado</SelectItem>
                                <SelectItem value="5">Cancelado</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700 uppercase">Tipo</Label>
                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger className="bg-white h-9 text-xs border-slate-200"><SelectValue placeholder="Tipo" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Tipos</SelectItem>
                                <SelectItem value="1">Entrada / Descarga</SelectItem>
                                <SelectItem value="2">Saída / Carga</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                        <Label className="text-[11px] font-bold text-slate-700 uppercase">Busca Geral</Label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                placeholder="Placa, motorista, NF..."
                                className="pl-8 bg-white text-xs h-9 font-mono border-slate-200"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="sm:col-span-1 flex items-center">
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 w-full shadow-2xs">
                            <Search size={14} />
                        </Button>
                    </div>
                </div>
            </form>

            {/* TABELA DE REGISTROS */}
            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 backdrop-blur-sm z-10">
                        <TableRow>
                            <TableHead>Reserva</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Previsão</TableHead>
                            <TableHead>Veículo / UF</TableHead>
                            <TableHead>Motorista & CPF</TableHead>
                            <TableHead>Transportadora</TableHead>
                            <TableHead>NF-e / Ordem</TableHead>
                            <TableHead>Doca</TableHead>
                            <TableHead>Marcos & Durações</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={11} className="h-32 text-center text-slate-500 text-xs">
                                    <Loader2 className="animate-spin h-6 w-6 mx-auto text-blue-600 mb-1" />
                                    Carregando agendamentos...
                                </TableCell>
                            </TableRow>
                        ) : appointments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={11} className="h-32 text-center text-slate-500 text-xs italic">
                                    Nenhum agendamento encontrado para o período.
                                </TableCell>
                            </TableRow>
                        ) : (
                            appointments.map(a => {
                                const isScheduled = a.status === 1 || a.status === 'Scheduled';
                                const isCanceled = a.status === 5 || a.status === 'Canceled';
                                const isFinished = a.status === 4 || a.status === 'Finished';

                                const permanenciaTotal = a.arrivedAt ? getDurationMinutes(a.arrivedAt, a.departedAt || (isFinished ? a.departedAt : null)) : null;

                                return (
                                    <TableRow key={a.id} className="hover:bg-slate-50/50 text-xs transition-colors">
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

                                        <TableCell className="font-mono text-[10px]">
                                            {a.arrivedAt ? (
                                                <div className="space-y-0.5">
                                                    <span className="text-slate-600 block">
                                                        Entrada: {new Date(a.arrivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {a.dockedAt && (
                                                        <span className="text-blue-700 block">
                                                            Doca: {new Date(a.dockedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                    {a.departedAt && (
                                                        <span className="text-emerald-700 block">
                                                            Saída: {new Date(a.departedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                    <span className="text-slate-900 font-bold block pt-0.5 border-t border-slate-100">
                                                        Perm.: {formatDuration(permanenciaTotal)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 italic">Aguardando chegada</span>
                                            )}
                                        </TableCell>

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

                                                {/* BOTÃO DE EDIÇÃO RECONECTADO COM ONEDITAPPOINTMENT */}
                                                {!isFinished && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => onEditAppointment(a)}
                                                        className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                                                        title="Editar Agendamento"
                                                    >
                                                        <Pencil size={13} />
                                                    </Button>
                                                )}

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
            </div>

            {/* RODAPÉ INFORMATIVO */}
            {appointments.length > 0 && (
                <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0 text-xs text-slate-500">
                    <span>Total de {appointments.length} agendamento(s) listado(s)</span>
                </div>
            )}
        </div>
    );
}