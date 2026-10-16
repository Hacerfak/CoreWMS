import { useState, useMemo } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Edit3, Trash2, Loader2, Search, AlertTriangle, Code2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TabServicos({ services, isLoading, onEdit, reload }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [serviceToDelete, setServiceToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const filteredServices = useMemo(() => {
        if (!searchTerm.trim()) return services;
        const term = searchTerm.toLowerCase();
        return services.filter(s =>
            s.name?.toLowerCase().includes(term) ||
            s.sqlTemplate?.toLowerCase().includes(term)
        );
    }, [services, searchTerm]);

    const handleConfirmDelete = async () => {
        if (!serviceToDelete) return;
        try {
            setIsDeleting(true);
            await customInstance({ url: `/api/billing/services/${serviceToDelete.id}`, method: 'DELETE' });
            toast.success('Serviço logístico excluído com sucesso!');
            setServiceToDelete(null);
            reload();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir serviço.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-3">
            {/* BARRA DE PESQUISA */}
            <div className="flex items-center justify-between gap-4 bg-white p-3 border border-slate-200/80 rounded-xl shadow-2xs">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <Input
                        placeholder="Buscar por nome ou consulta SQL..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-8 text-xs bg-slate-50 border-slate-200"
                    />
                </div>
                <span className="text-xs text-slate-400 font-mono">
                    {filteredServices.length} serviço(s) cadastrado(s)
                </span>
            </div>

            {/* TABELA DE SERVIÇOS */}
            <Card className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead>Nome do Serviço</TableHead>
                            <TableHead>Modalidade de Apuração</TableHead>
                            <TableHead>Modelo SQL de Cobrança</TableHead>
                            <TableHead className="text-right w-24">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-28 text-center text-xs text-slate-500">
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-purple-600" />
                                </TableCell>
                            </TableRow>
                        ) : filteredServices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-28 text-center text-xs text-slate-400 italic">
                                    Nenhum serviço logístico cadastrado.
                                </TableCell>
                            </TableRow>
                        ) : filteredServices.map(s => {
                            const isAutoDaily = s.type === 'Automatic_Daily' || s.type === 'Automatic_SQL' || s.type === 1;

                            return (
                                <TableRow key={s.id} className="hover:bg-slate-50/50">
                                    <TableCell className="font-bold text-slate-900 text-xs">{s.name}</TableCell>
                                    <TableCell>
                                        <Badge className={`text-[10px] font-semibold border ${isAutoDaily
                                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                                            : 'bg-blue-50 text-blue-800 border-blue-200'
                                            }`}>
                                            {isAutoDaily ? '⚡ Diário (Rotina Noturna)' : '📦 Operacional (Evento)'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-[11px] text-slate-600 max-w-lg truncate">
                                        {s.sqlTemplate ? (
                                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                                                {s.sqlTemplate.replace(/\s+/g, ' ')}
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 italic">Sem query vinculada (Lançamento Direto)</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onEdit(s)}
                                                className="text-blue-600 hover:bg-blue-50 h-8 w-8 p-0"
                                                title="Editar"
                                            >
                                                <Edit3 size={14} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setServiceToDelete(s)}
                                                className="text-rose-500 hover:bg-rose-50 h-8 w-8 p-0"
                                                title="Excluir"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Card>

            {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
            <Dialog open={!!serviceToDelete} onOpenChange={(open) => !open && setServiceToDelete(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-600 text-base">
                            <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão de Serviço
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            A exclusão será bloqueada pelo sistema caso o serviço possua tarifas ativas vinculadas a depositantes.
                        </DialogDescription>
                    </DialogHeader>

                    {serviceToDelete && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1.5 font-sans">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Serviço:</span>
                                <strong className="text-slate-800">{serviceToDelete.name}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Modalidade:</span>
                                <span className="font-semibold text-slate-700">
                                    {serviceToDelete.type === 'Automatic_Daily' || serviceToDelete.type === 1 ? 'Diário Automático' : 'Operacional por Evento'}
                                </span>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setServiceToDelete(null)}
                            disabled={isDeleting}
                            className="h-9"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold h-9"
                        >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                            Excluir Serviço
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}