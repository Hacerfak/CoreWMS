import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Printer, Loader2, Tag, Box } from 'lucide-react';
import { toast } from 'sonner';

export default function PrintOutboundVolumesModal({ open, onOpenChange, volumes = [], initialVolumeId = null }) {
    const canViewOutbound = useHasPermission(['outbound:view', 'outbound:manage']);

    const [selectedAgentName, setSelectedAgentName] = useState('');
    const [selectedPrinterName, setSelectedPrinterName] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [selectedVolumeIds, setSelectedVolumeIds] = useState([]);
    const [isPrinting, setIsPrinting] = useState(false);

    const { data: agents = [], isLoading: isLoadingAgents } = useQuery({
        queryKey: ['/api/printing/agents'],
        queryFn: () => customInstance({ url: '/api/printing/agents', method: 'GET' }),
        enabled: open && canViewOutbound
    });

    const { data: templates = [], isLoading: isLoadingTemplates } = useQuery({
        queryKey: ['/api/printing/templates'],
        queryFn: () => customInstance({ url: '/api/printing/templates', method: 'GET' }),
        enabled: open && canViewOutbound
    });

    const availablePrinters = useMemo(() => {
        const agent = agents.find((a) => a.name === selectedAgentName);
        return agent?.printers || [];
    }, [agents, selectedAgentName]);

    const effectiveVolumeIds = useMemo(() => {
        if (selectedVolumeIds.length > 0) return selectedVolumeIds;
        if (initialVolumeId) return [initialVolumeId];
        return volumes.map((v) => v.id);
    }, [selectedVolumeIds, initialVolumeId, volumes]);

    const allSelected = volumes.length > 0 && effectiveVolumeIds.length === volumes.length;

    const handleOpenChange = (nextOpen) => {
        if (isPrinting) return;
        if (nextOpen) {
            setSelectedVolumeIds(initialVolumeId ? [initialVolumeId] : volumes.map((v) => v.id));
        } else {
            setSelectedAgentName('');
            setSelectedPrinterName('');
            setSelectedTemplateId('');
            setSelectedVolumeIds([]);
        }
        onOpenChange(nextOpen);
    };

    const handleAgentChange = (agentName) => {
        setSelectedAgentName(agentName);
        const agent = agents.find((a) => a.name === agentName);
        const firstPrinter = agent?.printers?.[0]?.name || '';
        setSelectedPrinterName(firstPrinter);
    };

    const toggleVolume = (volumeId) => {
        setSelectedVolumeIds((prev) => {
            const current = prev.length > 0 || initialVolumeId ? prev : volumes.map((v) => v.id);
            if (current.includes(volumeId)) {
                return current.filter((id) => id !== volumeId);
            }
            return [...current, volumeId];
        });
    };

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedVolumeIds([]);
        } else {
            setSelectedVolumeIds(volumes.map((v) => v.id));
        }
    };

    const handlePrint = async () => {
        if (!canViewOutbound) return;

        if (effectiveVolumeIds.length === 0) {
            toast.warning('Selecione ao menos um volume para impressão.');
            return;
        }

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
                url: '/api/print/outbound-volumes',
                method: 'POST',
                data: {
                    volumeIds: effectiveVolumeIds,
                    templateId: selectedTemplateId,
                    stationName: selectedAgentName,
                    printerName: selectedPrinterName
                }
            });

            toast.success(res?.message || `${effectiveVolumeIds.length} etiqueta(s) enviada(s) para impressão!`);
            handleOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao enviar etiquetas de volume.');
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        <Printer className="text-orange-600" size={20} /> Imprimir Etiquetas de Volume
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Selecione os volumes da ordem, a estação, a impressora térmica e o template ZPL.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <Box size={13} className="text-orange-600" /> Volumes Selecionados ({effectiveVolumeIds.length}/{volumes.length})
                            </Label>
                            {volumes.length > 1 && (
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    disabled={isPrinting}
                                    className="text-[11px] font-semibold text-orange-700 hover:underline cursor-pointer"
                                >
                                    {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                                </button>
                            )}
                        </div>

                        <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1.5 bg-slate-50/60">
                            {volumes.map((vol) => {
                                const isChecked = effectiveVolumeIds.includes(vol.id);
                                return (
                                    <label
                                        key={vol.id}
                                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200/70 cursor-pointer hover:bg-slate-50 text-xs"
                                    >
                                        <div className="flex items-center gap-2.5 truncate">
                                            <Checkbox
                                                checked={isChecked}
                                                disabled={isPrinting}
                                                onCheckedChange={() => toggleVolume(vol.id)}
                                            />
                                            <span className="font-mono font-bold text-slate-900">{vol.volumeLpn}</span>
                                            <Badge variant="outline" className="text-[10px] font-mono">
                                                {vol.packagingTypeCode}
                                            </Badge>
                                        </div>
                                        {vol.grossWeight > 0 && (
                                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                                {vol.grossWeight} kg
                                            </span>
                                        )}
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Estação (Print Agent) *</Label>
                            <Select
                                value={selectedAgentName}
                                disabled={isLoadingAgents || isPrinting || !canViewOutbound}
                                onValueChange={handleAgentChange}
                            >
                                <SelectTrigger className="bg-white text-xs h-9">
                                    <SelectValue placeholder={isLoadingAgents ? 'Carregando...' : 'Selecione a estação...'} />
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
                                disabled={!selectedAgentName || isPrinting || !canViewOutbound}
                                onValueChange={setSelectedPrinterName}
                            >
                                <SelectTrigger className="bg-white text-xs h-9">
                                    <SelectValue placeholder={!selectedAgentName ? 'Escolha a estação...' : 'Selecione...'} />
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
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                            <Tag size={13} className="text-orange-600" /> Template ZPL *
                        </Label>
                        <Select
                            value={selectedTemplateId}
                            disabled={isLoadingTemplates || isPrinting || !canViewOutbound}
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
                    {canViewOutbound && (
                        <Button
                            type="button"
                            onClick={handlePrint}
                            disabled={isPrinting || effectiveVolumeIds.length === 0}
                            className="bg-orange-600 hover:bg-orange-700 text-white font-bold min-w-[140px]"
                        >
                            {isPrinting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Printer className="h-4 w-4 mr-1.5" />}
                            Imprimir ({effectiveVolumeIds.length})
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}