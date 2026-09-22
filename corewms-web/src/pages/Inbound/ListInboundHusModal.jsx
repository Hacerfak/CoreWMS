import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiInventoryHandlingUnits } from '@/api/generated/inventory/inventory';
import { customInstance } from '@/api/orval-mutator';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Printer, Layers, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import PrintHuModal from './PrintHuModal';

export default function ListInboundHusModal({ open, onOpenChange, orderData }) {
    const queryClient = useQueryClient();
    const [selectedHus, setSelectedHus] = useState([]);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    const [husToRollback, setHusToRollback] = useState(null);
    const [isRollingBack, setIsRollingBack] = useState(false);

    // Desestruturamos refetch para atualizar a lista instantaneamente
    const { data: apiResponse, isLoading, refetch } = useGetApiInventoryHandlingUnits(
        { CustomerId: orderData?.customerId, PageSize: 100 },
        { query: { enabled: open && !!orderData?.customerId } }
    );

    const allHus = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);

    const filteredHus = allHus.filter(h =>
        !h.receiptDocumentId || !orderData?.id ||
        String(h.receiptDocumentId).toLowerCase() === String(orderData.id).toLowerCase()
    );

    const orderHus = filteredHus.length > 0 ? filteredHus : allHus;

    const toggleSelectAll = () => {
        if (selectedHus.length === orderHus.length) {
            setSelectedHus([]);
        } else {
            setSelectedHus(orderHus);
        }
    };

    const toggleSelectHu = (hu) => {
        setSelectedHus(prev =>
            prev.some(h => h.id === hu.id) ? prev.filter(h => h.id !== hu.id) : [...prev, hu]
        );
    };

    const handleConfirmRollback = async () => {
        if (!husToRollback || husToRollback.length === 0) return;

        setIsRollingBack(true);
        try {
            const huIds = husToRollback.map(h => h.id);

            await customInstance({
                url: '/api/inbound/receive/hus/rollback',
                method: 'POST',
                data: { handlingUnitIds: huIds }
            });

            toast.success(`${huIds.length} HU(s) estornada(s) com sucesso!`);

            // Recarrega a consulta atual do modal imediatamente
            await refetch();

            // Invalida requisições da página pai para atualizar as barras de progresso
            queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderData?.id}`] });
            queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });

            setSelectedHus(prev => prev.filter(h => !huIds.includes(h.id)));
            setHusToRollback(null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao realizar o estorno das HUs.');
        } finally {
            setIsRollingBack(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl bg-white p-0 overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Layers className="text-blue-600" size={20} /> HUs Geradas na NF {orderData?.documentNumber || orderData?.accessKey?.substring(25, 34)}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Lista de volumes/pallets descarregados e gravados no banco de dados.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex gap-2">
                        <Button
                            onClick={() => setHusToRollback(selectedHus)}
                            disabled={selectedHus.length === 0}
                            variant="outline"
                            className="border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 shadow-xs"
                        >
                            <Undo2 className="w-4 h-4 mr-2 text-rose-600" /> Estornar Selecionadas ({selectedHus.length})
                        </Button>

                        <Button
                            onClick={() => setIsPrintModalOpen(true)}
                            disabled={selectedHus.length === 0}
                            className="bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                        >
                            <Printer className="w-4 h-4 mr-2" /> Reimprimir Selecionadas ({selectedHus.length})
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                            <TableRow>
                                <TableHead className="w-[40px]">
                                    <Checkbox
                                        checked={orderHus.length > 0 && selectedHus.length === orderHus.length}
                                        onCheckedChange={toggleSelectAll}
                                    />
                                </TableHead>
                                <TableHead>LPN / Código HU</TableHead>
                                <TableHead>SKU / Produto</TableHead>
                                <TableHead>Qtd / Unidade</TableHead>
                                <TableHead>Lote Físico</TableHead>
                                <TableHead>Posição Atual</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                            ) : orderHus.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center text-slate-500">Nenhuma HU gravada até o momento nesta ordem.</TableCell></TableRow>
                            ) : (
                                orderHus.map((hu) => {
                                    const isSelected = selectedHus.some(h => h.id === hu.id);

                                    return (
                                        <TableRow key={hu.id} className={isSelected ? 'bg-blue-50/40' : ''}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() => toggleSelectHu(hu)}
                                                />
                                            </TableCell>
                                            <TableCell className="font-mono font-bold text-slate-900">
                                                {hu.lpn}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-800">{hu.productSku || hu.sku}</span>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{hu.productDescription || hu.description || 'Produto'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono font-bold text-blue-700">
                                                {hu.currentQuantity ?? hu.initialQuantity} {hu.unit || 'UN'}
                                            </TableCell>
                                            <TableCell className="font-mono text-slate-600">
                                                {hu.batch || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="bg-slate-50 font-mono text-[10px]">
                                                    {hu.locationPath || 'DOCA'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    title="Reimprimir Etiqueta"
                                                    onClick={() => {
                                                        setSelectedHus([hu]);
                                                        setIsPrintModalOpen(true);
                                                    }}
                                                    className="text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                                                >
                                                    <Printer size={14} />
                                                </Button>

                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    title="Estornar esta HU"
                                                    onClick={() => setHusToRollback([hu])}
                                                    className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                >
                                                    <Undo2 size={14} />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </DialogContent>

            <AlertDialog open={!!husToRollback && husToRollback.length > 0} onOpenChange={(open) => !open && !isRollingBack && setHusToRollback(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Estornar {husToRollback?.length === 1 ? `HU ${husToRollback[0]?.lpn}` : `${husToRollback?.length} HU(s) selecionadas`}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja estornar a entrada deste(s) volume(s)? A quantidade recebida da NF-e e os saldos em estoque serão reajustados e as HUs serão removidas do sistema.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRollingBack}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmRollback}
                            disabled={isRollingBack}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                        >
                            {isRollingBack ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Estorno'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {isPrintModalOpen && (
                <PrintHuModal
                    open={isPrintModalOpen}
                    onOpenChange={setIsPrintModalOpen}
                    husToPrint={selectedHus}
                    orderData={orderData}
                />
            )}
        </Dialog>
    );
}