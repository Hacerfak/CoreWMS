import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Search, Plus, Building, MapPin, Loader2, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ClienteFormSheet from './ClienteFormSheet';

export default function ClientesList() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [selectedCliente, setSelectedCliente] = useState(null);
    const [clienteToDelete, setClienteToDelete] = useState(null);

    // Listagem de clientes
    const { data: clientes, isLoading } = useQuery({
        queryKey: ['clientes', search],
        queryFn: async () => {
            const { data } = await api.get('/api/customers', { params: { Search: search } });
            return data || [];
        }
    });

    // Mutação para Inativar/Excluir
    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            await api.delete(`/api/customers/${id}`);
        },
        onSuccess: () => {
            toast.success('Cliente inativado com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
            setClienteToDelete(null);
        },
        onError: (err) => {
            toast.error(err.response?.data?.message || 'Erro ao inativar cliente.');
        }
    });

    const handleCreate = () => {
        setSelectedCliente(null);
        setIsSheetOpen(true);
    };

    const handleEdit = (cliente) => {
        setSelectedCliente(cliente);
        setIsSheetOpen(true);
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clientes</h1>
                    <p className="text-sm text-slate-500 mt-1">Gerencie os depositantes e parceiros de negócio.</p>
                </div>
                <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                    <Plus className="mr-2 h-4 w-4" /> Novo Cliente
                </Button>
            </div>

            {/* Tabela de Dados */}
            <div className="bg-white border border-slate-200/60 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por Razão Social ou CNPJ..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-slate-50 border-slate-200"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-sm z-10">
                            <TableRow>
                                <TableHead className="w-[350px]">Razão Social</TableHead>
                                <TableHead>CNPJ</TableHead>
                                <TableHead>Localização</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : clientes?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                                        Nenhum cliente encontrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                clientes?.map((cliente) => (
                                    <TableRow key={cliente.id} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                                                    <Building size={16} />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-900 truncate max-w-[260px]">{cliente.corporateName}</p>
                                                    <p className="text-xs text-slate-500 truncate max-w-[260px]">{cliente.tradeName || 'Sem nome fantasia'}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm text-slate-600">
                                            {cliente.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                                <MapPin size={14} className="text-slate-400" />
                                                {cliente.cityName} - {cliente.state}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
                                                Ativo
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <Button variant="ghost" size="sm" onClick={() => handleEdit(cliente)} className="text-blue-600 hover:bg-blue-50">
                                                <Edit className="h-4 w-4 mr-1" /> Editar
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => setClienteToDelete(cliente)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                                                <Trash2 className="h-4 w-4 mr-1" /> Excluir
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Sheet de Criação e Edição */}
            <ClienteFormSheet
                open={isSheetOpen}
                onOpenChange={setIsSheetOpen}
                clienteToEdit={selectedCliente}
            />

            {/* Modal de Confirmação de Exclusão */}
            <AlertDialog open={!!clienteToDelete} onOpenChange={(open) => !open && setClienteToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900">Inativar Cliente Depositante?</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-500">
                            Tem certeza que deseja inativar o cliente <strong className="text-slate-800">{clienteToDelete?.corporateName}</strong>? Ele não aparecerá mais nas operações ativas do WMS.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteMutation.mutate(clienteToDelete.id)}
                            disabled={deleteMutation.isPending}
                            className="bg-rose-600 hover:bg-rose-700 text-white"
                        >
                            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Inativação'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}