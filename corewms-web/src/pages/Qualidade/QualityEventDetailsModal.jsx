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
import { Badge } from '@/components/ui/badge';
import {
    ShieldAlert, ShieldCheck, MapPin, Calendar, Layers,
    Image as ImageIcon, ZoomIn, ExternalLink, Loader2,
    CheckCircle2, Clock, FileText
} from 'lucide-react';
import { toast } from 'sonner';

const resolveImageUrl = (img) => {
    if (!img) return '';
    const base = (
        import.meta.env.VITE_API_URL !== undefined
            ? import.meta.env.VITE_API_URL
            : 'http://localhost:5000'
    ).replace(/\/$/, '');

    if (img.id) {
        return `${base}/api/quality/images/${img.id}`;
    }

    const filePath = typeof img === 'string' ? img : img.filePath;
    if (!filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('data:')) {
        return filePath;
    }
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    return `${base}${cleanPath}`;
};

const formatDateTimePtBr = (dateValue) => {
    if (!dateValue) return '-';
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('pt-BR');
    } catch {
        return '-';
    }
};

const formatDatePtBr = (dateValue) => {
    if (!dateValue) return '-';
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch {
        return '-';
    }
};

const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function QualityEventDetailsModal({
    open,
    onOpenChange,
    handlingUnitId,
    initialEvent = null,
    initialHu = null,
    onRequestRelease
}) {
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lightboxImage, setLightboxImage] = useState(null);

    const targetHuId = handlingUnitId || initialEvent?.handlingUnitId || initialHu?.id;

    useEffect(() => {
        if (!open || !targetHuId) return;

        let isMounted = true;
        setIsLoading(true);
        setLightboxImage(null);

        customInstance({
            url: `/api/quality/handling-units/${targetHuId}/events`,
            method: 'GET'
        })
            .then((res) => {
                if (!isMounted) return;
                const list = Array.isArray(res) ? res : [];
                setEvents(list);
            })
            .catch(() => {
                if (!isMounted) return;
                toast.error('Erro ao carregar histórico de qualidade da HU.');
                setEvents(initialEvent ? [initialEvent] : []);
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [open, targetHuId]);

    const latestEvent = events[0] || initialEvent;
    const lpn = latestEvent?.lpn || initialHu?.lpn || '-';
    const productSku = latestEvent?.productSku || initialHu?.productSku || '-';
    const productDescription = latestEvent?.productDescription || initialHu?.productDescription || '';
    const customerName = latestEvent?.customerName || initialHu?.customerName || '-';
    const batch = latestEvent?.batch ?? initialHu?.batch;
    const expirationDate = latestEvent?.expirationDate ?? initialHu?.expirationDate;
    const currentQuantity = latestEvent?.currentQuantity ?? initialHu?.currentQuantity ?? 0;
    const unit = latestEvent?.unit || initialHu?.unit || 'UN';
    const currentLocationPath = latestEvent?.currentLocationPath || initialHu?.locationPath || 'DOCA';
    const qualityStatus = latestEvent?.qualityStatus || initialHu?.qualityStatus || 'Available';

    const openEvents = events.filter((e) => !e.isResolved);
    const canRelease = openEvents.length > 0 || (qualityStatus && qualityStatus !== 'Available');

    const renderQualityStatusBadge = (status) => {
        switch (status) {
            case 'Available':
                return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">Livre</Badge>;
            case 'Quarantine':
                return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Quarentena</Badge>;
            case 'Damaged':
                return <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-xs">Avaria Física</Badge>;
            case 'Virtual_Shortage':
                return <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">Falta Virtual</Badge>;
            default:
                return <Badge variant="outline" className="text-xs">{status}</Badge>;
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-3xl bg-white max-h-[90vh] flex flex-col overflow-hidden">
                    <DialogHeader>
                        <div className="flex items-center justify-between gap-2 pr-6">
                            <DialogTitle className="flex items-center gap-2 text-slate-900">
                                <FileText className="text-amber-600" size={20} />
                                Prontuário de Qualidade — <span className="font-mono text-blue-700">{lpn}</span>
                            </DialogTitle>
                            {renderQualityStatusBadge(qualityStatus)}
                        </div>
                        <DialogDescription className="text-xs text-slate-500">
                            Histórico completo de ocorrências, laudos técnicos e evidências fotográficas vinculadas à Unidade de Manuseio.
                        </DialogDescription>
                    </DialogHeader>

                    {/* RESUMO TÉCNICO DA HU */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="col-span-2">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Produto / SKU</span>
                            <span className="font-mono font-bold text-slate-900">{productSku}</span>
                            {productDescription && (
                                <span className="text-[11px] text-slate-600 block truncate" title={productDescription}>
                                    {productDescription}
                                </span>
                            )}
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Depositante</span>
                            <span className="font-semibold text-slate-800 block truncate" title={customerName}>
                                {customerName}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                                Saldo: <strong>{Number(currentQuantity).toLocaleString('pt-BR')} {unit}</strong>
                            </span>
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">Posição & Lote</span>
                            <span className="font-mono font-bold text-blue-700 flex items-center gap-1">
                                <MapPin size={11} /> {currentLocationPath}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 block">
                                Lote: {batch || '-'} | Val: {formatDatePtBr(expirationDate)}
                            </span>
                        </div>
                    </div>

                    {/* LINHA DO TEMPO DOS EVENTOS */}
                    <div className="flex-1 overflow-y-auto pr-1 space-y-4 py-1">
                        {isLoading ? (
                            <div className="h-44 flex flex-col items-center justify-center space-y-2 text-xs text-slate-500">
                                <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                                <span>Carregando prontuário e evidências...</span>
                            </div>
                        ) : events.length === 0 ? (
                            <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-xs text-slate-500 space-y-1">
                                <Layers className="h-7 w-7 text-slate-300 mx-auto mb-1" />
                                <p className="font-semibold text-slate-700">Nenhum evento detalhado encontrado</p>
                                <p>Esta unidade não possui registros de ocorrência na tabela de prontuários de qualidade.</p>
                            </div>
                        ) : (
                            events.map((ev, index) => {
                                const isHighlighted = initialEvent && ev.id === initialEvent.id;
                                return (
                                    <div
                                        key={ev.id}
                                        className={`border rounded-xl p-4 space-y-3 transition-all ${!ev.isResolved
                                            ? 'border-rose-200 bg-rose-50/20 shadow-2xs'
                                            : isHighlighted
                                                ? 'border-blue-300 bg-blue-50/20'
                                                : 'border-slate-200 bg-white'
                                            }`}
                                    >
                                        {/* CABEÇALHO DO EVENTO */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="font-mono text-[10px] bg-white">
                                                    Ocorrência #{events.length - index}
                                                </Badge>
                                                {ev.isResolved ? (
                                                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] gap-1">
                                                        <CheckCircle2 size={11} /> Encerrado / Liberado
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px] gap-1">
                                                        <ShieldAlert size={11} /> Bloqueio Ativo
                                                    </Badge>
                                                )}
                                            </div>

                                            <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                                                <Clock size={12} className="text-slate-400" />
                                                Registrado em: <strong>{formatDateTimePtBr(ev.createdAt)}</strong>
                                            </span>
                                        </div>

                                        {/* DADOS DO APONTAMENTO / BLOQUEIO */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                            <div className="p-3 rounded-lg bg-white border border-slate-200/80 space-y-1">
                                                <span className="text-[10px] font-bold uppercase text-rose-700 block">
                                                    Motivo do Bloqueio / Ocorrência
                                                </span>
                                                <p className="font-semibold text-slate-900">
                                                    <span className="font-mono text-rose-700 mr-1.5">{ev.holdReasonCode}</span>
                                                    — {ev.holdReasonDescription}
                                                </p>
                                                <p className="text-slate-600 text-[11px] leading-relaxed pt-1">
                                                    "{ev.holdNotes}"
                                                </p>
                                            </div>

                                            <div className="p-3 rounded-lg bg-white border border-slate-200/80 space-y-1.5">
                                                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                                    Rastreabilidade de Posição
                                                </span>
                                                <div className="text-[11px] font-mono space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-slate-500">Posição Original:</span>
                                                        <strong className="text-slate-800">{ev.originalLocationPath || 'Não registrada'}</strong>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-slate-500">Posição Atual:</span>
                                                        <strong className="text-blue-700">{ev.currentLocationPath || 'DOCA'}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* PARECER DE LIBERAÇÃO (SE RESOLVIDO) */}
                                        {ev.isResolved && (
                                            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1 text-xs">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-[10px] font-bold uppercase text-emerald-800 flex items-center gap-1">
                                                        <ShieldCheck size={13} className="text-emerald-600" />
                                                        Parecer Técnico de Liberação
                                                    </span>
                                                    {ev.resolvedAt && (
                                                        <span className="text-[10px] font-mono text-emerald-700 flex items-center gap-1">
                                                            <Calendar size={11} />
                                                            Liberado em: <strong>{formatDateTimePtBr(ev.resolvedAt)}</strong>
                                                        </span>
                                                    )}
                                                </div>
                                                {ev.releaseReasonCode && (
                                                    <p className="font-semibold text-emerald-950">
                                                        <span className="font-mono mr-1.5">{ev.releaseReasonCode}</span>
                                                        — {ev.releaseReasonDescription}
                                                    </p>
                                                )}
                                                {ev.releaseNotes && (
                                                    <p className="text-emerald-900 text-[11px]">
                                                        "{ev.releaseNotes}"
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {/* GALERIA DE FOTOS / EVIDÊNCIAS */}
                                        {ev.images && ev.images.length > 0 && (
                                            <div className="space-y-2 pt-1">
                                                <span className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1.5">
                                                    <ImageIcon size={13} className="text-blue-600" />
                                                    Evidências Fotográficas ({ev.images.length})
                                                </span>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                                    {ev.images.map((img) => {
                                                        const fullUrl = resolveImageUrl(img);
                                                        return (
                                                            <button
                                                                key={img.id}
                                                                type="button"
                                                                onClick={() => setLightboxImage({ ...img, fullUrl })}
                                                                className="group relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-square text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            >
                                                                <img
                                                                    src={fullUrl}
                                                                    alt={img.fileName}
                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                                />
                                                                <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white p-2">
                                                                    <ZoomIn size={20} className="mb-1" />
                                                                    <span className="text-[10px] font-semibold truncate max-w-full">
                                                                        {img.fileName}
                                                                    </span>
                                                                    {img.fileSizeBytes > 0 && (
                                                                        <span className="text-[9px] text-slate-300 font-mono">
                                                                            {formatBytes(img.fileSizeBytes)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <DialogFooter className="border-t pt-3 flex items-center justify-between gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Fechar
                        </Button>

                        {canRelease && onRequestRelease && (
                            <Button
                                type="button"
                                onClick={() => {
                                    onOpenChange(false);
                                    onRequestRelease({
                                        events: openEvents,
                                        hu: initialHu || (latestEvent ? {
                                            id: latestEvent.handlingUnitId,
                                            lpn: latestEvent.lpn,
                                            productSku: latestEvent.productSku
                                        } : null)
                                    });
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                            >
                                <ShieldCheck className="h-4 w-4 mr-1.5" /> Liberar Tecnicamente
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* LIGHTBOX DE VISUALIZAÇÃO AMPLIADA DA FOTO */}
            <Dialog open={Boolean(lightboxImage)} onOpenChange={(v) => !v && setLightboxImage(null)}>
                <DialogContent className="sm:max-w-4xl bg-slate-950 border-slate-800 text-white p-4">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-mono text-slate-200 flex items-center justify-between pr-8">
                            <span className="truncate">{lightboxImage?.fileName}</span>
                            {lightboxImage?.fullUrl && (
                                <a
                                    href={lightboxImage.fullUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 font-sans"
                                >
                                    <ExternalLink size={13} /> Abrir original
                                </a>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    {lightboxImage && (
                        <div className="flex items-center justify-center max-h-[75vh] overflow-hidden rounded-lg bg-black">
                            <img
                                src={lightboxImage.fullUrl}
                                alt={lightboxImage.fileName}
                                className="max-h-[75vh] w-auto object-contain"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}