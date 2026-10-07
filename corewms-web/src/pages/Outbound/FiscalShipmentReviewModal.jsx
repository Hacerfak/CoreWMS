import { useState, useEffect } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileCode, CheckCircle2, ShieldAlert, Sparkles, Truck } from 'lucide-react';
import { toast } from 'sonner';

export default function FiscalShipmentReviewModal({ open, onOpenChange, orderId, onSuccess }) {
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState(null);

    // Formulário de Ajustes Fiscais
    const [naturezaOp, setNaturezaOp] = useState('');
    const [indFinal, setIndFinal] = useState('0');
    const [indPres, setIndPres] = useState('9');
    const [additionalNotes, setAdditionalNotes] = useState('');

    useEffect(() => {
        if (open && orderId) {
            setIsLoading(true);
            customInstance({
                url: `/api/outbound/orders/${orderId}/fiscal-preview`,
                method: 'GET'
            })
                .then(res => {
                    setPreviewData(res);
                    setNaturezaOp(res.defaultNaturezaOperacao || 'RETORNO DE ARMAZEM GERAL');
                    setIndFinal(res.defaultIndFinal?.toString() || '0');
                    setIndPres(res.defaultIndPres?.toString() || '9');
                    setAdditionalNotes(res.additionalNotes || '');
                })
                .catch(() => toast.error('Erro ao carregar pré-visualização fiscal.'))
                .finally(() => setIsLoading(false));
        }
    }, [open, orderId]);

    const handleConfirmShipment = async (e) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            const payload = {
                orderId,
                customNaturezaOperacao: naturezaOp,
                customIndFinal: Number(indFinal),
                customIndPres: Number(indPres),
                customAdditionalNotes: additionalNotes
            };

            const res = await customInstance({
                url: `/api/outbound/orders/${orderId}/ship`,
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || 'NF-e Autorizada e Pedido Expedido com Sucesso!');
            onOpenChange(false);
            if (onSuccess) onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao expedir e emitir NF-e.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl bg-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2 text-lg">
                        <FileCode className="text-orange-600" size={22} /> Espelho Fiscal & Revisão de Emissão de NF-e
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Confira os valores calculados, alíquotas e dados cadastrais antes do envio síncrono para a SEFAZ.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                        <p className="text-xs text-slate-500 font-medium">Calculando impostos e espelho do XML...</p>
                    </div>
                ) : (
                    <form onSubmit={handleConfirmShipment} className="space-y-5 py-2">
                        {/* RESUMO FISCAL */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                            <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Destinatário Final</span>
                                <strong className="text-slate-900 block truncate">{previewData?.destinationName}</strong>
                                <span className="text-slate-500 font-mono text-[10px]">UF: {previewData?.destinationState} ({previewData?.isInterstate ? 'Interestadual' : 'Interna'})</span>
                            </div>

                            <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Volume de Emissão</span>
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-mono mt-0.5">
                                    {previewData?.suggestedNfeCount} NF-e a ser gerada
                                </Badge>
                            </div>

                            <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Valor Total dos Produtos</span>
                                <strong className="text-emerald-700 font-mono text-sm block">
                                    {previewData?.totalProductsValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </strong>
                            </div>
                        </div>

                        {/* CONFIGURAÇÕES DE ENQUADRAMENTO FISCAL */}
                        <div className="space-y-3 p-4 border border-slate-200 rounded-xl bg-white shadow-2xs">
                            <Label className="text-xs font-bold text-slate-800 uppercase tracking-wider block border-b pb-2">
                                Parâmetros de Emissão SEFAZ
                            </Label>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-xs">Natureza da Operação (natOp) *</Label>
                                    <Input
                                        value={naturezaOp}
                                        onChange={(e) => setNaturezaOp(e.target.value)}
                                        className="text-xs bg-white h-9"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Consumidor Final (indFinal) *</Label>
                                    <Select value={indFinal} onValueChange={setIndFinal}>
                                        <SelectTrigger className="text-xs bg-white h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0">0 - Normal / Não Consumidor Final</SelectItem>
                                            <SelectItem value="1">1 - Consumidor Final</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">Observações Adicionais da NF-e (infCpl)</Label>
                                <Input
                                    value={additionalNotes}
                                    onChange={(e) => setAdditionalNotes(e.target.value)}
                                    placeholder="Ex: Ref. Ordem de Compra #1234. Isento de ICMS conforme Art..."
                                    className="text-xs bg-white h-9 font-mono"
                                />
                            </div>
                        </div>

                        {/* TABELA DE ITENS COM CFOP E VALORES */}
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                                Espelho dos Itens e CFOPs
                            </Label>
                            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[180px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50 sticky top-0">
                                        <TableRow>
                                            <TableHead>SKU / Descrição</TableHead>
                                            <TableHead className="text-center">CFOP</TableHead>
                                            <TableHead className="text-center">CST/CSOSN</TableHead>
                                            <TableHead className="text-right">Qtd</TableHead>
                                            <TableHead className="text-right">Total (R$)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewData?.items?.map((item, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell>
                                                    <span className="font-mono font-bold text-xs text-slate-900 block">{item.skuCode}</span>
                                                    <span className="text-[11px] text-slate-500">{item.description}</span>
                                                </TableCell>
                                                <TableCell className="text-center font-mono font-bold text-xs text-purple-700">{item.cfop}</TableCell>
                                                <TableCell className="text-center font-mono text-xs">{item.cstCsosn}</TableCell>
                                                <TableCell className="text-right font-mono text-xs">{item.quantity} {item.unit}</TableCell>
                                                <TableCell className="text-right font-mono font-bold text-xs text-slate-900">
                                                    {item.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        {/* DOCUMENTOS REFERENCIADOS (NFref) */}
                        {previewData?.referencedAccessKeys?.length > 0 && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs">
                                <span className="font-bold text-amber-900 block flex items-center gap-1">
                                    <ShieldAlert size={14} /> NF-es de Entrada Referenciadas ({previewData.referencedAccessKeys.length}):
                                </span>
                                <div className="space-y-0.5 font-mono text-[10px] text-amber-800">
                                    {previewData.referencedAccessKeys.map((key, i) => (
                                        <div key={i} className="truncate">• {key}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <DialogFooter className="pt-3 border-t">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5">
                                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Assinar, Emitir & Expedir na SEFAZ
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}