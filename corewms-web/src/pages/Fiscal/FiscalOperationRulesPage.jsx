import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customInstance } from '@/api/orval-mutator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
    Plus, Pencil, Trash2, Search, Filter, FileCode, ChevronDown, ChevronRight, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function FiscalOperationRulesPage() {
    const navigate = useNavigate();

    const [rules, setRules] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [expandedRuleIds, setExpandedRuleIds] = useState({});

    // Estados dos Alertas de Exclusão (shadcn/ui)
    const [ruleToDelete, setRuleToDelete] = useState(null);
    const [exceptionToDelete, setExceptionToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadRules = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/fiscal/rules', method: 'GET' });
            setRules(res?.data || res || []);
        } catch {
            toast.error('Erro ao carregar naturezas de operação fiscal.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadRules();
    }, []);

    const toggleExpand = (ruleId) => {
        setExpandedRuleIds(prev => ({ ...prev, [ruleId]: !prev[ruleId] }));
    };

    const handleConfirmDeleteException = async () => {
        if (!exceptionToDelete) return;
        try {
            setIsDeleting(true);
            await customInstance({
                url: `/api/fiscal/rules/${exceptionToDelete.ruleId}/exceptions/${exceptionToDelete.exceptionId}`,
                method: 'DELETE'
            });
            toast.success('Linha de exceção fiscal excluída com sucesso!');
            setExceptionToDelete(null);
            loadRules();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir exceção fiscal.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleActive = async (id) => {
        try {
            await customInstance({ url: `/api/fiscal/rules/${id}/toggle`, method: 'PATCH' });
            toast.success('Status da natureza atualizado!');
            loadRules();
        } catch {
            toast.error('Erro ao alterar status.');
        }
    };

    const handleConfirmDeleteRule = async () => {
        if (!ruleToDelete) return;
        try {
            setIsDeleting(true);
            await customInstance({ url: `/api/fiscal/rules/${ruleToDelete.id}`, method: 'DELETE' });
            toast.success('Natureza de Operação excluída com sucesso!');
            setRuleToDelete(null);
            loadRules();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao excluir natureza fiscal.');
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredRules = rules.filter(r =>
        r.description.toLowerCase().includes(search.toLowerCase()) ||
        r.cfopStateInternal.includes(search) ||
        r.cfopInterstate.includes(search)
    );

    const getFinalidadeBadge = (finalidade) => {
        switch (finalidade) {
            case 1: return <Badge className="bg-blue-100 text-blue-800">1 - Normal</Badge>;
            case 2: return <Badge className="bg-sky-100 text-sky-800">2 - Complementar</Badge>;
            case 3: return <Badge className="bg-amber-100 text-amber-800">3 - Ajuste</Badge>;
            case 4: return <Badge className="bg-purple-100 text-purple-800">4 - Devolução / Retorno</Badge>;
            case 5: return <Badge className="bg-emerald-100 text-emerald-800">5 - Crédito (RT)</Badge>;
            case 6: return <Badge className="bg-rose-100 text-rose-800">6 - Débito (RT)</Badge>;
            default: return <Badge variant="outline">Finalidade {finalidade}</Badge>;
        }
    };

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Naturezas de Operação & Regras Fiscais</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Configure a matriz tributária universal (CFOP, ICMS, ICMS-ST, IPI, PIS/COFINS, IBS/CBS) e as linhas de exceção.
                    </p>
                </div>
                <Button onClick={() => navigate('/fiscal/regras/nova')} className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-9">
                    <Plus className="mr-1.5 h-4 w-4" /> Nova Natureza de Operação
                </Button>
            </div>

            {/* TABELA PRINCIPAL */}
            <Card className="border-slate-200/80 bg-white shadow-xs">
                <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Buscar por descrição ou CFOP..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white text-xs h-9"
                        />
                    </div>
                    <Badge variant="secondary" className="font-mono">{filteredRules.length} Natureza(s)</Badge>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead>Descrição / Natureza</TableHead>
                                <TableHead className="text-center">Finalidade (finNFe)</TableHead>
                                <TableHead className="text-center">CFOP (Intra / Inter)</TableHead>
                                <TableHead className="text-center">Tributação Base (ICMS / IPI / PIS)</TableHead>
                                <TableHead className="text-center">Exceções</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-32 text-center">
                                        <div className="flex justify-center items-center gap-2 text-slate-500 text-xs">
                                            <Loader2 className="animate-spin h-4 w-4 text-orange-600" /> Carregando naturezas de operação...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredRules.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-28 text-center text-slate-400 italic">
                                        Nenhuma natureza de operação cadastrada.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredRules.map(rule => {
                                    const isExpanded = !!expandedRuleIds[rule.id];
                                    const excCount = rule.exceptions?.length || 0;

                                    return (
                                        <React.Fragment key={rule.id}>
                                            <TableRow className="hover:bg-slate-50/50">
                                                <TableCell className="text-center">
                                                    <Button variant="ghost" size="sm" onClick={() => toggleExpand(rule.id)} className="h-7 w-7 p-0">
                                                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="font-bold text-slate-900 block text-xs">{rule.description}</span>
                                                    {rule.additionalNotes && (
                                                        <span className="text-[10px] text-slate-400 font-mono block max-w-xs truncate" title={rule.additionalNotes}>
                                                            {rule.additionalNotes}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {getFinalidadeBadge(rule.finalidade)}
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-xs font-bold text-slate-800">
                                                    <span className="text-blue-700">{rule.cfopStateInternal}</span> / <span className="text-purple-700">{rule.cfopInterstate}</span>
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-[11px] text-slate-600">
                                                    ICMS: <strong>{rule.cstCsosnIcms}</strong> | IPI: <strong>{rule.cstIpi}</strong> | PIS: <strong>{rule.cstPis}</strong>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={excCount > 0 ? 'secondary' : 'outline'} className="font-mono text-[10px]">
                                                        {excCount} exceção(ões)
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Switch checked={rule.isActive} onCheckedChange={() => handleToggleActive(rule.id)} />
                                                </TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button size="sm" variant="ghost" onClick={() => navigate(`/fiscal/regras/${rule.id}`)} className="h-7 w-7 p-0" title="Editar Natureza Completa">
                                                        <Pencil className="h-3.5 w-3.5 text-slate-600" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setRuleToDelete(rule)} className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50" title="Excluir">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>

                                            {/* LINHAS DE EXCEÇÃO EXPANDIDAS */}
                                            {isExpanded && (
                                                <TableRow className="bg-slate-50/80">
                                                    <TableCell colSpan={8} className="p-3 pl-12">
                                                        <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-white">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                                                                    <Filter size={13} className="text-orange-600" /> Exceções Tributárias Vinculadas ({excCount})
                                                                </span>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => navigate(`/fiscal/regras/${rule.id}`)}
                                                                    className="h-7 text-[11px]"
                                                                >
                                                                    <Pencil size={12} className="mr-1" /> Gerenciar Exceções na Regra
                                                                </Button>
                                                            </div>

                                                            {excCount === 0 ? (
                                                                <p className="text-xs text-slate-400 italic py-2">
                                                                    Nenhuma exceção cadastrada. Todos os itens seguirão as regras base da natureza.
                                                                </p>
                                                            ) : (
                                                                <Table>
                                                                    <TableHeader className="bg-slate-50/50">
                                                                        <TableRow>
                                                                            <TableHead>Condições (Gatilhos)</TableHead>
                                                                            <TableHead className="text-center">CFOP Substituto</TableHead>
                                                                            <TableHead className="text-center">ICMS</TableHead>
                                                                            <TableHead className="text-center">IPI</TableHead>
                                                                            <TableHead className="text-center">PIS / COFINS</TableHead>
                                                                            <TableHead className="text-right">Ações</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {rule.exceptions.map(exc => (
                                                                            <TableRow key={exc.id} className="text-xs">
                                                                                <TableCell className="font-mono space-x-1">
                                                                                    {exc.specificDestinationState && (
                                                                                        <Badge className="bg-blue-100 text-blue-800 text-[10px]">UF: {exc.specificDestinationState}</Badge>
                                                                                    )}
                                                                                    {exc.specificNcmStart && (
                                                                                        <Badge className="bg-amber-100 text-amber-800 text-[10px]">NCM: {exc.specificNcmStart}*</Badge>
                                                                                    )}
                                                                                    {exc.specificOrigin !== null && exc.specificOrigin !== undefined && (
                                                                                        <Badge className="bg-purple-100 text-purple-800 text-[10px]">Origem: {exc.specificOrigin}</Badge>
                                                                                    )}
                                                                                    {!exc.specificDestinationState && !exc.specificNcmStart && exc.specificOrigin === null && (
                                                                                        <Badge variant="outline" className="text-[10px]">Geral</Badge>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="text-center font-mono font-bold text-slate-700">
                                                                                    {exc.cfopStateInternal || exc.cfopInterstate ? (
                                                                                        <span>{exc.cfopStateInternal || '-'} / {exc.cfopInterstate || '-'}</span>
                                                                                    ) : (
                                                                                        <span className="text-slate-400 italic">Padrão</span>
                                                                                    )}
                                                                                </TableCell>
                                                                                <TableCell className="text-center font-mono">
                                                                                    {exc.cstCsosnIcms ? <strong>CST {exc.cstCsosnIcms} ({exc.aliqIcms || 0}%)</strong> : <span className="text-slate-400 italic">Padrão</span>}
                                                                                </TableCell>
                                                                                <TableCell className="text-center font-mono">
                                                                                    {exc.cstIpi ? <span>CST {exc.cstIpi}</span> : <span className="text-slate-400 italic">Padrão</span>}
                                                                                </TableCell>
                                                                                <TableCell className="text-center font-mono">
                                                                                    {exc.cstPis ? <span>PIS {exc.cstPis}</span> : <span className="text-slate-400 italic">Padrão</span>}
                                                                                </TableCell>
                                                                                <TableCell className="text-right space-x-1">
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        onClick={() => navigate(`/fiscal/regras/${rule.id}/excecoes/${exc.id}`)}
                                                                                        className="h-6 w-6 p-0"
                                                                                        title="Editar exceção"
                                                                                    >
                                                                                        <Pencil size={12} className="text-slate-600" />
                                                                                    </Button>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        onClick={() => setExceptionToDelete({ ruleId: rule.id, exceptionId: exc.id })}
                                                                                        className="h-6 w-6 p-0 text-rose-600 hover:bg-rose-50"
                                                                                        title="Remover exceção"
                                                                                    >
                                                                                        <Trash2 size={12} />
                                                                                    </Button>
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* ALERTA DE EXCLUSÃO DA NATUREZA DE OPERAÇÃO (SHADCN/UI) */}
            <AlertDialog open={!!ruleToDelete} onOpenChange={(open) => !open && setRuleToDelete(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
                            <Trash2 className="h-5 w-5" /> Excluir Natureza de Operação?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-600">
                            Tem certeza de que deseja remover a natureza de operação{' '}
                            <strong className="text-slate-900">{ruleToDelete?.description}</strong>?
                            <br /><br />
                            Todas as linhas de exceção vinculadas a esta regra também serão excluídas permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDeleteRule}
                            disabled={isDeleting}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                            Confirmar Exclusão
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ALERTA DE EXCLUSÃO DE LINHA DE EXCEÇÃO (SHADCN/UI) */}
            <AlertDialog open={!!exceptionToDelete} onOpenChange={(open) => !open && setExceptionToDelete(null)}>
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
                            <Trash2 className="h-5 w-5" /> Remover Linha de Exceção?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-600">
                            Tem certeza de que deseja remover esta linha de exceção tributária?
                            <br /><br />
                            Os produtos e operações que atendiam a estes critérios passarão a seguir as alíquotas e CFOPs padrão da natureza base.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDeleteException}
                            disabled={isDeleting}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                            Remover Exceção
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}