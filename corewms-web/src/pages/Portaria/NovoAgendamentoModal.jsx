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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CalendarClock, UploadCloud, Loader2, CheckCircle2, FileCode, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { DatePickerTime } from '@/components/ui/date-picker-time';

export default function NovoAgendamentoModal({
    open,
    onOpenChange,
    onSuccess,
    appointmentToEdit = null,
    preSelectedOrderId = null,
    preSelectedOrderType = 1,
    preSelectedAccessKey = '',
    preSelectedInvoice = '',
    preSelectedPlate = '',
    preSelectedPlateState = 'RS',
    preSelectedCarrier = '',
    preSelectedDockId = ''
}) {
    const isEdit = Boolean(appointmentToEdit);
    const [isLoading, setIsLoading] = useState(false);
    const [docks, setDocks] = useState([]);
    const [xmlRawFile, setXmlRawFile] = useState(null);

    const [form, setForm] = useState({
        type: 1,
        directCheckIn: false,
        scheduledDate: new Date(),
        vehiclePlate: '',
        vehiclePlateState: 'RS',
        driverName: '',
        driverCpf: '',
        carrierName: '',
        carrierCnpj: '',
        invoiceNumber: '',
        invoiceSerie: '',
        accessKey: '',
        dockLocationId: '',
        additionalNotes: ''
    });

    useEffect(() => {
        if (open) {
            customInstance({ url: '/api/topology/locations/docks', method: 'GET' })
                .then(res => setDocks(Array.isArray(res?.data || res) ? (res?.data || res) : []))
                .catch(() => { });

            if (isEdit) {
                setForm({
                    type: appointmentToEdit.type === 'Inbound' || appointmentToEdit.type === 1 ? 1 : 2,
                    directCheckIn: false,
                    scheduledDate: appointmentToEdit.scheduledDate ? new Date(appointmentToEdit.scheduledDate) : new Date(),
                    vehiclePlate: appointmentToEdit.vehiclePlate || '',
                    vehiclePlateState: appointmentToEdit.vehiclePlateState || 'RS',
                    driverName: appointmentToEdit.driverName || '',
                    driverCpf: appointmentToEdit.driverCpf || '',
                    carrierName: appointmentToEdit.carrierName || '',
                    carrierCnpj: appointmentToEdit.carrierCnpj || '',
                    invoiceNumber: appointmentToEdit.invoiceNumber || '',
                    invoiceSerie: appointmentToEdit.invoiceSerie || '',
                    accessKey: appointmentToEdit.accessKey || '',
                    dockLocationId: appointmentToEdit.dockLocationId || '',
                    additionalNotes: appointmentToEdit.additionalNotes || ''
                });
                setXmlRawFile(null);
            } else {
                setForm({
                    type: preSelectedOrderType || 1,
                    directCheckIn: false,
                    scheduledDate: new Date(),
                    vehiclePlate: preSelectedPlate || '',
                    vehiclePlateState: preSelectedPlateState || 'RS',
                    driverName: '',
                    driverCpf: '',
                    carrierName: preSelectedCarrier || '',
                    carrierCnpj: '',
                    invoiceNumber: preSelectedInvoice || '',
                    invoiceSerie: '',
                    accessKey: preSelectedAccessKey || '',
                    dockLocationId: preSelectedDockId || '',
                    additionalNotes: ''
                });
                setXmlRawFile(null);
            }
        }
    }, [open, appointmentToEdit, preSelectedOrderId]);

    const handleXmlFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setXmlRawFile(file);
        try {
            const text = await file.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, 'text/xml');

            const infNFe = xmlDoc.getElementsByTagName('infNFe')[0];
            const rawId = infNFe?.getAttribute('Id') || '';
            const accessKey = rawId.replace(/^NFe/, '').trim();

            const nNF = xmlDoc.getElementsByTagName('nNF')[0]?.textContent?.trim() || '';
            const serie = xmlDoc.getElementsByTagName('serie')[0]?.textContent?.trim() || '';

            const transp = xmlDoc.getElementsByTagName('transporta')[0];
            const carrierName = transp?.getElementsByTagName('xNome')[0]?.textContent?.trim() || '';
            const carrierCnpj = transp?.getElementsByTagName('CNPJ')[0]?.textContent?.trim() ||
                transp?.getElementsByTagName('CPF')[0]?.textContent?.trim() || '';

            const veic = xmlDoc.getElementsByTagName('veicTransp')[0];
            const plate = veic?.getElementsByTagName('placa')[0]?.textContent?.trim()?.toUpperCase() || '';
            const uf = veic?.getElementsByTagName('UF')[0]?.textContent?.trim()?.toUpperCase() || 'RS';

            const infCpl = xmlDoc.getElementsByTagName('infCpl')[0]?.textContent?.trim() || '';

            setForm(prev => ({
                ...prev,
                accessKey: accessKey || prev.accessKey,
                invoiceNumber: nNF || prev.invoiceNumber,
                invoiceSerie: serie || prev.invoiceSerie,
                carrierName: carrierName || prev.carrierName,
                carrierCnpj: carrierCnpj || prev.carrierCnpj,
                vehiclePlate: plate || prev.vehiclePlate,
                vehiclePlateState: uf || prev.vehiclePlateState,
                additionalNotes: infCpl ? `[XML]: ${infCpl}` : prev.additionalNotes
            }));

            toast.success('Dados extraídos do XML! Preencha o motorista caso necessário.');
        } catch {
            toast.error('Não foi possível interpretar o XML.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.scheduledDate) return toast.warning('Informe a data e horário previsto.');

        const scheduledIso = form.scheduledDate instanceof Date
            ? form.scheduledDate.toISOString()
            : new Date(form.scheduledDate).toISOString();

        try {
            setIsLoading(true);

            if (isEdit) {
                await customInstance({
                    url: `/api/yard/appointments/${appointmentToEdit.id}`,
                    method: 'PUT',
                    data: {
                        id: appointmentToEdit.id,
                        type: Number(form.type),
                        scheduledDate: scheduledIso,
                        vehiclePlate: form.vehiclePlate ? form.vehiclePlate.toUpperCase() : null,
                        vehiclePlateState: form.vehiclePlateState || null,
                        driverName: form.driverName || null,
                        driverCpf: form.driverCpf || null,
                        carrierName: form.carrierName || null,
                        carrierCnpj: form.carrierCnpj || null,
                        invoiceNumber: form.invoiceNumber || null,
                        invoiceSerie: form.invoiceSerie || null,
                        accessKey: form.accessKey || null,
                        dockLocationId: form.dockLocationId || null,
                        additionalNotes: form.additionalNotes || null
                    }
                });
                toast.success('Agendamento atualizado com sucesso!');
            } else if (xmlRawFile) {
                const formData = new FormData();
                formData.append('file', xmlRawFile);
                formData.append('type', form.type);
                formData.append('scheduledDate', scheduledIso);
                if (form.vehiclePlate) formData.append('vehiclePlate', form.vehiclePlate.toUpperCase());
                if (form.vehiclePlateState) formData.append('vehiclePlateState', form.vehiclePlateState.toUpperCase());
                if (form.driverName) formData.append('driverName', form.driverName);
                if (form.driverCpf) formData.append('driverCpf', form.driverCpf);
                if (form.carrierName) formData.append('carrierName', form.carrierName);
                if (form.carrierCnpj) formData.append('carrierCnpj', form.carrierCnpj);
                if (form.invoiceNumber) formData.append('invoiceNumber', form.invoiceNumber);
                if (form.invoiceSerie) formData.append('invoiceSerie', form.invoiceSerie);
                if (form.dockLocationId) formData.append('dockLocationId', form.dockLocationId);
                if (form.additionalNotes) formData.append('additionalNotes', form.additionalNotes);
                formData.append('directCheckIn', Boolean(form.directCheckIn));

                const res = await customInstance({
                    url: '/api/yard/appointments/import-xml',
                    method: 'POST',
                    data: formData,
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                toast.success(res?.message || 'Ordem gerada e agendamento vinculado com sucesso!');
            } else {
                const payload = {
                    type: Number(form.type),
                    scheduledDate: scheduledIso,
                    vehiclePlate: form.vehiclePlate ? form.vehiclePlate.toUpperCase() : null,
                    vehiclePlateState: form.vehiclePlateState || null,
                    driverName: form.driverName || null,
                    driverCpf: form.driverCpf || null,
                    carrierName: form.carrierName || null,
                    carrierCnpj: form.carrierCnpj || null,
                    invoiceNumber: form.invoiceNumber || null,
                    invoiceSerie: form.invoiceSerie || null,
                    accessKey: form.accessKey || null,
                    dockLocationId: form.dockLocationId || null,
                    additionalNotes: form.additionalNotes || null,
                    inboundOrderId: preSelectedOrderType === 1 ? preSelectedOrderId : null,
                    outboundOrderId: preSelectedOrderType === 2 ? preSelectedOrderId : null,
                    directCheckIn: Boolean(form.directCheckIn)
                };

                await customInstance({
                    url: '/api/yard/appointments',
                    method: 'POST',
                    data: payload
                });

                toast.success(form.directCheckIn ? 'Entrada no pátio registrada!' : 'Agendamento registrado com sucesso!');
            }

            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Falha ao salvar agendamento.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[680px] bg-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <CalendarClock className="h-5 w-5 text-orange-600" />
                        {isEdit ? `Editar Agendamento (${appointmentToEdit?.reservationCode})` : 'Registrar Entrada / Agendamento de Pátio'}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        {isEdit ? 'Atualize todos os dados cadastrais, veículo ou doca deste agendamento.' : 'Preencha os dados manualmente ou selecione um arquivo XML para gerar a ordem automaticamente.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-1">
                    {!isEdit && (
                        <div className="p-3 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/50 hover:bg-blue-50 transition-colors">
                            <input
                                type="file"
                                id="yard-xml-input"
                                accept=".xml"
                                className="hidden"
                                onChange={handleXmlFileChange}
                            />
                            <label htmlFor="yard-xml-input" className="cursor-pointer flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                                        <UploadCloud size={18} />
                                    </div>
                                    <div>
                                        <span className="text-xs font-bold text-slate-800 block">
                                            {xmlRawFile ? `Arquivo Selecionado: ${xmlRawFile.name}` : 'Importar XML da NF-e (Gera a Ordem + Agendamento)'}
                                        </span>
                                        <span className="text-[11px] text-slate-500 block">
                                            {xmlRawFile ? 'A ordem correspondente será criada no WMS ao salvar.' : 'O sistema lê a nota e cria a ordem de recebimento/expedição vinculada.'}
                                        </span>
                                    </div>
                                </div>
                                <Button type="button" size="sm" variant="outline" className="bg-white h-7 text-xs border-blue-300 text-blue-700 pointer-events-none">
                                    <FileCode size={13} className="mr-1" /> {xmlRawFile ? 'Trocar XML' : 'Selecionar XML'}
                                </Button>
                            </label>
                        </div>
                    )}

                    {!isEdit && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-700 block">Situação Inicial do Veículo *</Label>
                            <RadioGroup
                                value={form.directCheckIn ? 'yard' : 'scheduled'}
                                onValueChange={(val) => setForm({ ...form, directCheckIn: val === 'yard' })}
                                className="grid grid-cols-2 gap-3"
                            >
                                <div className={`flex items-center space-x-2 border rounded-lg p-2.5 cursor-pointer bg-white ${!form.directCheckIn ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200'}`}>
                                    <RadioGroupItem value="scheduled" id="opt-sched" />
                                    <label htmlFor="opt-sched" className="text-xs cursor-pointer">
                                        <strong className="block text-slate-800">Agendado</strong>
                                        <span className="text-[10px] text-slate-500">Caminhão previsto, chegará no horário.</span>
                                    </label>
                                </div>

                                <div className={`flex items-center space-x-2 border rounded-lg p-2.5 cursor-pointer bg-white ${form.directCheckIn ? 'border-amber-500 bg-amber-50/30' : 'border-slate-200'}`}>
                                    <RadioGroupItem value="yard" id="opt-yard" />
                                    <label htmlFor="opt-yard" className="text-xs cursor-pointer">
                                        <strong className="block text-amber-800 flex items-center gap-1"><Sparkles size={12} /> Entrada Imediata (No Pátio)</strong>
                                        <span className="text-[10px] text-slate-500">Caminhão avulso já no portão.</span>
                                    </label>
                                </div>
                            </RadioGroup>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <Label className="text-xs font-bold">Tipo de Operação *</Label>
                            <Select
                                value={String(form.type)}
                                onValueChange={(val) => setForm({ ...form, type: Number(val) })}
                                disabled={Boolean(preSelectedOrderId)}
                            >
                                <SelectTrigger className="h-9 mt-1 bg-white font-medium"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 - Descarga / Recebimento</SelectItem>
                                    <SelectItem value="2">2 - Carga / Expedição</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs font-bold mb-1 block">Data/Hora Prevista *</Label>
                            <DatePickerTime
                                date={form.scheduledDate}
                                setDate={(d) => setForm(prev => ({ ...prev, scheduledDate: d || new Date() }))}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="col-span-1">
                            <Label className="text-xs font-bold">Placa Veículo</Label>
                            <Input
                                placeholder="ABC1D23"
                                className="h-9 mt-1 uppercase font-mono font-bold bg-white"
                                value={form.vehiclePlate}
                                onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
                            />
                        </div>
                        <div className="col-span-1">
                            <Label className="text-xs font-bold">UF Placa</Label>
                            <Input
                                placeholder="RS"
                                maxLength={2}
                                className="h-9 mt-1 uppercase font-mono bg-white"
                                value={form.vehiclePlateState}
                                onChange={(e) => setForm({ ...form, vehiclePlateState: e.target.value.toUpperCase() })}
                            />
                        </div>
                        <div className="col-span-1">
                            <Label className="text-xs font-bold">Nome do Motorista</Label>
                            <Input
                                placeholder="Nome completo"
                                className="h-9 mt-1 bg-white"
                                value={form.driverName}
                                onChange={(e) => setForm({ ...form, driverName: e.target.value })}
                            />
                        </div>
                        <div className="col-span-1">
                            <Label className="text-xs font-bold">CPF Motorista</Label>
                            <Input
                                placeholder="000.000.000-00"
                                className="h-9 mt-1 font-mono bg-white"
                                value={form.driverCpf}
                                onChange={(e) => setForm({ ...form, driverCpf: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                            <Label className="text-xs font-bold">Transportadora</Label>
                            <Input
                                placeholder="Razão Social ou Fantasia"
                                className="h-9 mt-1 bg-white"
                                value={form.carrierName}
                                onChange={(e) => setForm({ ...form, carrierName: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-bold">CNPJ Transportadora</Label>
                            <Input
                                placeholder="00.000.000/0000-00"
                                className="h-9 mt-1 font-mono bg-white"
                                value={form.carrierCnpj}
                                onChange={(e) => setForm({ ...form, carrierCnpj: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-bold">Doca Prevista (Opcional)</Label>
                            <Select
                                value={form.dockLocationId}
                                onValueChange={(val) => setForm({ ...form, dockLocationId: val })}
                            >
                                <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue placeholder="Sem Doca..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">Sem Doca Definida</SelectItem>
                                    {docks.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.fullPath || d.name || d.code}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="col-span-1">
                            <Label className="text-xs font-bold">Nº NF-e</Label>
                            <Input
                                placeholder="Ex: 12345"
                                className="h-9 mt-1 font-mono font-bold bg-white"
                                value={form.invoiceNumber}
                                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                            />
                        </div>
                        <div className="col-span-1">
                            <Label className="text-xs font-bold">Série</Label>
                            <Input
                                placeholder="Ex: 1"
                                className="h-9 mt-1 font-mono bg-white"
                                value={form.invoiceSerie}
                                onChange={(e) => setForm({ ...form, invoiceSerie: e.target.value })}
                            />
                        </div>
                        <div className="col-span-2">
                            <Label className="text-xs font-bold">Chave de Acesso NF-e (44 dígitos)</Label>
                            <Input
                                placeholder="Chave NF-e"
                                maxLength={44}
                                className="h-9 mt-1 font-mono text-[11px] bg-white"
                                value={form.accessKey}
                                onChange={(e) => setForm({ ...form, accessKey: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="text-xs">
                        <Label className="text-xs font-bold">Observações Internas</Label>
                        <Textarea
                            rows={2}
                            placeholder="Instruções para o porteiro, doca ou conferente..."
                            className="mt-1 bg-white text-xs resize-none"
                            value={form.additionalNotes}
                            onChange={(e) => setForm({ ...form, additionalNotes: e.target.value })}
                        />
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            {isEdit ? 'Salvar Alterações' : xmlRawFile ? 'Importar XML e Gerar Ordem' : form.directCheckIn ? 'Registrar Entrada no Pátio' : 'Agendar Veículo'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}