import { useState } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Ban, AlertTriangle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export default function CancelNfeModal({ open, onOpenChange, orderId, orderNumber, accessKey, onSuccess }) {
    const [justification, setJustification] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const charCount = justification.trim().length;
    const isValidLength = charCount >= 15 && charCount <= 255;

    const handleCancelNfe = async (e) => {
        e.preventDefault();

        if (charCount < 15) {
            toast.error('A justificativa deve ter no mínimo 15 caracteres (exigência SEFAZ).');
            return;
        }

        try {
            setIsSubmitting(true);

            const res = await customInstance({
                url: `/api/fiscal/nfe/cancel/${orderId}`,
                method: 'POST',
                data: {
                    justification: justification.trim()
                }
            });

            const data = res?.data || res;
            toast.success(data?.message || 'NF-e Cancelada com sucesso na SEFAZ!');

            setJustification('');
            onOpenChange(false);
            if (onSuccess) onSuccess();
        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message || 'Falha ao registrar evento de cancelamento na SEFAZ.';
            toast.error(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2 text-base">
                        <Ban className="text-rose-600" size={20} /> Cancelamento de NF-e na SEFAZ
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Registro oficial do evento de cancelamento da Nota Fiscal vinculada ao Pedido #{orderNumber}.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCancelNfe} className="space-y-4 py-2">
                    {/* ALERTA DE ATENÇÃO */}
                    <div className="p-3 bg-rose-50 border border-rose-200/80 rounded-xl space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-rose-900">
                            <AlertTriangle size={15} className="text-rose-600" /> Ação Irreversível
                        </div>
                        <p className="text-[11px] text-rose-800 leading-relaxed">
                            O cancelamento é transmitido síncronamente para a SEFAZ. O documento fiscal original perderá sua validade jurídica de circulação.
                        </p>
                    </div>

                    {/* DADOS DA NF-E */}
                    {accessKey && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-mono space-y-1">
                            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Chave de Acesso</span>
                            <span className="text-slate-700 text-[11px] break-all block">{accessKey}</span>
                        </div>
                    )}

                    {/* CAMPO JUSTIFICATIVA */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <Label className="text-xs font-semibold text-slate-800">
                                Justificativa do Cancelamento *
                            </Label>
                            <span className={`text-[10px] font-mono font-medium ${charCount < 15 ? 'text-amber-600' : charCount > 255 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {charCount}/255 caracteres (mín. 15)
                            </span>
                        </div>

                        <textarea
                            value={justification}
                            onChange={(e) => setJustification(e.target.value)}
                            placeholder="Descreva o motivo do cancelamento (ex: Desistência da compra pelo destinatário, erro de conferência ou emissão duplicada)..."
                            className="w-full min-h-[95px] rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-sans resize-none"
                            maxLength={255}
                            disabled={isSubmitting}
                        />

                        {charCount > 0 && charCount < 15 && (
                            <p className="text-[10px] text-amber-600 flex items-center gap-1">
                                <ShieldAlert size={12} /> Faltam {15 - charCount} caractere(s) para atingir o mínimo legal exigido pela SEFAZ.
                            </p>
                        )}
                    </div>

                    <DialogFooter className="pt-3 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                            className="h-9 text-xs"
                        >
                            Voltar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || !isValidLength}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-9 px-4 text-xs"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Transmitindo Cancelamento...
                                </>
                            ) : (
                                <>
                                    <Ban className="h-4 w-4 mr-1.5" />
                                    Confirmar Cancelamento
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}