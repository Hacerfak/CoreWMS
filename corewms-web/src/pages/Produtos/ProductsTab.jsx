import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiProducts, useDeleteApiProductsId } from '@/api/generated/products/products';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Edit, Trash2, Package, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ProductFormSheet from './ProductFormSheet';

export default function ProductsTab() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [productToDelete, setProductToDelete] = useState(null);

    const { data: products = [], isLoading } = useGetApiProducts({ Search: search });

    const { mutate: deleteProduct, isPending: isDeleting } = useDeleteApiProductsId({
        mutation: {
            onSuccess: () => {
                toast.success('Produto excluído com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/products'] });
                setProductToDelete(null);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao excluir produto.')
        }
    });

    const handleCreate = () => { setSelectedProduct(null); setIsSheetOpen(true); };
    const handleEdit = (product) => { setSelectedProduct(product); setIsSheetOpen(true); };

    return (
        <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex flex-col overflow-hidden h-full">
            <div className="p-4 border-b border-slate-100 flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input placeholder="Buscar por SKU, EAN ou Descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-slate-50" />
                </div>
                <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white ml-auto">
                    <Plus className="mr-2 h-4 w-4" /> Novo Produto
                </Button>
            </div>

            <div className="flex-1 overflow-auto">
                <Table>
                    <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
                        <TableRow>
                            <TableHead>SKU / Descrição</TableHead>
                            <TableHead>Depositante</TableHead>
                            <TableHead>Volumes Associados</TableHead>
                            <TableHead>Regras</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" /></TableCell></TableRow>
                        ) : products.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="h-24 text-center text-slate-500">Nenhum produto encontrado.</TableCell></TableRow>
                        ) : products.map((prod) => (
                            <TableRow key={prod.id} className="hover:bg-slate-50/50">
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center"><Package size={16} /></div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900 font-mono">{prod.sku}</span>
                                            <span className="text-xs text-slate-500 truncate max-w-[200px]">{prod.description}</span>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-sm font-medium text-slate-700">{prod.customerName}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {prod.packagings?.map(pack => (
                                            <Badge key={pack.id} variant="outline" className="text-[10px] bg-slate-50 font-mono">
                                                {pack.packagingTypeCode} ({pack.conversionFactor}{prod.baseUnit})
                                            </Badge>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-1 flex-wrap max-w-[200px]">
                                        {prod.requireBatchControl && <Badge variant="secondary" className="text-[10px]">Lote</Badge>}
                                        {prod.requireExpirationDate && <Badge variant="secondary" className="text-[10px]">Validade</Badge>}
                                        {prod.requireSerialControl && <Badge variant="secondary" className="text-[10px]">Série</Badge>}
                                        <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700 bg-blue-50">
                                            {prod.pickingStrategy === 1 ? 'FIFO' : prod.pickingStrategy === 2 ? 'FEFO' : 'LIFO'}
                                        </Badge>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right space-x-1">
                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(prod)} className="text-blue-600 hover:bg-blue-50"><Edit className="h-4 w-4" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => setProductToDelete(prod)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <ProductFormSheet open={isSheetOpen} onOpenChange={setIsSheetOpen} productToEdit={selectedProduct} />

            <AlertDialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Produto?</AlertDialogTitle>
                        <AlertDialogDescription>Confirma a exclusão de <strong>{productToDelete?.sku}</strong> e todas as embalagens associadas? Esta ação falhará se houver estoque.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteProduct({ id: productToDelete.id })} disabled={isDeleting} className="bg-rose-600 text-white hover:bg-rose-700">Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}