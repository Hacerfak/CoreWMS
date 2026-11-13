import { useState, useEffect, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, Loader2, Layers, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export default function ReleaseQualityModal({
    open,
    onOpenChange,
    hus = [],
    events = [],
    onSuccess
}) {
    const husList = useMemo(() => (Array.isArray(hus) ? hus : hus ? [hus] : []), [hus]);
    const eventsList = useMemo(() => (Array.isArray(events) ? events : events ? [events] : []), [events]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reasons, setReasons] = useState([]);

    const [reasonId, setReasonId] = useState('');
    const [notes, setNotes] = useState('');
    const [returnToOriginalLocation, setReturnToOriginalLocation] = useState(true);

    useEffect(() => {
        if (open) {
            setReasonId('');
            setNotes('');
            setReturnToOriginalLocation(true);

            customInstance({ url: '/api/quality/reasons?onlyActive=true', method: 'GET' })
                .then(res => setReasons(Array.isArray(res) ? res : (res?.items || [])))
                .catch(() => setReasons([]));
        }
    }, [open]);

    const displayBadges = useMemo(() => {
        if (eventsList.length > 0) {
            return eventsList.map(ev => ({
                key: ev.id,
                lpn: ev.lpn,
                sku: ev.productSku,
                origin: ev.originalLocationPath
            }));
        }
        return husList.map(h => ({
            key: h.id,
            lpn: h.lpn,
            sku: h.productSku || h.sku || '',
            origin: null
        }));
    }, [husList, eventsList]);

    const totalItems = displayBadges.length;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (totalItems === 0) return toast.warning('Nenhum item selecionado para liberação.');
        if (!reasonId) return toast.warning('Selecione o motivo padronizado de liberação.');
        if (!notes.trim()) return toast.warning('Informe o parecer técnico de liberação.');

        setIsSubmitting(true);
        try {
            const payload = {
                handlingUnitIds: husList.map(h => h.id),
                eventIds: eventsList.map(ev => ev.id),
                reasonId,
                notes: notes.trim(),
                returnToOriginalLocation
            };

            const res = await customInstance({
                url: '/api/quality/release-batch',
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || `${totalItems} unidade(s) liberada(s) com sucesso!`);
            onSuccess?.();
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao efetuar liberação técnica.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
            <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        <ShieldCheck className="text-emerald-600" size={20} /> Liberação Técnica de Qualidade ({totalItems})
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs">
                        As unidades selecionadas terão seus prontuários encerrados, voltarão para o status <strong>Livre (Available)</strong> e ficarão disponíveis para alocação e expedição.
                    </DialogDescription>
                </DialogHeader>

                {displayBadges.length > 0 && (
                    <div className="bg-emerald-50/40 border border-emerald-200 rounded-lg p-2.5 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                        {displayBadges.map(item => (
                            <Badge
                                key={item.key}
                                variant="outline"
                                className="bg-white border-emerald-200 text-slate-800 font-mono text-[10px] gap-1"
                            >
                                <Layers size={10} className="text-emerald-600" />
                                {item.lpn} {item.sku ? `(${item.sku})` : ''}
                                {item.origin && (
                                    <span className="text-slate-400 ml-0.5">→ {item.origin}</span>
                                )}
                            </Badge>
                        ))}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 py-1">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-800">Motivo da Liberação *</Label>
                        <Select value={reasonId} onValueChange={setReasonId}>
                            <SelectTrigger className="bg-slate-50 text-xs h-9">
                                <SelectValue placeholder="Selecione o motivo padronizado..." />
                            </SelectTrigger>
                            <SelectContent>
                                {reasons.length === 0 ? (
                                    <div className="p-2 text-xs text-slate-400 text-center">
                                        Nenhum motivo ativo cadastrado.
                                    </div>
                                ) : (
                                    reasons.map(r => (
                                        <SelectItem key={r.id} value={r.id} className="text-xs">
                                            <span className="font-mono font-bold mr-1.5">{r.code}</span> - {r.description}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-800">Parecer Técnico / Laudo de Inspeção *</Label>
                        <Input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ex: Reembalagem concluída e integridade validada pela equipe de qualidade..."
                            className="text-xs h-9 bg-white"
                        />
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                            <Label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                <MapPin size={13} className="text-blue-600" /> Retornar à Posição Original
                            </Label>
                            <p className="text-[11px] text-slate-500">
                                Caso a HU tenha sido movida para uma gaiola de qualidade, devolve automaticamente ao endereço de origem.
                            </p>
                        </div>
                        <Switch
                            checked={returnToOriginalLocation}
                            onCheckedChange={setReturnToOriginalLocation}
                        />
                    </div>

                    <DialogFooter className="pt-2 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || totalItems === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs min-w-[170px]"
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                            ) : (
                                <ShieldCheck className="h-4 w-4 mr-1.5" />
                            )}
                            Confirmar Liberação ({totalItems})
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}