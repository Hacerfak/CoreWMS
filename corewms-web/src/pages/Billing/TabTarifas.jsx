import { useState, useMemo } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Trash2, Loader2, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const formatDatePtBr = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

export default function TabTarifas({ tariffs, isLoading, reload }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [tariffToDelete, setTariffToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const filteredTariffs = useMemo(() => {
        if (!searchTerm.trim()) return tariffs;
        const term = searchTerm.toLowerCase();
        return tariffs.filter(t =>
            t.customerName?.toLowerCase().includes(term) ||
            t.serviceName?.toLowerCase().includes(term)
        );
    }, [tariffs, searchTerm]);

    const handleConfirmDelete = async () => {
        if (!tariffToDelete) return;
        try {
            setIsDeleting(true);
            await customInstance({ url: `/api/billing/tariffs/${tariffToDelete.id}`, method: 'DELETE' });
            toast.success('Tarifa contratual removida com sucesso!');
            setTariffToDelete(null);
            reload();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao remover tarifa.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-3">
            {/* BARRA DE PESQUISA INTERNA */}
            <div className="flex items-center justify-between gap-4 bg-white p-3 border border-slate-200/80 rounded-xl shadow-2xs">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <Input
                        placeholder="Buscar por depositante ou serviço..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-8 text-xs bg-slate-50 border-slate-200"
                    />
                </div>
                <span className="text-xs text-slate-400 font-mono">
                    {filteredTariffs.length} tarifa(s) listada(s)
                </span>
            </div>

            {/* TABELA DE TARIFAS */}
            <Card className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead>Depositante</TableHead>
                            <TableHead>Serviço Vinculado</TableHead>
                            <TableHead>Início Vigência</TableHead>
                            <TableHead className="text-right">Tarifa Contratual (R$)</TableHead>
                            <TableHead className="text-right w-20">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-28 text-center text-xs text-slate-500">
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-emerald-600" />
                                </TableCell>
                            </TableRow>
                        ) : filteredTariffs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-28 text-center text-xs text-slate-400 italic">
                                    Nenhuma tarifa encontrada para o critério informado.
                                </TableCell>
                            </TableRow>
                        ) : filteredTariffs.map(t => (
                            <TableRow key={t.id} className="hover:bg-slate-50/50">
                                <TableCell className="font-bold text-slate-900 text-xs">{t.customerName}</TableCell>
                                <TableCell className="text-xs text-slate-700 font-medium">
                                    <span className="font-semibold text-slate-800">{t.serviceName}</span>
                                </TableCell>
                                <TableCell className="text-xs font-mono text-slate-700">
                                    {formatDatePtBr(t.validFrom)}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-emerald-700 text-sm">
                                    R$ {t.unitValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 10 })}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setTariffToDelete(t)}
                                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 h-8 w-8 p-0"
                                        title="Excluir Tarifa"
                                    >
                                        <Trash2 size={14} />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>

            {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO (PADRÃO DO SISTEMA) */}
            <Dialog open={!!tariffToDelete} onOpenChange={(open) => !open && setTariffToDelete(null)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-600 text-base">
                            <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão de Tarifa
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Tem certeza de que deseja remover esta regra tarifária contratual? Esta ação não poderá ser desfeita.
                        </DialogDescription>
                    </DialogHeader>

                    {tariffToDelete && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1.5 font-sans">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Depositante:</span>
                                <strong className="text-slate-800">{tariffToDelete.customerName}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Serviço:</span>
                                <strong className="text-slate-800">{tariffToDelete.serviceName}</strong>
                            </div>
                            <div className="flex justify-between border-t border-slate-200/60 pt-1">
                                <span className="text-slate-500">Valor Cadastrado:</span>
                                <strong className="font-mono text-emerald-700">
                                    R$ {tariffToDelete.unitValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 10 })}
                                </strong>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTariffToDelete(null)}
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
                            Excluir Tarifa
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}