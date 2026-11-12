import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
    Plus, Trash2, AlertTriangle, Layers, Boxes, ShoppingCart, EyeOff
} from 'lucide-react';
import { customInstance } from '@/api/orval-mutator';
import { toast } from 'sonner';

export default function ExecucaoContagemPage() {
    const { taskId } = useParams(); // Formato: "{planId}_{locationId}"
    const navigate = useNavigate();

    const [locationTask, setLocationTask] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Modais de Confirmação
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);

    // Estados da Contagem Cega
    const [isEmptyLocation, setIsEmptyLocation] = useState(false);
    const [scannedCode, setScannedCode] = useState('');
    const [inputQty, setInputQty] = useState('1');
    const [entries, setEntries] = useState([]);

    const codeInputRef = useRef(null);

    const { planId, locationId } = useMemo(() => {
        if (!taskId || !taskId.includes('_')) return { planId: '', locationId: '' };
        const [pId, lId] = taskId.split('_');
        return { planId: pId, locationId: lId };
    }, [taskId]);

    const loadLocationData = async () => {
        if (!planId || !locationId) {
            toast.error('Identificador de endereço inválido.');
            navigate('/inventario/operacao');
            return;
        }

        try {
            setIsLoading(true);
            const res = await customInstance({ url: '/api/cycle-count/tasks/operator', method: 'GET' });
            const list = Array.isArray(res) ? res : [];
            const found = list.find(l => l.planId === planId && l.locationId === locationId);

            if (found) {
                setLocationTask(found);
            } else {
                toast.error('Endereço não encontrado ou já finalizado.');
                navigate('/inventario/operacao');
            }
        } catch {
            toast.error('Erro ao carregar dados do endereço.');
            navigate('/inventario/operacao');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadLocationData();
    }, [planId, locationId]);

    useEffect(() => {
        if (!isLoading && !isEmptyLocation && codeInputRef.current) {
            codeInputRef.current.focus();
        }
    }, [isLoading, isEmptyLocation]);

    const totalCountedUnits = useMemo(() => {
        return entries.reduce((acc, item) => acc + item.quantity, 0);
    }, [entries]);

    const handleAddEntry = (e) => {
        if (e) e.preventDefault();
        const cleanCode = scannedCode.trim().toUpperCase();
        const qtyNum = Number(inputQty);

        if (!cleanCode) {
            toast.warning('Bipe ou informe o código LPN da HU ou SKU/EAN.');
            if (codeInputRef.current) codeInputRef.current.focus();
            return;
        }

        if (isNaN(qtyNum) || qtyNum <= 0) {
            toast.warning('Informe uma quantidade válida maior que zero.');
            return;
        }

        const newItem = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            scannedCode: cleanCode,
            quantity: qtyNum,
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };

        setEntries(prev => [newItem, ...prev]);
        setScannedCode('');
        setInputQty('1');
        toast.success(`Leitura "${cleanCode}" (+${qtyNum} un) adicionada!`);

        if (codeInputRef.current) {
            codeInputRef.current.focus();
        }
    };

    const handleRemoveEntry = (id) => {
        setEntries(prev => prev.filter(item => item.id !== id));
        toast.info('Leitura removida da lista.');
    };

    const handleToggleEmptyLocation = (checked) => {
        setIsEmptyLocation(checked);
        if (checked) {
            setEntries([]);
            setScannedCode('');
            setInputQty('1');
        }
    };

    const handleConfirmFinalize = async () => {
        if (!isEmptyLocation && entries.length === 0) {
            return toast.warning('Adicione ao menos uma leitura ou marque "Endereço Fisicamente Vazio".');
        }

        setIsSubmitting(true);
        try {
            const payload = {
                planId,
                locationId,
                isEmptyLocation,
                entries: isEmptyLocation
                    ? []
                    : entries.map(e => ({
                        scannedCode: e.scannedCode,
                        countedQuantity: e.quantity
                    }))
            };

            const res = await customInstance({
                url: `/api/cycle-count/locations/${planId}/${locationId}/record`,
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || `Contagem do endereço ${locationTask.locationPath} registrada com sucesso!`);
            setIsFinalizeModalOpen(false);
            navigate('/inventario/operacao');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao registrar contagem do endereço.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBackWithoutUnlinking = () => {
        toast.info('Você saiu da tela. O endereço continua atribuído a você.');
        navigate('/inventario/operacao');
    };

    const handleConfirmCancelCounting = async () => {
        setIsSubmitting(true);
        try {
            await customInstance({
                url: `/api/cycle-count/locations/${planId}/${locationId}/cancel`,
                method: 'POST'
            });

            toast.info('Contagem cancelada e endereço devolvido para a fila.');
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
                <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando dados do endereço...</p>
            </div>
        );
    }

    if (!locationTask) return null;

    const canFinalize = isEmptyLocation || entries.length > 0;

    return (
        <div className="max-w-4xl mx-auto space-y-5 animate-in fade-in duration-300">
            {/* CABEÇALHO 100% CEGO (APENAS ENDEREÇO, PLANO E RODADA) */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-slate-200/80 rounded-xl shadow-2xs">
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleBackWithoutUnlinking}
                        className="bg-white"
                        title="Voltar à lista sem desvincular"
                    >
                        <ArrowLeft size={16} />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="bg-pink-50 text-pink-900 border-pink-200 font-mono text-sm font-bold gap-1.5 py-1 px-2.5">
                                <MapPin size={14} className="text-pink-600" /> {locationTask.locationPath}
                            </Badge>
                            <Badge variant="secondary" className="font-mono text-xs">
                                Rodada {locationTask.currentRound || 1}
                            </Badge>
                            {locationTask.isDynamicStorage ? (
                                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] gap-1">
                                    <Boxes size={12} /> Armazenagem Blocada
                                </Badge>
                            ) : (
                                <Badge className="bg-purple-100 text-purple-900 border-purple-300 text-[10px] gap-1">
                                    <Layers size={12} /> Porta-Palete
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                            <EyeOff size={13} className="text-pink-600" />
                            <span>Plano: <strong className="text-slate-700">{locationTask.planName}</strong> (Produtos e saldos ocultos)</span>
                        </p>
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

                    <Button
                        onClick={() => setIsFinalizeModalOpen(true)}
                        disabled={isSubmitting || !canFinalize}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 shadow-2xs"
                    >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        {isEmptyLocation ? 'Confirmar Posição Vazia' : `Finalizar Contagem (${totalCountedUnits} UN)`}
                    </Button>
                </div>
            </div>

            {/* OPÇÃO DE POSIÇÃO VAZIA */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 flex items-center justify-between shadow-2xs">
                <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-900 block">Endereço Fisicamente Vazio (0 Unidades)</span>
                    <span className="text-[11px] text-slate-500 block">
                        Ative esta opção se não houver nenhuma HU ou produto armazenado nesta posição.
                    </span>
                </div>
                <Switch checked={isEmptyLocation} onCheckedChange={handleToggleEmptyLocation} />
            </div>

            {/* PAINEL DE CONTAGEM CEGA */}
            {isEmptyLocation ? (
                <Card className="bg-emerald-50/40 border-emerald-200 shadow-2xs">
                    <CardContent className="p-8 text-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                            <CheckCircle2 size={26} />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">
                            Posição {locationTask.locationPath} Marcada como Vazia
                        </h3>
                        <p className="text-xs text-slate-600 max-w-md mx-auto">
                            Clique em <strong>"Confirmar Posição Vazia"</strong> no topo para registrar 0 unidades e enviar o resultado para revisão da Gestão.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* INPUT DE LEITURA */}
                    <Card className="md:col-span-1 bg-white border-slate-200 shadow-2xs">
                        <CardHeader className="p-4 pb-2">
                            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <Barcode size={18} className="text-pink-600" /> Registrar Leitura Cega
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-500">
                                Bipe o LPN da HU ou o código SKU/EAN encontrado fisicamente nesta posição.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                            <form onSubmit={handleAddEntry} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-700 uppercase">LPN da HU ou SKU / EAN *</label>
                                    <Input
                                        ref={codeInputRef}
                                        type="text"
                                        autoFocus
                                        placeholder="Bipe ou digite o código..."
                                        value={scannedCode}
                                        onChange={(e) => setScannedCode(e.target.value)}
                                        className="bg-white font-mono text-sm font-bold uppercase h-11 border-slate-300 focus-visible:ring-pink-500"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-700 uppercase">Quantidade Contada *</label>
                                    <Input
                                        type="number"
                                        step="0.0001"
                                        placeholder="1"
                                        value={inputQty}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => setInputQty(e.target.value)}
                                        className="bg-white font-mono text-xl font-bold text-center h-12 border-slate-300"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={!scannedCode.trim() || !inputQty}
                                    className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold h-10"
                                >
                                    <Plus size={16} className="mr-1.5" /> Adicionar Leitura
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* LISTA DE LEITURAS DA SESSÃO */}
                    <Card className="md:col-span-2 bg-white border-slate-200 shadow-2xs">
                        <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <ShoppingCart size={18} className="text-emerald-600" /> Volumes / Itens Bipados na Posição
                                </CardTitle>
                                <CardDescription className="text-xs text-slate-500">
                                    {entries.length} {entries.length === 1 ? 'leitura registrada' : 'leituras registradas'} nesta posição.
                                </CardDescription>
                            </div>

                            <div className="text-right">
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">Total Contado</span>
                                <span className="text-2xl font-bold font-mono text-emerald-700">
                                    {totalCountedUnits.toLocaleString('pt-BR')} UN
                                </span>
                            </div>
                        </CardHeader>

                        <CardContent className="p-0">
                            <div className="overflow-auto max-h-[340px]">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead className="w-20">Horário</TableHead>
                                            <TableHead>Código Lido (LPN / SKU)</TableHead>
                                            <TableHead className="text-right">Quantidade</TableHead>
                                            <TableHead className="w-12 text-center"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {entries.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-36 text-center text-slate-400 text-xs italic">
                                                    Nenhuma leitura registrada ainda. Utilize o leitor ao lado para bipar os volumes da posição.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            entries.map((item) => (
                                                <TableRow key={item.id} className="hover:bg-slate-50/80">
                                                    <TableCell className="font-mono text-[11px] text-slate-400">{item.time}</TableCell>
                                                    <TableCell className="font-mono font-bold text-xs text-slate-900">{item.scannedCode}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold text-xs text-emerald-700">
                                                        {item.quantity.toLocaleString('pt-BR')} UN
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleRemoveEntry(item.id)}
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
            )}

            {/* MODAL DE CONFIRMAÇÃO DE FINALIZAÇÃO */}
            <AlertDialog open={isFinalizeModalOpen} onOpenChange={setIsFinalizeModalOpen}>
                <AlertDialogContent className="bg-white sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 flex items-center gap-2">
                            <CheckCircle2 className="text-emerald-600" size={20} />
                            Finalizar Contagem do Endereço?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-600 space-y-2">
                            <span>
                                {isEmptyLocation
                                    ? <>Confirma que o endereço <strong className="font-mono text-slate-900">{locationTask.locationPath}</strong> está fisicamente vazio (0 unidades)?</>
                                    : <>Confirma o envio de <strong>{entries.length} leitura(s)</strong> (total de <strong className="font-mono text-slate-900">{totalCountedUnits} UN</strong>) para o endereço <strong className="font-mono text-slate-900">{locationTask.locationPath}</strong>?</>
                                }
                            </span>
                            <p className="text-slate-500">
                                Os dados serão submetidos para análise e conciliação pela Gestão.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="pt-2">
                        <AlertDialogCancel disabled={isSubmitting}>Revisar Mais</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmFinalize}
                            disabled={isSubmitting}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Confirmar e Enviar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* MODAL DE CANCELAMENTO COM DESVÍNCULO */}
            <AlertDialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
                <AlertDialogContent className="bg-white sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 flex items-center gap-2">
                            <AlertTriangle className="text-amber-600" size={20} />
                            Cancelar e Liberar Posição?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-500">
                            Esta ação descartará as leituras desta sessão, desvinculará o endereço do seu perfil e o devolverá para a fila de contagem.
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