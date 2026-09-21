import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiInboundImport } from '@/api/generated/inbound/inbound';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud, FileCode2, Loader2, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportXmlModal({ open, onOpenChange }) {
    const queryClient = useQueryClient();
    const [files, setFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);

    const { mutate: importXml, isPending } = usePostApiInboundImport({
        mutation: {
            onSuccess: () => {
                toast.success('XML(s) importados e processados com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
                queryClient.invalidateQueries({ queryKey: ['/api/customers'] }); // Atualiza clientes caso o backend tenha criado novos
                setFiles([]);
                onOpenChange(false);
            },
            onError: (err) => {
                toast.error(err.response?.data?.detail || err.response?.data?.message || 'Erro ao importar ficheiros XML.');
            }
        }
    });

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xml'));
        if (droppedFiles.length === 0) return toast.warning('Apenas ficheiros .xml são suportados.');
        setFiles(prev => [...prev, ...droppedFiles]);
    };

    const handleFileSelect = (e) => {
        const selectedFiles = Array.from(e.target.files).filter(f => f.name.endsWith('.xml'));
        setFiles(prev => [...prev, ...selectedFiles]);
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleImport = () => {
        if (files.length === 0) return;
        importXml({ data: { files } });
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!isPending) onOpenChange(v); }}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileCode2 className="text-emerald-600" size={20} /> Importar XML (NF-e)
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Arraste os ficheiros XML para criar as Ordens de Recebimento. O sistema cadastrará clientes e emitentes automaticamente.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <label
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-emerald-300'}`}
                    >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                            <UploadCloud className={`w-8 h-8 mb-2 ${isDragging ? 'text-emerald-500' : 'text-slate-400'}`} />
                            <p className="text-sm font-medium text-slate-600">
                                {isDragging ? 'Solte os ficheiros aqui...' : 'Clique ou arraste ficheiros .xml'}
                            </p>
                        </div>
                        <input type="file" accept=".xml" multiple className="hidden" onChange={handleFileSelect} disabled={isPending} />
                    </label>

                    {files.length > 0 && (
                        <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-2">
                            {files.map((file, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded-lg">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <FileCode2 size={14} className="text-slate-400 shrink-0" />
                                        <span className="text-xs font-medium text-slate-700 truncate">{file.name}</span>
                                    </div>
                                    <button onClick={() => removeFile(idx)} disabled={isPending} className="text-rose-500 hover:bg-rose-100 p-1 rounded-md transition-colors">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-slate-100 pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
                    <Button onClick={handleImport} disabled={files.length === 0 || isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[130px]">
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Importar ${files.length} XML(s)`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}