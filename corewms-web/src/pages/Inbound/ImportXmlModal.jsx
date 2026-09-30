import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UploadCloud, FileCode2, Loader2, X, KeyRound, ArrowRight, Layers } from 'lucide-react';
import { customInstance } from '@/api/orval-mutator';
import { toast } from 'sonner';

export default function ImportXmlModal({ open, onOpenChange }) {
    const queryClient = useQueryClient();

    // Estado de Upload de XML
    const [files, setFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);

    // Estado de Importação por Chave de Acesso
    const [accessKey, setAccessKey] = useState('');

    // Estado de Processamento em Lotes (Batching)
    const [isProcessingBatch, setIsProcessingBatch] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, totalFiles: 0, processedFiles: 0 });

    const resetAndClose = () => {
        setFiles([]);
        setAccessKey('');
        setIsProcessingBatch(false);
        setBatchProgress({ current: 0, total: 0, totalFiles: 0, processedFiles: 0 });
        onOpenChange(false);
    };

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
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
        e.target.value = ''; // Permite selecionar o mesmo arquivo novamente se tiver sido removido
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleImport = async () => {
        if (isProcessingBatch) return;

        const cleanKey = accessKey.trim();
        const hasKey = cleanKey.length === 44;
        const hasFiles = files.length > 0;

        if (!hasKey && !hasFiles) {
            return toast.warning('Informe uma Chave de Acesso de 44 dígitos ou selecione arquivos XML.');
        }

        if (cleanKey.length > 0 && !hasKey) {
            return toast.warning('A Chave de Acesso deve possuir exatamente 44 dígitos numéricos.');
        }

        setIsProcessingBatch(true);
        let keySuccess = false;
        let totalImportedCount = 0;
        const allErrors = [];

        // 1. Processa Chave de Acesso SEFAZ (se preenchida)
        if (hasKey) {
            try {
                const res = await customInstance({
                    url: '/api/inbound/import-by-key',
                    method: 'POST',
                    data: { accessKey: cleanKey }
                });
                toast.success(res?.message || 'NF-e consultada na SEFAZ e baixada com sucesso!');
                keySuccess = true;
            } catch (err) {
                allErrors.push(`Chave SEFAZ: ${err.response?.data?.message || 'Erro ao consultar NF-e pela Chave.'}`);
            }
        }

        // 2. Processa Arquivos XML em Lotes de 5 (se selecionados)
        if (hasFiles) {
            const BATCH_SIZE = 5;
            const totalFiles = files.length;
            const batches = [];

            for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
                batches.push(files.slice(i, i + BATCH_SIZE));
            }

            setBatchProgress({ current: 0, total: batches.length, totalFiles, processedFiles: 0 });

            for (let idx = 0; idx < batches.length; idx++) {
                const currentBatchFiles = batches[idx];

                setBatchProgress(prev => ({
                    ...prev,
                    current: idx + 1,
                    processedFiles: Math.min(totalFiles, (idx + 1) * BATCH_SIZE)
                }));

                const formData = new FormData();
                currentBatchFiles.forEach(file => {
                    formData.append('files', file);
                });

                try {
                    const response = await customInstance({
                        url: '/api/inbound/import',
                        method: 'POST',
                        headers: { 'Content-Type': 'multipart/form-data' },
                        data: formData
                    });

                    if (response?.processedCount) {
                        totalImportedCount += response.processedCount;
                    }
                    if (response?.errors && response.errors.length > 0) {
                        allErrors.push(...response.errors);
                    }
                } catch (err) {
                    allErrors.push(`Lote ${idx + 1}: ${err.response?.data?.message || 'Erro de comunicação no lote.'}`);
                }
            }
        }

        // Invalida e atualiza as listagens se houver ao menos um sucesso
        if (keySuccess || totalImportedCount > 0) {
            if (totalImportedCount > 0) {
                toast.success(`Importação em lote concluída! ${totalImportedCount} de ${files.length} ordem(ns) criada(s).`);
            }
            queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
            queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
        }

        if (allErrors.length > 0) {
            toast.warning(`Atenção:`, {
                description: allErrors.slice(0, 1)
            });
        }

        resetAndClose();
    };

    const cleanKeyLength = accessKey.trim().length;
    const canSubmit = !isProcessingBatch && (cleanKeyLength === 44 || files.length > 0);

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!isProcessingBatch) onOpenChange(v); }}>
            <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl rounded-2xl">
                {/* CABEÇALHO FIXO */}
                <DialogHeader className="p-5 pb-3 border-b border-slate-100 shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg font-bold">
                        <FileCode2 className="text-emerald-600" size={22} /> Importar NF-e de Recebimento
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Consulte uma NF-e por Chave de Acesso na SEFAZ ou faça upload de arquivos XML (processados em lotes de 5).
                    </DialogDescription>
                </DialogHeader>

                {/* CORPO CENTRAL SCROLLÁVEL */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">

                    {/* SEÇÃO 1: CHAVE DE ACESSO */}
                    <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
                        <label className="text-xs font-bold text-blue-900 uppercase flex items-center gap-1.5">
                            <KeyRound size={14} className="text-blue-600" /> Consulta Por Chave de Acesso SEFAZ
                        </label>
                        <Input
                            type="text"
                            maxLength={44}
                            placeholder="Digite ou bipe os 44 dígitos da Chave de Acesso..."
                            value={accessKey}
                            onChange={(e) => setAccessKey(e.target.value.replace(/\D/g, ''))}
                            disabled={isProcessingBatch}
                            className="bg-white font-mono text-xs h-10 border-blue-300 focus-visible:ring-blue-500"
                        />
                        <span className="text-[10px] text-slate-500 block">
                            {cleanKeyLength > 0 ? `${cleanKeyLength}/44 dígitos` : 'Download automático do XML com registro de Ciência da Operação.'}
                        </span>
                    </div>

                    {/* DIVISOR SUTIL */}
                    <div className="relative flex items-center justify-center my-2">
                        <div className="border-t border-slate-200 w-full" />
                        <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 absolute">
                            ou faça upload de arquivos .xml
                        </span>
                    </div>

                    {/* SEÇÃO 2: ARQUIVOS XML */}
                    <div className="space-y-3">
                        <label
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
                        >
                            <div className="flex flex-col items-center justify-center pt-3 pb-3 pointer-events-none">
                                <UploadCloud className={`w-7 h-7 mb-1 ${isDragging ? 'text-emerald-500' : 'text-slate-400'}`} />
                                <p className="text-xs font-medium text-slate-600">
                                    {isDragging ? 'Solte os arquivos aqui...' : 'Clique ou arraste arquivos .xml da NF-e'}
                                </p>
                            </div>
                            <input type="file" accept=".xml" multiple className="hidden" onChange={handleFileSelect} disabled={isProcessingBatch} />
                        </label>

                        {/* LISTA DE ARQUIVOS COM SCROLL INTERNO LIMITADO */}
                        {files.length > 0 && (
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                                <div className="flex items-center justify-between pb-1 px-1 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                                    <span>{files.length} arquivo(s) selecionado(s)</span>
                                    <button
                                        type="button"
                                        onClick={() => setFiles([])}
                                        disabled={isProcessingBatch}
                                        className="text-rose-600 hover:underline text-[10px]"
                                    >
                                        Limpar todos
                                    </button>
                                </div>
                                {files.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 px-2.5 py-1.5 rounded-md shadow-2xs">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <FileCode2 size={14} className="text-slate-400 shrink-0" />
                                            <span className="text-xs font-medium text-slate-700 truncate font-mono">{file.name}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(idx)}
                                            disabled={isProcessingBatch}
                                            className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1 rounded-md transition-colors shrink-0"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* BARRA DE PROGRESSO DE BATCHING */}
                    {isProcessingBatch && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                                <span className="flex items-center gap-1.5">
                                    <Layers size={14} className="animate-spin text-emerald-600" />
                                    Processando Lote {batchProgress.current} de {batchProgress.total || 1}...
                                </span>
                                <span className="font-mono">{batchProgress.processedFiles} / {batchProgress.totalFiles} Arquivos</span>
                            </div>
                            <div className="w-full bg-emerald-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="bg-emerald-600 h-full transition-all duration-300"
                                    style={{ width: `${batchProgress.totalFiles > 0 ? (batchProgress.processedFiles / batchProgress.totalFiles) * 100 : 100}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* RODAPÉ FIXO */}
                <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 flex items-center justify-between gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessingBatch} className="bg-white">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={!canSubmit}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold min-w-[150px] shadow-2xs"
                    >
                        {isProcessingBatch ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                            <ArrowRight className="h-4 w-4 mr-1.5" />
                        )}
                        {cleanKeyLength === 44 && files.length > 0
                            ? `Importar Chave + ${files.length} XML(s)`
                            : cleanKeyLength === 44
                                ? 'Consultar Chave SEFAZ'
                                : `Importar ${files.length} XML(s)`
                        }
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}