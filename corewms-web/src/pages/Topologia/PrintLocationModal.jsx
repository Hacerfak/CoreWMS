import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, Loader2, Tag, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function PrintLocationModal({ open, onOpenChange, location }) {
    const canPrintFromTopology = useHasPermission(['topology:view', 'topology:manage']);

    const [selectedAgentName, setSelectedAgentName] = useState('');
    const [selectedPrinterName, setSelectedPrinterName] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [isPrinting, setIsPrinting] = useState(false);

    const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
        queryKey: ['/api/printing/agents'],
        queryFn: () => customInstance({ url: '/api/printing/agents', method: 'GET' }),
        enabled: open && canPrintFromTopology
    });

    const { data: templates = [], isLoading: isLoadingTemplates } = useQuery({
        queryKey: ['/api/printing/templates'],
        queryFn: () => customInstance({ url: '/api/printing/templates', method: 'GET' }),
        enabled: open && canPrintFromTopology
    });

    const availablePrinters = useMemo(() => {
        const agent = agents.find((a) => a.name === selectedAgentName);
        return agent?.printers || [];
    }, [agents, selectedAgentName]);

    const handleOpenChange = (nextOpen) => {
        if (isPrinting) return;
        if (!nextOpen) {
            setSelectedAgentName('');
            setSelectedPrinterName('');
            setSelectedTemplateId('');
        }
        onOpenChange(nextOpen);
    };

    const handleAgentChange = (agentName) => {
        setSelectedAgentName(agentName);
        const agent = agents.find((a) => a.name === agentName);
        const firstPrinter = agent?.printers?.[0]?.name || '';
        setSelectedPrinterName(firstPrinter);
    };

    const handlePrint = async () => {
        if (!canPrintFromTopology || !location?.id) return;

        if (!selectedAgentName || !selectedPrinterName) {
            toast.warning('Selecione a estação e a impressora.');
            return;
        }

        if (!selectedTemplateId) {
            toast.warning('Selecione o template de etiqueta ZPL.');
            return;
        }

        try {
            setIsPrinting(true);
            const res = await customInstance({
                url: '/api/print/locations',
                method: 'POST',
                data: {
                    locationIds: [location.id],
                    templateId: selectedTemplateId,
                    stationName: selectedAgentName,
                    printerName: selectedPrinterName
                }
            });

            toast.success(res?.message || `Etiqueta do endereço ${location.fullPath} enviada!`);
            handleOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao enviar etiqueta de endereço.');
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        <Printer className="text-blue-600" size={20} /> Imprimir Etiqueta de Endereço
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Selecione a estação, impressora térmica e modelo ZPL para imprimir o endereço selecionado.
                    </DialogDescription>
                </DialogHeader>

                {location && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <MapPin size={15} className="text-blue-600 shrink-0" />
                            <span className="font-mono font-bold text-slate-900">{location.fullPath}</span>
                        </div>
                        <span className="text-[11px] text-slate-500">{location.storageTypeName || 'Endereço'}</span>
                    </div>
                )}

                <div className="space-y-4 py-1">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Estação (Print Agent) *</Label>
                        <Select
                            value={selectedAgentName}
                            disabled={isLoadingAgents || isPrinting || !canPrintFromTopology}
                            onValueChange={handleAgentChange}
                        >
                            <SelectTrigger className="bg-white text-xs h-9">
                                <SelectValue placeholder={isLoadingAgents ? 'Carregando estações...' : 'Selecione a estação...'} />
                            </SelectTrigger>
                            <SelectContent>
                                {agents.map((a) => (
                                    <SelectItem key={a.id} value={a.name}>
                                        {a.name} {a.isOnline ? '(Online)' : '(Offline)'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Impressora Térmica *</Label>
                        <Select
                            value={selectedPrinterName}
                            disabled={!selectedAgentName || isPrinting || !canPrintFromTopology}
                            onValueChange={setSelectedPrinterName}
                        >
                            <SelectTrigger className="bg-white text-xs h-9">
                                <SelectValue placeholder={!selectedAgentName ? 'Escolha a estação primeiro...' : 'Selecione a impressora...'} />
                            </SelectTrigger>
                            <SelectContent>
                                {availablePrinters.map((p) => (
                                    <SelectItem key={p.id} value={p.name}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                            <Tag size={13} className="text-blue-600" /> Template ZPL *
                        </Label>
                        <Select
                            value={selectedTemplateId}
                            disabled={isLoadingTemplates || isPrinting || !canPrintFromTopology}
                            onValueChange={setSelectedTemplateId}
                        >
                            <SelectTrigger className="bg-white text-xs h-9">
                                <SelectValue placeholder={isLoadingTemplates ? 'Carregando templates...' : 'Selecione o template...'} />
                            </SelectTrigger>
                            <SelectContent>
                                {templates.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                        {t.name} ({t.widthMm}x{t.heightMm} mm)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter className="pt-3 border-t border-slate-100">
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPrinting}>
                        Cancelar
                    </Button>
                    {canPrintFromTopology && (
                        <Button
                            type="button"
                            onClick={handlePrint}
                            disabled={isPrinting || !location?.id}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold min-w-[130px]"
                        >
                            {isPrinting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Printer className="h-4 w-4 mr-1.5" />}
                            Imprimir
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}