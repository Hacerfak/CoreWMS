import { useState, useEffect } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Upload, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RegisterHoldModal({ open, onOpenChange, hus = [], onSuccess }) {
    const husList = Array.isArray(hus) ? hus : (hus ? [hus] : []);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reasons, setReasons] = useState([]);
    const [qualityLocations, setQualityLocations] = useState([]);

    const [newStatus, setNewStatus] = useState('3'); // 2 = Quarentena, 3 = Avariado
    const [reasonId, setReasonId] = useState('');
    const [notes, setNotes] = useState('');
    const [qualityLocationId, setQualityLocationId] = useState('');
    const [images, setImages] = useState([]);

    useEffect(() => {
        if (open) {
            setNewStatus('3');
            setReasonId('');
            setNotes('');
            setQualityLocationId('');
            setImages([]);

            customInstance({ url: '/api/quality/reasons', method: 'GET' })
                .then(res => setReasons(Array.isArray(res) ? res : (res?.items || [])))
                .catch(() => setReasons([]));

            customInstance({ url: '/api/topology/locations/quality', method: 'GET' })
                .then(res => setQualityLocations(Array.isArray(res) ? res : []))
                .catch(() => setQualityLocations([]));
        }
    }, [open]);

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImages(prev => [...prev, { fileName: file.name, base64Data: reader.result }]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (idx) => {
        setImages(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (husList.length === 0) return toast.warning('Nenhuma HU selecionada.');
        if (!reasonId) return toast.warning('Selecione o motivo da ocorrência.');
        if (!notes.trim()) return toast.warning('Descreva a observação/justificativa da avaria.');

        setIsSubmitting(true);
        try {
            await customInstance({
                url: '/api/quality/hold',
                method: 'POST',
                data: {
                    handlingUnitIds: husList.map(h => h.id),
                    newStatus: Number(newStatus),
                    reasonId,
                    notes: notes.trim(),
                    qualityLocationId: qualityLocationId || null,
                    images: images.length > 0 ? images : null
                }
            });

            toast.success(`Avaria/Bloqueio registrado para ${husList.length} HU(s)!`);
            if (onSuccess) onSuccess();
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao registrar avaria/bloqueio.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const headerText = husList.length === 1
        ? `LPN ${husList[0]?.lpn} (${husList[0]?.productSku || husList[0]?.sku})`
        : `${husList.length} HU(s) selecionadas`;

    return (
        <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        <AlertTriangle className="text-rose-600" size={20} /> Registrar Avaria / Bloqueio
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs">
                        Apontamento para <strong className="font-mono text-slate-800">{headerText}</strong>. O saldo será bloqueado imediatamente.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Tipo de Ocorrência *</Label>
                        <Select value={newStatus} onValueChange={setNewStatus}>
                            <SelectTrigger className="bg-slate-50 text-xs h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="3">Avariado / Danificado</SelectItem>
                                <SelectItem value="2">Quarentena / Retenção</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Motivo do Bloqueio *</Label>
                        <Select value={reasonId} onValueChange={setReasonId}>
                            <SelectTrigger className="bg-slate-50 text-xs h-9">
                                <SelectValue placeholder="Selecione o motivo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {reasons.map(r => (
                                    <SelectItem key={r.id} value={r.id}>{r.code} - {r.description}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Observações e Detalhes da Avaria *</Label>
                        <Input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ex: Embalagem rasgada / palete tombado..."
                            className="text-xs h-9"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Enviar para Posição de Qualidade (Opcional)</Label>
                        <Select value={qualityLocationId} onValueChange={setQualityLocationId}>
                            <SelectTrigger className="bg-slate-50 text-xs h-9 font-mono">
                                <SelectValue placeholder="Manter na posição atual ou selecionar gaiola..." />
                            </SelectTrigger>
                            <SelectContent>
                                {qualityLocations.map(loc => (
                                    <SelectItem key={loc.id} value={loc.id} className="font-mono text-xs">
                                        {loc.fullPath}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5 pt-1">
                        <Label className="text-xs font-semibold">Fotos e Evidências</Label>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-rose-300 bg-rose-50/50 text-xs text-rose-800 cursor-pointer hover:bg-rose-100/50">
                                <Upload size={14} /> Anexar Fotos
                                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                            </label>
                            <span className="text-[10px] text-slate-500">{images.length} foto(s) anexada(s)</span>
                        </div>

                        {images.length > 0 && (
                            <div className="flex gap-2 flex-wrap pt-2">
                                {images.map((img, idx) => (
                                    <div key={idx} className="relative group w-12 h-12 rounded-lg overflow-hidden border border-rose-300">
                                        <img src={img.base64Data} alt="Evidência" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            className="absolute inset-0 bg-rose-900/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancelar</Button>
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