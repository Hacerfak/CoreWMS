import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    ArrowLeft, Barcode, CheckCircle2, Loader2, MapPin,
    Plus, Trash2, AlertTriangle, Layers, Boxes, ShoppingCart, QrCode
} from 'lucide-react';
import { customInstance } from '@/api/orval-mutator';
import { toast } from 'sonner';

export default function ExecucaoContagemPage() {
    const { taskId } = useParams();
    const navigate = useNavigate();

    const [task, setTask] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

    // Estados para Armazenamento Blocado (Carrinho Acumulativo)
    const [inputQty, setInputQty] = useState('');
    const [inputNote, setInputNote] = useState('');
    const [cartItems, setCartItems] = useState([]);

    // Estados para Armazenamento Unitário / HU (Validação Estrita LPN)
    const [inputLpn, setInputLpn] = useState('');
    const [unitQty, setUnitQty] = useState('');

    const lpnInputRef = useRef(null);
    const qtyInputRef = useRef(null);

    const loadTaskData = async () => {
        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/cycle-count/tasks/operator', method: 'GET' });
            const found = (res || []).find(t => t.id === taskId);

            if (found) {
                setTask(found);
            } else {
                toast.error('Tarefa não encontrada ou não atribuída a este operador.');
                navigate('/inventario/operacao');
            }
        } catch {
            toast.error('Erro ao carregar dados da contagem.');
            navigate('/inventario/operacao');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (taskId) loadTaskData();
    }, [taskId]);

    // Total acumulado no carrinho (Modo Blocado)
    const totalCountedBlocado = useMemo(() => {
        return cartItems.reduce((acc, item) => acc + item.quantity, 0);
    }, [cartItems]);

    // ------------------------------------------------------------------
    // HANDLERS: MODO ARMAZENAMENTO BLOCADO (CARRINHO ACUMULATIVO)
    // ------------------------------------------------------------------
    const handleAddToCartBlocado = (e) => {
        if (e) e.preventDefault();
        const qtyNum = Number(inputQty);

        if (!inputQty || isNaN(qtyNum) || qtyNum <= 0) {
            return toast.warning('Informe uma quantidade válida maior que zero.');
        }

        const newItem = {
            id: Date.now().toString(),
            quantity: qtyNum,
            note: inputNote.trim() || 'Leitura manual / Blocado',
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };

        setCartItems([newItem, ...cartItems]);
        setInputQty('');
        setInputNote('');
        toast.success(`+${qtyNum} UN adicionadas ao carrinho de leitura!`);
    };

    const handleRemoveFromCart = (id) => {
        setCartItems(cartItems.filter(item => item.id !== id));
        toast.info('Item removido do carrinho.');
    };

    const handleFinalizeCountBlocado = async () => {
        if (cartItems.length === 0 && totalCountedBlocado === 0) {
            return toast.warning('Adicione ao menos uma leitura no carrinho antes de finalizar.');
        }

        setIsSubmitting(true);
        try {
            await customInstance({
                url: `/api/cycle-count/tasks/${taskId}/record-position`,
                method: 'POST',
                data: { countedQuantity: totalCountedBlocado }
            });

            toast.success(`Contagem de ${totalCountedBlocado} UN salva com sucesso para a posição ${task.locationPath}!`);
            navigate('/inventario/operacao');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao salvar contagem.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ------------------------------------------------------------------
    // HANDLERS: MODO ARMAZENAMENTO UNITÁRIO / PORTA-PALETES (LPN ESTRITO)
    // ------------------------------------------------------------------
    const handleSubmitSingleHu = async (e) => {
        if (e) e.preventDefault();

        if (!inputLpn.trim()) {
            toast.warning('Bipe ou informe o código LPN da HU.');
            if (lpnInputRef.current) lpnInputRef.current.focus();
            return;
        }

        const qtyNum = Number(unitQty);
        if (unitQty === '' || isNaN(qtyNum) || qtyNum < 0) {
            toast.warning('Informe uma quantidade válida igual ou maior que zero.');
            if (qtyInputRef.current) qtyInputRef.current.focus();
            return;
        }

        setIsSubmitting(true);
        try {
            await customInstance({
                url: `/api/cycle-count/tasks/${taskId}/record-lpn`,
                method: 'POST',
                data: {
                    lpn: inputLpn.trim().toUpperCase(),
                    countedQuantity: qtyNum
                }
            });

            toast.success('Contagem de HU registrada com sucesso!');
            navigate('/inventario/operacao');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao registrar contagem da HU.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ------------------------------------------------------------------
    // AÇÕES COMPARTILHADAS (VOLTAR E CANCELAR/DESVINCULAR)
    // ------------------------------------------------------------------
    const handleBackWithoutUnlinking = () => {
        toast.info('Você saiu da contagem. A tarefa continua atribuída a você.');
        navigate('/inventario/operacao');
    };

    const handleConfirmCancelCounting = async () => {
        setIsSubmitting(true);
        try {
            await customInstance({
                url: `/api/cycle-count/tasks/${taskId}/cancel-counting`,
                method: 'POST'
            });

            toast.info('Contagem cancelada. A posição foi liberada para a fila de contagem.');
            setIsCancelModalOpen(false);
            navigate('/inventario/operacao');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao cancelar contagem.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-64 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando dados da posição...</p>
            </div>
        );
    }

    if (!task) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-5 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-slate-200/80 rounded-xl shadow-2xs">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" onClick={handleBackWithoutUnlinking} className="bg-white" title="Voltar à lista sem desvincular">
                        <ArrowLeft size={16} />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-blue-50 text-blue-900 border-blue-200 font-mono text-xs gap-1">
                                <MapPin size={12} className="text-blue-600" /> {task.locationPath}
                            </Badge>
                            <Badge variant="secondary" className="font-mono text-xs">Rodada {task.currentRound || 1}</Badge>
                            {task.isDynamicStorage ? (
                                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] gap-1">
                                    <Boxes size={12} /> Armazenagem Blocada (Carrinho)
                                </Badge>
                            ) : (
                                <Badge className="bg-purple-100 text-purple-900 border-purple-300 text-[10px] gap-1">
                                    <Layers size={12} /> Posição Unitária / HU Estrita
                                </Badge>
                            )}
                        </div>
                        <h1 className="text-base font-bold text-slate-900 mt-1">{task.productSku} - {task.productDescription}</h1>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setIsCancelModalOpen(true)}
                        disabled={isSubmitting}
                        className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs h-9"
                    >
                        <AlertTriangle size={14} className="mr-1.5" /> Cancelar e Liberar Posição
                    </Button>

                    {/* BOTÃO FINALIZAR EXCLUSIVO PARA O MODO BLOCADO */}
                    {task.isDynamicStorage && (
                        <Button
                            onClick={handleFinalizeCountBlocado}
                            disabled={isSubmitting || cartItems.length === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 shadow-2xs"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            Finalizar Contagem ({totalCountedBlocado} UN)
                        </Button>
                    )}
                </div>
            </div>

            {/* PAINEL DE CONTAGEM */}
            {task.isDynamicStorage ? (
                /* ----------------------------------------------------------------- */
                /* FLUXO 1: ARMAZENAMENTO BLOCADO COM CARRINHO ACUMULATIVO            */
                /* ----------------------------------------------------------------- */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* INPUT DE LEITURA BLOCADA */}
                    <Card className="md:col-span-1 bg-white border-slate-200 shadow-2xs">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Barcode size={18} className="text-blue-600" /> Adicionar ao Carrinho
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-500">
                                Armazenamento Blocado: Adicione as quantidades parciais para acumular o total.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                            <form onSubmit={handleAddToCartBlocado} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-700 uppercase">Quantidade a Somar *</label>
                                    <Input
                                        type="number"
                                        autoFocus
                                        placeholder="Ex: 10"
                                        value={inputQty}
                                        onChange={(e) => setInputQty(e.target.value)}
                                        className="bg-white font-mono text-xl font-bold text-center h-12 border-slate-300"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700">Identificação / Nota (Opcional)</label>
                                    <Input
                                        placeholder="Ex: Fila 1, Camada A..."
                                        value={inputNote}
                                        onChange={(e) => setInputNote(e.target.value)}
                                        className="bg-white text-xs border-slate-300"
                                    />
                                </div>

                                <Button type="submit" disabled={!inputQty} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10">
                                    <Plus size={16} className="mr-1.5" /> Adicionar ao Carrinho
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* CARRINHO DE BIPAGENS */}
                    <Card className="md:col-span-2 bg-white border-slate-200 shadow-2xs">
                        <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <ShoppingCart size={18} className="text-emerald-600" /> Carrinho de Bipagens Blocadas
                                </CardTitle>
                                <CardDescription className="text-xs text-slate-500">
                                    {cartItems.length} {cartItems.length === 1 ? 'leitura adicionada' : 'leituras adicionadas'} nesta sessão.
                                </CardDescription>
                            </div>

                            <div className="text-right">
                                <span className="text-xs text-slate-400 block font-medium">TOTAL ACUMULADO</span>
                                <span className="text-2xl font-bold font-mono text-emerald-700">{totalCountedBlocado.toLocaleString('pt-BR')} UN</span>
                            </div>
                        </CardHeader>

                        <CardContent className="p-0">
                            <div className="overflow-auto max-h-[320px]">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead className="w-16">Horário</TableHead>
                                            <TableHead>Identificação / Nota</TableHead>
                                            <TableHead className="text-right">Qtd Adicionada</TableHead>
                                            <TableHead className="w-12 text-center"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {cartItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-36 text-center text-slate-400 text-xs italic">
                                                    Nenhuma leitura no carrinho. Digite as quantidades parciais no painel lateral.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            cartItems.map((item) => (
                                                <TableRow key={item.id} className="hover:bg-slate-50/80">
                                                    <TableCell className="font-mono text-[11px] text-slate-400">{item.time}</TableCell>
                                                    <TableCell className="text-xs font-medium text-slate-800">{item.note}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-xs text-slate-900">
                                                        +{item.quantity.toLocaleString('pt-BR')} UN
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleRemoveFromCart(item.id)}
                                                            className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                                        >
                                                            <Trash2 size={13} />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                /* ----------------------------------------------------------------- */
                /* FLUXO 2: ARMAZENAMENTO UNITÁRIO / PORTA-PALETES (LPN ESTRITO)       */
                /* ----------------------------------------------------------------- */
                <Card className="max-w-xl mx-auto bg-white border-slate-200 shadow-2xs">
                    <CardHeader className="p-5 pb-3 border-b border-slate-100">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <QrCode size={18} className="text-purple-600" /> Leitura e Validação de HU
                            </CardTitle>
                            <Badge className="bg-purple-100 text-purple-900 border-purple-200 text-[10px] gap-1">
                                <Layers size={11} /> Porta-Palete
                            </Badge>
                        </div>
                        <CardDescription className="text-xs text-slate-500 mt-1">
                            Bipe o código LPN da HU e informe a quantidade encontrada na posição <strong className="font-mono text-slate-900">{task.locationPath}</strong>.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="p-5">
                        <form onSubmit={handleSubmitSingleHu} className="space-y-5">
                            {/* PASSO 1: BIPAGEM LPN */}
                            <div className="space-y-1.5 p-3 bg-purple-50/60 border border-purple-200 rounded-xl">
                                <label className="text-xs font-bold text-purple-900 flex items-center gap-1.5 uppercase">
                                    <QrCode size={14} className="text-purple-600" /> Passo 1: Bipe o Código LPN da HU *
                                </label>
                                <Input
                                    ref={lpnInputRef}
                                    type="text"
                                    autoFocus
                                    placeholder="Aguardando bipagem do LPN..."
                                    value={inputLpn}
                                    onChange={(e) => setInputLpn(e.target.value)}
                                    className="bg-white font-mono text-sm font-bold border-purple-300 focus-visible:ring-purple-500 uppercase h-11"
                                />
                            </div>

                            {/* PASSO 2: QUANTIDADE */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                                    <Barcode size={14} className="text-blue-600" /> Passo 2: Quantidade da HU *
                                </label>
                                <Input
                                    ref={qtyInputRef}
                                    type="number"
                                    placeholder="0"
                                    value={unitQty}
                                    onChange={(e) => setUnitQty(e.target.value)}
                                    className="bg-white font-mono text-2xl font-bold text-center h-14 border-slate-300 focus-visible:ring-blue-500"
                                />
                            </div>

                            {/* BOTÃO SUBMETER */}
                            <Button
                                type="submit"
                                disabled={isSubmitting || !inputLpn.trim() || unitQty === ''}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 text-sm shadow-2xs mt-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                ) : (
                                    <CheckCircle2 className="h-5 w-5 mr-2" />
                                )}
                                Confirmar Contagem
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* CONFIRMAÇÃO DE CANCELAMENTO COM DESVÍNCULO */}
            <AlertDialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
                <AlertDialogContent className="bg-white sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 flex items-center gap-2">
                            <AlertTriangle className="text-amber-600" size={20} />
                            Cancelar e Liberar Posição?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-500">
                            Esta ação interromperá a contagem, desvinculará a tarefa do seu perfil e a devolverá para a fila geral de operadores.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="pt-2">
                        <AlertDialogCancel disabled={isSubmitting}>Voltar à Contagem</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmCancelCounting}
                            disabled={isSubmitting}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Sim, Liberar Posição
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}