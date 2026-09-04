import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiInboundUploadXml } from '@/api/generated/inbound/inbound';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, UploadCloud, FileCode2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function UploadXmlModal({ open, onOpenChange }) {
    const queryClient = useQueryClient();
    const [file, setFile] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    const { mutate: uploadXml, isPending } = usePostApiInboundUploadXml({
        mutation: {
            onSuccess: (data) => {
                // O data vem com a mensagem inteligente do Backend (Se foi pra Doca ou Revisão)
                toast.success(data.message || 'XML importado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
                setFile(null);
                onOpenChange(false);
            },
            onError: (err) => {
                setErrorMsg(err.response?.data?.message || 'Erro ao processar o arquivo XML.');
            }
        }
    });

    const handleUpload = () => {
        setErrorMsg('');
        if (!file) return;

        uploadXml({
            data: {
                xmlFile: file
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={(val) => { if (!isPending) onOpenChange(val); }}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileCode2 className="text-blue-600" size={20} />
                        Importar XML (NF-e)
                    </DialogTitle>
                    <DialogDescription>
                        Faça o upload do arquivo XML da nota fiscal. O sistema fará a leitura, cruzamento de produtos e criação automática do depositante, se necessário.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {errorMsg && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg flex items-start gap-2.5">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <label
                        className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${file ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-blue-300'
                            }`}
                    >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {file ? (
                                <>
                                    <CheckCircle2 className="w-10 h-10 mb-2 text-emerald-500" />
                                    <p className="text-sm font-semibold text-emerald-900">{file.name}</p>
                                    <p className="text-xs text-emerald-600 mt-1">Pronto para processamento</p>
                                </>
                            ) : (
                                <>
                                    <UploadCloud className="w-10 h-10 mb-3 text-slate-400" />
                                    <p className="text-sm text-slate-600 font-medium">Clique ou arraste o XML aqui</p>
                                    <p className="text-xs text-slate-400 mt-1">Apenas arquivos .xml</p>
                                </>
                            )}
                        </div>
                        <input
                            type="file" accept=".xml" disabled={isPending} className="hidden"
                            onChange={(e) => { setFile(e.target.files[0]); setErrorMsg(''); }}
                        />
                    </label>
                </div>

                <DialogFooter className="border-t border-slate-100 pt-4">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
                    <Button type="button" onClick={handleUpload} disabled={isPending || !file} className="bg-slate-900 text-white min-w-[130px]">
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Processar XML'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}