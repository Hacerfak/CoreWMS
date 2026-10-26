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
import { Loader2, Mail, Send, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function SendNfeEmailModal({ open, onOpenChange, document, defaultEmail = '' }) {
    const [destinationEmail, setDestinationEmail] = useState('');
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (open) {
            setDestinationEmail(defaultEmail || document?.customerEmail || '');
        }
    }, [open, defaultEmail, document]);

    const handleSend = async (e) => {
        e?.preventDefault();

        if (!destinationEmail || !destinationEmail.includes('@')) {
            return toast.warning('Por favor, informe um endereço de e-mail válido.');
        }

        try {
            setIsSending(true);
            const res = await customInstance({
                url: `/api/fiscal/nfe/${document.id}/email?destinationEmail=${encodeURIComponent(destinationEmail.trim())}`,
                method: 'POST'
            });

            toast.success(res?.message || 'E-mail enviado com sucesso!');
            onOpenChange(false);
        } catch (error) {
            toast.error(error.response?.data?.detail || error.response?.data?.message || 'Erro ao enviar e-mail.');
        } finally {
            setIsSending(false);
        }
    };

    if (!document) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] bg-white">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Mail className="h-5 w-5 text-orange-600" /> Enviar NF-e por E-mail
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Envie o arquivo XML autorizado e o link público de impressão da DANFE diretamente ao destinatário.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSend} className="space-y-4 py-2">
                    {/* CARD INFORMATIVO DO DOCUMENTO */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500 font-medium">Chave de Acesso:</span>
                            <Badge variant="outline" className="font-mono text-[10px] bg-white">
                                {document.status || 'Autorizada'}
                            </Badge>
                        </div>
                        <div className="font-mono text-xs text-slate-800 break-all bg-white p-2 rounded border border-slate-200">
                            {document.accessKey || '-'}
                        </div>
                    </div>

                    {/* CAMPO DE E-MAIL */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">
                            E-mail do Destinatário *
                        </Label>
                        <Input
                            type="email"
                            autoFocus
                            placeholder="exemplo@empresa.com.br"
                            value={destinationEmail}
                            onChange={(e) => setDestinationEmail(e.target.value)}
                            className="h-10 text-xs bg-white font-mono"
                            required
                        />
                        <p className="text-[11px] text-slate-400">
                            Pré-carregado com o e-mail cadastrado no depositante. Você pode alterá-lo se necessário.
                        </p>
                    </div>

                    {/* ANEXOS INCLUÍDOS */}
                    <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center gap-2 text-xs text-blue-900">
                        <FileText size={16} className="text-blue-600 shrink-0" />
                        <span>Itens inclusos: <strong>Arquivo XML (.xml)</strong> + <strong>DANFE Online (PDF)</strong></span>
                    </div>

                    <DialogFooter className="pt-2 flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSending}
                            className="h-9 text-xs"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSending || !destinationEmail}
                            className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9 text-xs px-4 shadow-xs"
                        >
                            {isSending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            ) : (
                                <Send className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Disparar E-mail
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}