import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiInboundReview } from '@/api/generated/inbound/inbound';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Link as LinkIcon, FileQuestion } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import LinkProductModal from './LinkProductModal';

export default function ReviewInbound() {
    const navigate = useNavigate();
    const { id: filterOrderId } = useParams(); // Permite filtrar por uma ordem específica se vier da rota /inbound/revisao/:id
    const [selectedItem, setSelectedItem] = useState(null);

    const { data: pendingItems = [], isLoading } = useGetApiInboundReview();

    // Se a rota possuir um ID de ordem, filtra apenas os itens daquela Nota Fiscal
    const filteredItems = filterOrderId
        ? pendingItems.filter(i => i.inboundOrderId === filterOrderId)
        : pendingItems;

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/inbound')} className="shrink-0 text-slate-500 hover:text-slate-900">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Revisão de Produtos (XML)</h1>
                    <p className="text-sm text-slate-500 mt-1">Vincule os produtos desconhecidos da NF-e ao catálogo do WMS ou crie um novo SKU rápido.</p>
                </div>
            </div>

            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                        <FileQuestion className="text-amber-600" size={16} /> Itens Sem Vínculo ({filteredItems.length})
                    </h3>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[120px]">Linha / NF-e</TableHead>
                                <TableHead>Dados do Fornecedor (XML)</TableHead>
                                <TableHead>Qtd. Esperada</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : filteredItems.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-32 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-500">
                                            <FileQuestion className="w-12 h-12 mb-3 text-slate-300" />
                                            <p className="font-medium text-slate-900">Tudo verificado!</p>
                                            <p className="text-sm">Não há produtos pendentes de cadastro ou revisão nesta ordem.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredItems.map((item) => (
                                <TableRow key={item.itemId} className="hover:bg-slate-50/50">
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-900">Linha {item.lineNumber}</span>
                                            <span className="text-[10px] font-mono text-slate-500 truncate w-24" title={item.accessKey}>
                                                NF {item.accessKey ? item.accessKey.substring(25, 34) : 'N/A'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col space-y-1">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="bg-slate-100 text-slate-700 font-mono text-[10px]">
                                                    SKU: {item.rawSkuCode}
                                                </Badge>
                                                {item.rawBarcode && (
                                                    <Badge variant="outline" className="text-slate-600 font-mono text-[10px]">
                                                        EAN: {item.rawBarcode}
                                                    </Badge>
                                                )}
                                            </div>
                                            <span className="text-sm font-medium text-slate-800">{item.rawDescription}</span>
                                            <span className="text-[10px] text-slate-500">{item.issuerName}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900">{item.expectedQuantity} un</span>
                                            {item.expectedBatch && <span className="text-[10px] text-slate-500 font-mono">Lote: {item.expectedBatch}</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" onClick={() => setSelectedItem(item)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                                            <LinkIcon className="h-4 w-4 mr-2" /> Tratar / Vincular
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {selectedItem && (
                <LinkProductModal
                    open={!!selectedItem}
                    onOpenChange={(v) => !v && setSelectedItem(null)}
                    item={selectedItem}
                />
            )}
        </div>
    );
}