import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, Loader2, Search } from 'lucide-react';

const formatDatePtBr = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

export default function TabCiclos({ cycles, isLoading }) {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    const filteredCycles = useMemo(() => {
        if (!searchTerm.trim()) return cycles;
        const term = searchTerm.toLowerCase();
        return cycles.filter(c =>
            c.referenceMonth?.toLowerCase().includes(term) ||
            c.customerName?.toLowerCase().includes(term)
        );
    }, [cycles, searchTerm]);

    return (
        <div className="space-y-3">
            {/* BARRA DE PESQUISA */}
            <div className="flex items-center justify-between gap-4 bg-white p-3 border border-slate-200/80 rounded-xl shadow-2xs">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <Input
                        placeholder="Buscar por competência (MM/YYYY) ou depositante..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-8 text-xs bg-slate-50 border-slate-200"
                    />
                </div>
                <span className="text-xs text-slate-400 font-mono">
                    {filteredCycles.length} ciclo(s) listado(s)
                </span>
            </div>

            {/* TABELA DE CICLOS */}
            <Card className="border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead>Competência</TableHead>
                            <TableHead>Depositante</TableHead>
                            <TableHead>Período Contábil</TableHead>
                            <TableHead className="text-right">Total Acumulado</TableHead>
                            <TableHead className="text-center">Situação</TableHead>
                            <TableHead className="text-right w-36">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-28 text-center text-xs text-slate-500">
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-600" />
                                </TableCell>
                            </TableRow>
                        ) : filteredCycles.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-28 text-center text-xs text-slate-400 italic">
                                    Nenhum ciclo de apuração encontrado.
                                </TableCell>
                            </TableRow>
                        ) : filteredCycles.map(c => {
                            const isDraft = c.status === 'Draft' || c.status === '1';

                            return (
                                <TableRow key={c.id} className="hover:bg-slate-50/50">
                                    <TableCell className="font-bold font-mono text-slate-900 text-xs">{c.referenceMonth}</TableCell>
                                    <TableCell className="font-semibold text-slate-800 text-xs">{c.customerName}</TableCell>
                                    <TableCell className="text-xs font-mono text-slate-700">
                                        {formatDatePtBr(c.startDate)} a {formatDatePtBr(c.endDate)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-emerald-700 text-sm">
                                        {(c.totalAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge className={`text-[10px] font-semibold border ${isDraft
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            : 'bg-slate-100 text-slate-700 border-slate-200'
                                            }`}>
                                            {isDraft ? '🟢 Aberto (Acumulando)' : '🔒 Encerrado'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            onClick={() => navigate(`/billing/ciclos/${c.id}`)}
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs bg-white text-slate-700 hover:bg-slate-100 font-semibold shadow-xs"
                                        >
                                            <Eye size={13} className="mr-1 text-slate-500" /> Extrato Analítico
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}