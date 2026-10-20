import { useState } from 'react';
import { customInstance } from '@/api/orval-mutator';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function CorrectionLetterModal({
    open,
    onOpenChange,
    orderId,
    documentId,
    orderNumber,
    accessKey,
    onSuccess
}) {
    const [correctionText, setCorrectionText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Funciona perfeitamente tanto para Notas Avulsas quanto vinculadas a Pedidos
    const targetId = documentId || orderId;
    const charCount = correctionText.trim().length;
    const isTextValid = correctionText.trim().length >= 15 && correctionText.trim().length <= 1000;

    const handleSubmit = async (e) => {
        e?.preventDefault();

        if (!targetId) {
            return toast.error('Identificador da NF-e não informado.');
        }

        if (correctionText.trim().length < 15) {
            return toast.warning('O texto da carta de correção deve ter no mínimo 15 caracteres (Exigência SEFAZ).');
        }

        try {
            setIsSubmitting(true);
            const res = await customInstance({
                url: `/api/fiscal/nfe/correction-letter/${targetId}`,
                method: 'POST',
                data: {
                    correctionText: correctionText.trim()
                }
            });

            const data = res?.data || res;
            toast.success(data?.message || 'Carta de Correção registrada com sucesso na SEFAZ!');
            setCorrectionText('');
            onOpenChange(false);
            if (onSuccess) onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao registrar Carta de Correção na SEFAZ.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2 text-base">
                        <FileSignature className="text-purple-600" size={20} /> Carta de Correção Eletrônica (CC-e)
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Emissão de evento de retificação para a NF-e.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    {/* ADVERTÊNCIA LEGAL SEFAZ */}
                    <div className="p-3 bg-purple-50 border border-purple-200/80 rounded-xl space-y-1.5 text-xs text-purple-900">
                        <div className="flex items-center gap-1.5 font-bold text-purple-950">
                            <AlertCircle size={15} className="text-purple-600" /> Vedações Legais (Convênio SINIEF S/N 1970)
                        </div>
                        <ul className="text-[11px] text-purple-800 list-disc list-inside space-y-0.5 leading-relaxed">
                            <li>Não pode alterar valores fiscais, alíquotas, base de cálculo ou quantidades.</li>
                            <li>Não pode alterar dados cadastrais de remetente ou destinatário.</li>
                            <li>Não pode alterar a data de emissão ou saída da mercadoria.</li>
                        </ul>
                    </div>

                    {accessKey && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-mono space-y-1">
                            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Chave de Acesso da NF-e</span>
                            <span className="text-slate-700 text-[11px] break-all block">{accessKey}</span>
                        </div>
                    )}

                    {/* CAMPO DE TEXTO DA CORREÇÃO */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <Label className="text-xs font-semibold text-slate-800">
                                Texto da Correção *
                            </Label>
                            <span className={`text-[10px] font-mono font-medium ${charCount < 15 ? 'text-amber-600' : charCount > 1000 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {charCount}/1000 caracteres (mín. 15)
                            </span>
                        </div>

                        <textarea
                            value={correctionText}
                            onChange={(e) => setCorrectionText(e.target.value)}
                            placeholder="Descreva as correções necessárias com clareza (ex: Onde constava endereço de entrega X, considere endereço Y; Informações complementares corrigidas para...)"
                            className="w-full min-h-[110px] rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-sans resize-none"
                            maxLength={1000}
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
                            disabled={isSubmitting || !isTextValid}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-9 px-4 text-xs"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Transmitindo CC-e...
                                </>
                            ) : (
                                <>
                                    <FileSignature className="h-4 w-4 mr-1.5" />
                                    Transmitir Carta de Correção
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}