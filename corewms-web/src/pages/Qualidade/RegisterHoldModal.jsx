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
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Upload, Trash2, Loader2, Layers } from 'lucide-react';
import { toast } from 'sonner';

export default function RegisterHoldModal({
    open,
    onOpenChange,
    hus = [],
    defaultStatus = '3', // 2 = Quarentena, 3 = Avariado, 4 = Falta Virtual
    onSuccess
}) {
    const husList = Array.isArray(hus) ? hus : (hus ? [hus] : []);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reasons, setReasons] = useState([]);
    const [qualityLocations, setQualityLocations] = useState([]);

    const [newStatus, setNewStatus] = useState(String(defaultStatus || '3'));
    const [reasonId, setReasonId] = useState('');
    const [notes, setNotes] = useState('');
    const [qualityLocationId, setQualityLocationId] = useState('NONE');
    const [images, setImages] = useState([]);

    useEffect(() => {
        if (open) {
            setNewStatus(String(defaultStatus || '3'));
            setReasonId('');
            setNotes('');
            setQualityLocationId('NONE');
            setImages([]);

            customInstance({ url: '/api/quality/reasons?onlyActive=true', method: 'GET' })
                .then(res => setReasons(Array.isArray(res) ? res : (res?.items || [])))
                .catch(() => setReasons([]));

            customInstance({ url: '/api/topology/locations/quality', method: 'GET' })
                .then(res => setQualityLocations(Array.isArray(res) ? res : []))
                .catch(() => setQualityLocations([]));
        }
    }, [open, defaultStatus]);

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImages(prev => [...prev, { fileName: file.name, base64Data: reader.result }]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeImage = (idx) => {
        setImages(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (husList.length === 0) return toast.warning('Nenhuma HU selecionada.');
        if (!reasonId) return toast.warning('Selecione o motivo da ocorrência.');
        if (!notes.trim()) return toast.warning('Descreva a observação/justificativa do bloqueio.');

        setIsSubmitting(true);
        try {
            const res = await customInstance({
                url: '/api/quality/hold',
                method: 'POST',
                data: {
                    handlingUnitIds: husList.map(h => h.id),
                    newStatus: Number(newStatus),
                    reasonId,
                    notes: notes.trim(),
                    qualityLocationId: qualityLocationId && qualityLocationId !== 'NONE' ? qualityLocationId : null,
                    images: images.length > 0 ? images : null
                }
            });

            toast.success(res?.message || `Ocorrência de qualidade registrada para ${husList.length} HU(s)!`);
            if (onSuccess) onSuccess();
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao registrar bloqueio/status de qualidade.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const headerText = husList.length === 1
        ? `LPN ${husList[0]?.lpn} (${husList[0]?.productSku || husList[0]?.sku || ''})`
        : `${husList.length} HU(s) selecionadas`;

    return (
        <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
            <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        <AlertTriangle className="text-rose-600" size={20} /> Registrar Bloqueio / Status de Qualidade
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs">
                        Apontamento para <strong className="font-mono text-slate-800">{headerText}</strong>. O saldo ficará indisponível para expedição até a liberação técnica.
                    </DialogDescription>
                </DialogHeader>

                {husList.length > 1 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {husList.map(h => (
                            <Badge key={h.id} variant="outline" className="bg-white font-mono text-[10px] gap-1">
                                <Layers size={10} className="text-purple-600" />
                                {h.lpn} ({h.productSku || h.sku})
                            </Badge>
                        ))}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 py-1">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Novo Status de Qualidade *</Label>
                        <Select value={newStatus} onValueChange={setNewStatus}>
                            <SelectTrigger className="bg-slate-50 text-xs h-9 font-medium">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="2">Quarentena / Retenção Técnica</SelectItem>
                                <SelectItem value="3">Avariado / Danificado</SelectItem>
                                <SelectItem value="4">Falta Virtual / Em Análise</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Motivo Padronizado *</Label>
                        <Select value={reasonId} onValueChange={setReasonId}>
                            <SelectTrigger className="bg-slate-50 text-xs h-9">
                                <SelectValue placeholder="Selecione o motivo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {reasons.length === 0 ? (
                                    <div className="p-2 text-xs text-slate-400 text-center">Nenhum motivo ativo cadastrado.</div>
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
                        <Label className="text-xs font-semibold">Observações e Detalhes da Ocorrência *</Label>
                        <Input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ex: Embalagem violada / umidade detectada na descarga..."
                            className="text-xs h-9 bg-white"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Transferir para Posição de Qualidade (Opcional)</Label>
                        <Select value={qualityLocationId} onValueChange={setQualityLocationId}>
                            <SelectTrigger className="bg-slate-50 text-xs h-9 font-mono">
                                <SelectValue placeholder="Manter na posição atual..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="NONE" className="text-xs font-sans text-slate-500">
                                    Manter na posição atual
                                </SelectItem>
                                {qualityLocations.map(loc => (
                                    <SelectItem key={loc.id} value={loc.id} className="font-mono text-xs">
                                        {loc.fullPath}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 pt-1">
                        <Label className="text-xs font-semibold">Fotos e Evidências (Opcional)</Label>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-rose-300 bg-rose-50/50 text-xs text-rose-800 cursor-pointer hover:bg-rose-100/50 transition-colors">
                                <Upload size={14} /> Anexar Fotos
                                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                            </label>
                            <span className="text-[10px] text-slate-500">
                                {images.length} {images.length === 1 ? 'foto anexada' : 'fotos anexadas'}
                            </span>
                        </div>
                        {images.length > 0 && (
                            <div className="flex gap-2 flex-wrap pt-2">
                                {images.map((img, idx) => (
                                    <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-rose-300">
                                        <img src={img.base64Data} alt="Evidência" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            className="absolute inset-0 bg-rose-900/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Remover foto"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-2 border-t">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSubmitting} className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <AlertTriangle className="h-4 w-4 mr-1.5" />}
                            Confirmar Bloqueio ({husList.length})
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}