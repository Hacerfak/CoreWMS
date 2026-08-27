import { usePostApiPrintSendTest } from '@/api/generated/printing/printing';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Server, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';

export default function PrintTemplateModal({ open, onOpenChange, template, agentes }) {
    const { mutate: testPrint, isPending: isTesting } = usePostApiPrintSendTest({
        mutation: {
            onSuccess: (data) => {
                toast.success(`Template enviado! Job ID: ${data.jobId}`);
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao imprimir template.')
        }
    });

    const handlePrint = (agente, impressora) => {
        testPrint({
            data: {
                stationName: agente.name,
                printerName: impressora.name,
                customZpl: template?.zplContent || '' // Injetamos o ZPL do template aqui!
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Printer className="text-blue-600" size={20} /> Testar Template
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Selecione a impressora de destino para testar o modelo <strong className="text-slate-800">{template?.name}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 mt-2">
                    {agentes.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-4">Nenhum agente cadastrado.</p>
                    )}
                    {agentes.map(agente => (
                        <div key={agente.id} className="border border-slate-100 rounded-lg p-3 bg-white shadow-sm">
                            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-800">
                                <Server size={14} className="text-slate-400" /> {agente.name}
                            </div>
                            <div className="space-y-2 pl-2">
                                {agente.printers?.length === 0 && (
                                    <p className="text-xs text-slate-400 italic">Sem impressoras vinculadas</p>
                                )}
                                {agente.printers?.map(p => (
                                    <div key={p.id} className="flex items-center justify-between bg-slate-50 p-2 rounded-md border border-slate-100">
                                        <span className="text-xs font-medium text-slate-700">{p.name}</span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-xs bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
                                            onClick={() => handlePrint(agente, p)}
                                            disabled={isTesting}
                                        >
                                            {isTesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                                            Imprimir
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}