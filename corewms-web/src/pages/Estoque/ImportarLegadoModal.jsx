import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { UploadCloud, CheckCircle2, Loader2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportarLegadoModal({ open, onOpenChange }) {
    const queryClient = useQueryClient();
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [result, setResult] = useState(null);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleImport = async () => {
        if (!file) return;

        try {
            setIsUploading(true);
            setResult(null);

            const formData = new FormData();
            formData.append('file', file);

            const data = await customInstance({
                url: '/api/inbound/legacy-import',
                method: 'POST',
                headers: { 'Content-Type': 'multipart/form-data' },
                data: formData
            });

            setResult(data);
            toast.success(`Importação realizada: ${data?.husImported || 0} HUs importadas.`);
            queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao importar arquivo do inventário legado.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setResult(null);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-xl bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <FileSpreadsheet className="text-blue-600" size={20} /> Carga do Inventário Legado
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs">
                        Importe a planilha CSV com os saldos físicos, LPNs e localizações migrados do sistema antigo.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label className="text-slate-700 font-semibold text-xs">Planilha CSV (.csv)</Label>
                        <label
                            htmlFor="legacy-file-upload"
                            className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${file ? 'border-blue-400 bg-blue-50/50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
                                }`}
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                {file ? (
                                    <>
                                        <CheckCircle2 className="w-8 h-8 mb-2 text-blue-600" />
                                        <p className="text-sm font-semibold text-blue-900">{file.name}</p>
                                        <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud className="w-8 h-8 mb-2 text-slate-400" />
                                        <p className="text-sm text-slate-600 font-medium">Clique para selecionar o arquivo CSV</p>
                                        <p className="text-xs text-slate-400 mt-1">Formato esperado: LPN;SKU;...;CNPJ Depositante</p>
                                    </>
                                )}
                            </div>
                            <input
                                id="legacy-file-upload"
                                type="file"
                                accept=".csv,.txt"
                                disabled={isUploading}
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </label>
                    </div>

                    {result && (
                        <div className="p-4 rounded-xl border bg-slate-50 text-xs space-y-2">
                            <div className="flex items-center justify-between font-bold text-slate-900 border-b pb-2">
                                <span>Status do Processamento:</span>
                                <span className="text-emerald-700">{result.husImported} HUs Registradas</span>
                            </div>

                            {result.errors && result.errors.length > 0 && (
                                <div className="space-y-1 pt-1 max-h-36 overflow-y-auto">
                                    <p className="font-semibold text-amber-800 flex items-center gap-1">
                                        <AlertTriangle size={14} /> Divergências Encontradas ({result.errors.length}):
                                    </p>
                                    {result.errors.map((err, idx) => (
                                        <p key={idx} className="text-rose-600 font-mono text-[11px]">{err}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={handleClose} disabled={isUploading}>
                        Fechar
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={!file || isUploading}
                        className="bg-slate-900 hover:bg-slate-800 text-white min-w-[140px]"
                    >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UploadCloud className="h-4 w-4 mr-2" />}
                        Processar Carga
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}