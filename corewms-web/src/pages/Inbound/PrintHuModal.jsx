import { useState, useMemo } from 'react';
import { useGetApiPrintingTemplates, useGetApiPrintingAgents } from '@/api/generated/printing/printing';
import { customInstance } from '@/api/orval-mutator';
import { useHasPermission } from '@/hooks/useHasPermission';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';

export default function PrintHuModal({ open, onOpenChange, husToPrint = [] }) {
    const canManagePrinting = useHasPermission('printing:manage');

    const { data: templates = [] } = useGetApiPrintingTemplates({
        query: { enabled: open && canManagePrinting }
    });
    const { data: agents = [] } = useGetApiPrintingAgents({
        query: { enabled: open && canManagePrinting }
    });

    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [selectedAgentName, setSelectedAgentName] = useState('');
    const [selectedPrinterName, setSelectedPrinterName] = useState('');
    const [isPending, setIsPending] = useState(false);

    // Filtra impressoras ativas dos agentes online
    const availablePrinters = useMemo(() => {
        const onlineAgents = agents.filter(a => a.isOnline && a.isActive);
        return onlineAgents.flatMap(a => (a.printers || []).map(p => ({ ...p, agentName: a.Name || a.name })));
    }, [agents]);

    const effectiveTemplateId = selectedTemplateId || templates[0]?.id || '';
    const firstPrinter = availablePrinters[0];
    const effectivePrinterName = selectedPrinterName || (firstPrinter ? (firstPrinter.name || firstPrinter.Name) : '');
    const effectiveAgentName = selectedAgentName || (firstPrinter ? firstPrinter.agentName : '');

    const handlePrint = async () => {
        if (!canManagePrinting) return;

        if (!effectiveTemplateId || !effectivePrinterName || !effectiveAgentName) {
            return toast.warning('Selecione o template e a impressora destino.');
        }

        const huIds = husToPrint.map(h => h.id).filter(Boolean);
        if (huIds.length === 0) {
            return toast.warning('Nenhum ID de HU válido encontrado para impressão.');
        }

        setIsPending(true);
        try {
            await customInstance({
                url: '/api/print/handling-units',
                method: 'POST',
                data: {
                    handlingUnitIds: huIds,
                    templateId: effectiveTemplateId,
                    stationName: effectiveAgentName,
                    printerName: effectivePrinterName
                }
            });

            toast.success(`${huIds.length} etiqueta(s) enviada(s) para a impressora ${effectivePrinterName}!`);
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao solicitar impressão no servidor.');
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        <Printer className="text-blue-600" size={20} /> Reimpressão de Etiquetas
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Imprimir {husToPrint.length} etiqueta(s) selecionada(s) via Agente de Impressão.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Modelo de Etiqueta (ZPL)</Label>
                        <Select value={effectiveTemplateId} onValueChange={setSelectedTemplateId} disabled={!canManagePrinting}>
                            <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Selecione o Template..." /></SelectTrigger>
                            <SelectContent>
                                {templates.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.widthMm}x{t.heightMm}mm)</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs font-semibold">Impressora Térmica Conectada</Label>
                        <Select
                            value={effectivePrinterName}
                            disabled={!canManagePrinting}
                            onValueChange={(pName) => {
                                const p = availablePrinters.find(x => (x.name || x.Name) === pName);
                                setSelectedPrinterName(pName);
                                if (p) setSelectedAgentName(p.agentName);
                            }}
                        >
                            <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Selecione a impressora..." /></SelectTrigger>
                            <SelectContent>
                                {availablePrinters.length === 0 ? (
                                    <SelectItem value="none" disabled>Nenhuma impressora online no momento</SelectItem>
                                ) : (
                                    availablePrinters.map((p, idx) => (
                                        <SelectItem key={idx} value={p.name || p.Name}>
                                            {p.name || p.Name} ({p.agentName})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter className="border-t border-slate-100 pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
                    {canManagePrinting && (
                        <Button onClick={handlePrint} disabled={isPending || husToPrint.length === 0 || availablePrinters.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Printer className="w-4 h-4 mr-2" /> Disparar Impressão ({husToPrint.length})</>}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}