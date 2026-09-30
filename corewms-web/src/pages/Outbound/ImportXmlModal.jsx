import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { UploadCloud, CheckCircle2, Loader2, AlertTriangle, FileCode, X } from 'lucide-react';
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

            toast.success(`Pedido NF ${res.orderNumber} importado com sucesso para ${res.destinationName}!`);
            queryClient.invalidateQueries({ queryKey: ['/api/outbound/orders'] });
            handleClose();
        } catch (error) {
            const errData = error.response?.data;
            if (errData?.errors) {
                setErrors(errData.errors);
            }
            toast.error(errData?.message || 'Erro ao importar arquivo XML de venda.');
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
            <DialogContent className="sm:max-w-lg bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <FileCode className="text-orange-600" size={20} /> Importar NF-e de Venda do Cliente
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs">
                        Selecione o arquivo XML da NF-e emitida pelo Depositante para gerar a ordem de saída.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label className="text-slate-700 font-semibold text-xs">Arquivo XML da NF-e (.xml) *</Label>
                        <label
                            htmlFor="outbound-xml-upload"
                            className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${file ? 'border-orange-400 bg-orange-50/50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
                                }`}
                        >
                            <div className="flex flex-col items-center justify-center pt-4 pb-5 pointer-events-none">
                                {file ? (
                                    <>
                                        <CheckCircle2 className="w-8 h-8 mb-1.5 text-orange-600" />
                                        <p className="text-xs font-semibold text-orange-900">{file.name}</p>
                                        <p className="text-[10px] text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud className="w-8 h-8 mb-2 text-slate-400" />
                                        <p className="text-xs text-slate-600 font-medium">Clique para selecionar o XML de Venda</p>
                                        <p className="text-[10px] text-slate-400 mt-1">Validação automática de Emitente e SKUs</p>
                                    </>
                                )}
                            </div>
                            <input
                                id="outbound-xml-upload"
                                type="file"
                                accept=".xml"
                                disabled={isUploading}
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </label>
                    </div>

                    {errors.length > 0 && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-1 text-rose-800 max-h-36 overflow-y-auto">
                            <p className="font-bold flex items-center gap-1 text-rose-900 sticky top-0 bg-rose-50 pb-1">
                                <AlertTriangle size={14} /> Inconsistências de Mapeamento:
                            </p>
                            {errors.map((err, idx) => (
                                <p key={idx} className="font-mono text-[11px] text-rose-600">• {err}</p>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t pt-3 flex justify-end gap-2">
                    <Button variant="outline" onClick={handleClose} disabled={isUploading}>Cancelar</Button>
                    <Button
                        onClick={handleImport}
                        disabled={!file || isUploading}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold min-w-[140px]"
                    >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <UploadCloud className="h-4 w-4 mr-1.5" />}
                        Importar Pedido
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}