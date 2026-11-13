import { useState, useEffect, useMemo } from 'react';
import { customInstance } from '@/api/orval-mutator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
    Plus, Search, Pencil, Trash2, Loader2, Tag,
    CheckCircle2, Ban, RefreshCw, Power
} from 'lucide-react';
import { toast } from 'sonner';

export default function QualityReasonsTab({ onReasonsChanged }) {
    const [reasons, setReasons] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ACTIVE, INACTIVE

    // Modal Criar / Editar
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingReason, setEditingReason] = useState(null);
    const [codeInput, setCodeInput] = useState('');
    const [descriptionInput, setDescriptionInput] = useState('');
    const [isActiveInput, setIsActiveInput] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Modal Excluir
    const [reasonToDelete, setReasonToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadReasons = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/quality/reasons', method: 'GET' });
            setReasons(Array.isArray(res) ? res : (res?.items || []));
        } catch {
            toast.error('Erro ao carregar motivos de qualidade.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadReasons();
    }, []);

    const filteredReasons = useMemo(() => {
        return reasons.filter((r) => {
            if (statusFilter === 'ACTIVE' && !r.isActive) return false;
            if (statusFilter === 'INACTIVE' && r.isActive) return false;

            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (
                r.code?.toLowerCase().includes(term) ||
                r.description?.toLowerCase().includes(term)
            );
        });
    }, [reasons, searchTerm, statusFilter]);

    const openCreateModal = () => {
        setEditingReason(null);
        setCodeInput('');
        setDescriptionInput('');
        setIsActiveInput(true);
        setIsFormModalOpen(true);
    };

    const openEditModal = (reason) => {
        setEditingReason(reason);
        setCodeInput(reason.code || '');
        setDescriptionInput(reason.description || '');
        setIsActiveInput(Boolean(reason.isActive));
        setIsFormModalOpen(true);
    };

    const handleSaveReason = async (e) => {
        e.preventDefault();
        const cleanCode = codeInput.trim().toUpperCase();
        const cleanDesc = descriptionInput.trim();

        if (!cleanCode) return toast.warning('Informe o código do motivo.');
        if (!cleanDesc) return toast.warning('Informe a descrição do motivo.');

        setIsSaving(true);
        try {
            if (editingReason) {
                await customInstance({
                    url: `/api/quality/reasons/${editingReason.id}`,
                    method: 'PUT',
                    data: {
                        id: editingReason.id,
                        code: cleanCode,
                        description: cleanDesc,
                        isActive: isActiveInput
                    }
                });
                toast.success('Motivo atualizado com sucesso!');
            } else {
                await customInstance({
                    url: '/api/quality/reasons',
                    method: 'POST',
                    data: {
                        code: cleanCode,
                        description: cleanDesc
                    }
                });
                toast.success('Motivo cadastrado com sucesso!');
            }

            setIsFormModalOpen(false);
            setEditingReason(null);
            await loadReasons();
            onReasonsChanged?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao salvar motivo de qualidade.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (reason) => {
        try {
            const res = await customInstance({
                url: `/api/quality/reasons/${reason.id}/toggle-active`,
                method: 'PATCH'
            });
            toast.success(res?.message || 'Status do motivo atualizado.');
            await loadReasons();
            onReasonsChanged?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao alterar status do motivo.');
        }
    };

    const handleConfirmDelete = async () => {
        if (!reasonToDelete) return;
        setIsDeleting(true);
        try {
            const res = await customInstance({
                url: `/api/quality/reasons/${reasonToDelete.id}`,
                method: 'DELETE'
            });
            toast.success(res?.message || 'Motivo excluído com sucesso.');
            setReasonToDelete(null);
            await loadReasons();
            onReasonsChanged?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Não foi possível excluir este motivo.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden space-y-0">
            {/* BARRA SUPERIOR DE FILTROS E AÇÃO */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar motivo por código ou descrição..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-white border-slate-200 h-9 text-xs"
                        />
                    </div>

                    <div className="w-[170px]">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="bg-white border-slate-200 h-9 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todos os Status</SelectItem>
                                <SelectItem value="ACTIVE">Somente Ativos</SelectItem>
                                <SelectItem value="INACTIVE">Somente Inativos</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={loadReasons}
                        className="bg-white border-slate-200 text-slate-700 h-9 text-xs"
                    >
                        <RefreshCw size={14} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                    <Button
                        type="button"
                        onClick={openCreateModal}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-9 text-xs shadow-2xs"
                    >
                        <Plus size={15} className="mr-1.5" /> Novo Motivo
                    </Button>
                </div>
            </div>

            {/* TABELA DE MOTIVOS */}
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader className="bg-slate-50/80">
                        <TableRow>
                            <TableHead className="w-[180px]">Código</TableHead>
                            <TableHead>Descrição Padronizada</TableHead>
                            <TableHead className="w-[130px]">Status</TableHead>
                            <TableHead className="w-[160px] text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-amber-600 mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : filteredReasons.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center text-xs text-slate-500 italic">
                                    Nenhum motivo de qualidade encontrado. Clique em "Novo Motivo" para cadastrar.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredReasons.map((reason) => (
                                <TableRow
                                    key={reason.id}
                                    className={`hover:bg-slate-50/60 transition-colors ${!reason.isActive ? 'opacity-65 bg-slate-50/30' : ''}`}
                                >
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className="font-mono font-bold text-xs bg-slate-50 text-slate-900 border-slate-300 gap-1"
                                        >
                                            <Tag size={11} className="text-amber-600" />
                                            {reason.code}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs font-medium text-slate-800">
                                        {reason.description}
                                    </TableCell>
                                    <TableCell>
                                        {reason.isActive ? (
                                            <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] gap-1">
                                                <CheckCircle2 size={11} /> Ativo
                                            </Badge>
                                        ) : (
                                            <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] gap-1">
                                                <Ban size={11} /> Inativo
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleToggleActive(reason)}
                                                className={`h-8 w-8 p-0 ${reason.isActive
                                                    ? 'text-amber-600 hover:bg-amber-50'
                                                    : 'text-emerald-600 hover:bg-emerald-50'
                                                    }`}
                                                title={reason.isActive ? 'Inativar motivo' : 'Ativar motivo'}
                                            >
                                                <Power size={14} />
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openEditModal(reason)}
                                                className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                                                title="Editar motivo"
                                            >
                                                <Pencil size={14} />
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setReasonToDelete(reason)}
                                                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                title="Excluir motivo"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {filteredReasons.length > 0 && (
                <div className="p-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
                    <span>Total de {filteredReasons.length} motivo(s) exibido(s)</span>
                    <span className="text-[11px] text-slate-400">
                        Motivos utilizados em prontuários só podem ser inativados (não excluídos).
                    </span>
                </div>
            )}

            {/* MODAL CRIAR / EDITAR MOTIVO */}
            <Dialog open={isFormModalOpen} onOpenChange={(v) => !isSaving && setIsFormModalOpen(v)}>
                <DialogContent className="sm:max-w-md bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <Tag className="text-amber-600" size={19} />
                            {editingReason ? 'Editar Motivo de Qualidade' : 'Novo Motivo de Qualidade'}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Defina um código curto e uma descrição clara para padronizar bloqueios e liberações técnicas no coletor e na web.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveReason} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">Código Padronizado *</Label>
                            <Input
                                value={codeInput}
                                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                                maxLength={20}
                                placeholder="Ex: AVARIA-EMB, UMIDADE, LAUDO-OK..."
                                className="font-mono text-xs uppercase bg-white h-9"
                                autoFocus
                            />
                            <span className="text-[10px] text-slate-400 block">Máximo de 20 caracteres.</span>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">Descrição Completa *</Label>
                            <Input
                                value={descriptionInput}
                                onChange={(e) => setDescriptionInput(e.target.value)}
                                maxLength={150}
                                placeholder="Ex: Embalagem externa amassada ou violada no transporte"
                                className="text-xs bg-white h-9"
                            />
                        </div>

                        {editingReason && (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-bold text-slate-900">Motivo Ativo</Label>
                                    <p className="text-[11px] text-slate-500">
                                        Motivos inativos não aparecem para novos apontamentos.
                                    </p>
                                </div>
                                <Switch checked={isActiveInput} onCheckedChange={setIsActiveInput} />
                            </div>
                        )}

                        <DialogFooter className="pt-2 border-t">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsFormModalOpen(false)}
                                disabled={isSaving}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSaving || !codeInput.trim() || !descriptionInput.trim()}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
                            >
                                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                                {editingReason ? 'Salvar Alterações' : 'Cadastrar Motivo'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* CONFIRMAÇÃO EXCLUSÃO DE MOTIVO */}
            <AlertDialog open={Boolean(reasonToDelete)} onOpenChange={(v) => !isDeleting && !v && setReasonToDelete(null)}>
                <AlertDialogContent className="bg-white sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 flex items-center gap-2">
                            <Trash2 className="text-rose-600" size={19} /> Excluir Motivo de Qualidade?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-600">
                            Deseja excluir definitivamente o motivo{' '}
                            <strong className="font-mono text-slate-900">{reasonToDelete?.code}</strong> ({reasonToDelete?.description})?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                            {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                            Sim, Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}