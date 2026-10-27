import { useState, useEffect } from 'react';
import { customInstance } from '@/api/orval-mutator';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Link2, Search, Loader2, CheckCircle2, Truck, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function VincularAgendamentoModal({
    open,
    onOpenChange,
    onSuccess,
    // Modo 1: A partir de uma Ordem
    orderId = null,
    orderNumber = '',
    orderType = 1, // 1 = Inbound, 2 = Outbound
    // Modo 2: A partir de um Agendamento
    appointment = null
}) {
    const isFromOrder = Boolean(orderId);
    const targetType = isFromOrder ? orderType : (appointment?.type === 1 || appointment?.type === 'Inbound' ? 1 : 2);

    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const loadData = async () => {
        try {
            setIsLoading(true);
            setSelectedId(null);

            const endpoint = isFromOrder
                ? `/api/yard/appointments/available-for-linking?type=${targetType}`
                : `/api/yard/orders/available-for-linking?type=${targetType}`;

            const res = await customInstance({ url: endpoint, method: 'GET' });
            setItems(Array.isArray(res?.data || res) ? (res?.data || res) : []);
        } catch {
            toast.error('Erro ao carregar registros disponíveis para vínculo.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open, orderId, appointment]);

    const handleConfirmLink = async () => {
        if (!selectedId) {
            return toast.warning('Selecione um registro para vincular.');
        }

        try {
            setIsSaving(true);
            const targetAppointmentId = isFromOrder ? selectedId : appointment.id;
            const targetOrderId = isFromOrder ? orderId : selectedId;

            const res = await customInstance({
                url: `/api/yard/appointments/${targetAppointmentId}/link-order?type=${targetType}&orderId=${targetOrderId}`,
                method: 'POST'
            });

            toast.success(res?.message || 'Vínculo realizado com sucesso!');
            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Falha ao vincular.');
        } finally {
            setIsSaving(false);
        }
    };

    const filteredItems = items.filter(i => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        if (isFromOrder) {
            return (
                i.reservationCode?.toLowerCase().includes(term) ||
                i.vehiclePlate?.toLowerCase().includes(term) ||
                i.driverName?.toLowerCase().includes(term) ||
                i.carrierName?.toLowerCase().includes(term) ||
                i.invoiceNumber?.toLowerCase().includes(term)
            );
        } else {
            return (
                i.orderNumber?.toLowerCase().includes(term) ||
                i.invoiceNumber?.toLowerCase().includes(term) ||
                i.customerOrDestinationName?.toLowerCase().includes(term) ||
                i.carrierName?.toLowerCase().includes(term) ||
                i.vehiclePlate?.toLowerCase().includes(term)
            );
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] bg-white max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Link2 className="h-5 w-5 text-blue-600" />
                        {isFromOrder
                            ? `Vincular Agendamento Existente à Ordem #${orderNumber}`
                            : `Vincular Ordem ao Agendamento (${appointment?.reservationCode})`}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        {isFromOrder
                            ? 'Selecione um caminhão ou agendamento de pátio já aberto para associar a esta ordem.'
                            : 'Selecione a ordem de operação aberta correspondente a este agendamento de pátio.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2 space-y-3 flex-1 flex flex-col min-h-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder={isFromOrder ? "Filtrar por placa, motorista, reserva ou nota..." : "Filtrar por número da ordem, nota fiscal, cliente..."}
                            className="pl-9 h-9 text-xs bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="border border-slate-200 rounded-lg flex-1 overflow-auto min-h-[260px] max-h-[360px]">
                        <Table>
                            <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                <TableRow>
                                    <TableHead className="w-12 text-center"></TableHead>
                                    {isFromOrder ? (
                                        <>
                                            <TableHead>Reserva / Placa</TableHead>
                                            <TableHead>Motorista & Transportadora</TableHead>
                                            <TableHead>Previsão</TableHead>
                                            <TableHead>Status</TableHead>
                                        </>
                                    ) : (
                                        <>
                                            <TableHead>Nº Ordem / NF</TableHead>
                                            <TableHead>Depositante / Destino</TableHead>
                                            <TableHead>Data Emissão</TableHead>
                                            <TableHead>Status</TableHead>
                                        </>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center text-xs text-slate-500">
                                            <Loader2 className="animate-spin h-5 w-5 mx-auto text-blue-600 mb-1" />
                                            Carregando opções disponíveis...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredItems.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-28 text-center text-xs text-slate-400 italic">
                                            {isFromOrder
                                                ? 'Nenhum agendamento elegível disponível (apenas veículos agendados ou no pátio sem ordem vinculada).'
                                                : 'Nenhuma ordem ativa disponível para associação.'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredItems.map(item => {
                                        const isSelected = selectedId === item.id;
                                        return (
                                            <TableRow
                                                key={item.id}
                                                onClick={() => setSelectedId(item.id)}
                                                className={`cursor-pointer text-xs transition-colors ${isSelected ? 'bg-blue-50/80 font-medium' : 'hover:bg-slate-50'}`}
                                            >
                                                <TableCell className="text-center">
                                                    <input
                                                        type="radio"
                                                        name="link-selection"
                                                        checked={isSelected}
                                                        onChange={() => setSelectedId(item.id)}
                                                        className="text-blue-600 focus:ring-blue-500"
                                                    />
                                                </TableCell>

                                                {isFromOrder ? (
                                                    <>
                                                        <TableCell>
                                                            <strong className="font-mono text-slate-900 block">{item.reservationCode}</strong>
                                                            <span className="font-mono text-[11px] text-slate-500">{item.vehiclePlate || 'SEM PLACA'}</span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="block text-slate-800">{item.driverName || 'Motorista não informado'}</span>
                                                            <span className="text-[11px] text-slate-400 block truncate max-w-[200px]">{item.carrierName || '-'}</span>
                                                        </TableCell>
                                                        <TableCell className="font-mono text-[11px] text-slate-600">
                                                            {new Date(item.scheduledDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge className={item.status === 1 || item.status === 'Scheduled' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}>
                                                                {item.statusDescription}
                                                            </Badge>
                                                        </TableCell>
                                                    </>
                                                ) : (
                                                    <>
                                                        <TableCell>
                                                            <strong className="font-mono text-slate-900 block">#{item.orderNumber}</strong>
                                                            {item.invoiceNumber && <span className="font-mono text-[11px] text-slate-500">NF-e: {item.invoiceNumber}</span>}
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className="block text-slate-800 truncate max-w-[220px]">{item.customerOrDestinationName}</span>
                                                            {item.vehiclePlate && <span className="font-mono text-[11px] text-slate-400">Placa: {item.vehiclePlate}</span>}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-[11px] text-slate-600">
                                                            {new Date(item.issueDate).toLocaleDateString('pt-BR')}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="text-[10px] font-mono">{item.status}</Badge>
                                                        </TableCell>
                                                    </>
                                                )}
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <DialogFooter className="pt-2 flex justify-between items-center">
                    <span className="text-[11px] text-slate-400 font-mono">
                        {selectedId ? '1 item selecionado' : 'Selecione um item da tabela'}
                    </span>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={handleConfirmLink}
                            disabled={isSaving || !selectedId}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            Confirmar Vínculo
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}