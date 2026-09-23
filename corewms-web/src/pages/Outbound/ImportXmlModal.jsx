import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { UploadCloud, CheckCircle2, Loader2, AlertTriangle, FileCode } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportXmlModal({ open, onOpenChange }) {
    const queryClient = useQueryClient();
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [errors, setErrors] = useState([]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setErrors([]);
        }
    };

    const handleImport = async () => {
        if (!file) return;

        try {
            setIsUploading(true);
            setErrors([]);

            const formData = new FormData();
            formData.append('file', file);

            const res = await customInstance({
                url: '/api/outbound/orders/import-xml',
                method: 'POST',
                headers: { 'Content-Type': 'multipart/form-data' },
                data: formData
            });

            toast.success(`Pedido ${res.orderNumber} importado com sucesso para ${res.destinationName}!`);
            queryClient.invalidateQueries({ queryKey: ['/api/outbound/orders'] });
            handleClose();
        } catch (error) {
            const errData = error.response?.data;
            if (errData?.errors) {
                setErrors(errData.errors);
            }
            toast.error(errData?.message || 'Erro ao importar arquivo XML de saída.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setErrors([]);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-xl bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <FileCode className="text-orange-600" size={20} /> Importação de XML de Saída (NF-e)
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs">
                        Selecione a chave ou arquivo XML da NF-e para criar a ordem de expedição e seus itens.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label className="text-slate-700 font-semibold text-xs">Arquivo XML (.xml)</Label>
                        <label
                            htmlFor="xml-file-upload"
                            className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${file ? 'border-orange-400 bg-orange-50/50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
                                }`}
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                {file ? (
                                    <>
                                        <CheckCircle2 className="w-8 h-8 mb-2 text-orange-600" />
                                        <p className="text-sm font-semibold text-orange-900">{file.name}</p>
                                        <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud className="w-8 h-8 mb-2 text-slate-400" />
                                        <p className="text-sm text-slate-600 font-medium">Clique para selecionar a NF-e XML</p>
                                        <p className="text-xs text-slate-400 mt-1">Formato padrão NFe (v4.00)</p>
                                    </>
                                )}
                            </div>
                            <input
                                id="xml-file-upload"
                                type="file"
                                accept=".xml"
                                disabled={isUploading}
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </label>
                    </div>

                    {errors.length > 0 && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-1 text-rose-800">
                            <p className="font-bold flex items-center gap-1">
                                <AlertTriangle size={14} /> Divergências no Mapeamento:
                            </p>
                            {errors.map((err, idx) => (
                                <p key={idx} className="font-mono text-[11px] text-rose-600">• {err}</p>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" onClick={handleClose} disabled={isUploading}>Cancelar</Button>
                    <Button
                        onClick={handleImport}
                        disabled={!file || isUploading}
                        className="bg-orange-600 hover:bg-orange-700 text-white min-w-[140px]"
                    >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UploadCloud className="h-4 w-4 mr-2" />}
                        Importar Pedido
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}