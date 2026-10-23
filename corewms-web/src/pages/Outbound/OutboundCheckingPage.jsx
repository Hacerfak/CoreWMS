import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import {
    useGetApiOutboundCheckingOrderIdTasks,
    usePostApiOutboundCheckingScan,
    usePostApiOutboundCheckingOrdersOrderIdReset
} from '@/api/generated/outbound/outbound';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    ArrowLeft, Barcode, CheckCircle2, Loader2, PackageCheck,
    RotateCcw, ShieldCheck, Box, Layers, AlertCircle, ArrowRight,
    Warehouse, Check, Lock
} from 'lucide-react';
import { toast } from 'sonner';

export default function OutboundCheckingPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Dados complementares da ordem e docas
    const [orderDetails, setOrderDetails] = useState(null);
    const [docks, setDocks] = useState([]);
    const [selectedDockId, setSelectedDockId] = useState('');
    const [isSavingDock, setIsSavingDock] = useState(false);

    // Estados de leitura e formulário
    const [scannedCode, setScannedCode] = useState('');
    const [scanQuantity, setScanQuantity] = useState('1');
    const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

    const inputRef = useRef(null);

    // 1. Consulta em tempo real das tarefas e baldes de conferência
    const { data: checkingData, isLoading: isLoadingTasks } = useGetApiOutboundCheckingOrderIdTasks(orderId, {
        query: { enabled: !!orderId, refetchInterval: 4000 }
    });

    // 2. Carrega docas disponíveis da topologia e dados mestres da ordem
    useEffect(() => {
        if (!orderId) return;

        Promise.all([
            customInstance({ url: `/api/outbound/orders/${orderId}`, method: 'GET' }),
            customInstance({ url: '/api/topology/locations/docks', method: 'GET' })
        ])
            .then(([orderRes, docksRes]) => {
                const orderData = orderRes?.data || orderRes;
                setOrderDetails(orderData);

                const dockList = Array.isArray(docksRes) ? docksRes : (docksRes?.items || []);
                setDocks(dockList);

                if (orderData?.dockLocationId) {
                    setSelectedDockId(orderData.dockLocationId);
                }
            })
            .catch(() => toast.error('Erro ao carregar docas ou detalhes do pedido.'));
    }, [orderId]);

    // 3. Mutações Orval
    const { mutate: executeScan, isPending: isScanning } = usePostApiOutboundCheckingScan({
        mutation: {
            onSuccess: (res) => {
                toast.success(res?.message || 'Item conferido com sucesso!');
                setScannedCode('');
                setScanQuantity('1');
                queryClient.invalidateQueries({ queryKey: [`/api/outbound/checking/${orderId}/tasks`] });
                queryClient.invalidateQueries({ queryKey: [`/api/outbound/orders/${orderId}`] });
                queryClient.invalidateQueries({ queryKey: ['/api/outbound/orders'] });
            },
            onError: (err) => {
                toast.error(err.response?.data?.message || 'Erro ao processar leitura.');
            },
            onSettled: () => {
                if (inputRef.current) inputRef.current.focus();
            }
        }
    });

    const { mutate: resetChecking, isPending: isResetting } = usePostApiOutboundCheckingOrdersOrderIdReset({
        mutation: {
            onSuccess: (res) => {
                toast.success(res?.message || 'Conferência reinicializada com sucesso.');
                setIsResetDialogOpen(false);
                queryClient.invalidateQueries({ queryKey: [`/api/outbound/checking/${orderId}/tasks`] });
                queryClient.invalidateQueries({ queryKey: [`/api/outbound/orders/${orderId}`] });
                queryClient.invalidateQueries({ queryKey: ['/api/outbound/orders'] });
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao reinicializar conferência.')
        }
    });

    // Regra de segurança: Bloqueia conferência paralela se houver fracionados pendentes de packing
    const isParallelCheckingBlocked = Boolean(checkingData?.hasFractionalPendingPacking);

    // Foco automático no leitor ao carregar e após seleções
    useEffect(() => {
        if (selectedDockId && !isParallelCheckingBlocked && inputRef.current) {
            inputRef.current.focus();
        }
    }, [selectedDockId, isParallelCheckingBlocked, isLoadingTasks]);

    // Grava a doca de embarque se ainda não estiver vinculada
    const handleAssignDock = async (dockId) => {
        setSelectedDockId(dockId);
        try {
            setIsSavingDock(true);
            await customInstance({
                url: `/api/outbound/orders/${orderId}/dock`,
                method: 'POST',
                data: { dockLocationId: dockId }
            });
            toast.success('Doca de embarque confirmada para este pedido!');
            queryClient.invalidateQueries({ queryKey: [`/api/outbound/orders/${orderId}`] });
        } catch {
            toast.info('Doca selecionada para a conferência física atual.');
        } finally {
            setIsSavingDock(false);
            if (inputRef.current && !isParallelCheckingBlocked) inputRef.current.focus();
        }
    };

    const handleScanSubmit = (e) => {
        e.preventDefault();

        if (isParallelCheckingBlocked) {
            return toast.error('Conferência bloqueada: este pedido possui itens fracionados aguardando a conclusão do packing.');
        }

        if (!selectedDockId) {
            return toast.warning('Selecione a Doca de Embarque antes de iniciar a bipagem.');
        }

        const clean = scannedCode.trim();
        if (!clean) return toast.warning('Bipe ou digite o código de barras, LPN ou volume.');

        const qtyNum = parseFloat(scanQuantity);
        executeScan({
            data: {
                orderId,
                scannedCode: clean,
                quantity: !isNaN(qtyNum) && qtyNum > 0 ? qtyNum : 1
            }
        });
    };

    if (isLoadingTasks && !checkingData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                <p className="text-xs text-slate-500 font-medium">A carregar tarefas de conferência...</p>
            </div>
        );
    }

    const isFullyChecked = checkingData?.isOrderFullyChecked;
    const percentGlobal = checkingData?.totalExpected > 0
        ? Math.min(100, (checkingData.totalChecked / checkingData.totalExpected) * 100)
        : 0;

    const currentDockName = docks.find(d => d.id === selectedDockId)?.fullPath ||
        docks.find(d => d.id === selectedDockId)?.code ||
        orderDetails?.dockLocationName;

    return (
        <div className="flex flex-col space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate('/outbound')} className="bg-white">
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                <PackageCheck className="text-teal-600" size={22} /> Conferência de Saída (Checking)
                            </h1>
                            <Badge className="bg-teal-100 text-teal-800 border-teal-200 text-xs font-mono">
                                #{checkingData?.orderNumber}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Depositante: <strong>{checkingData?.customerName}</strong>
                            {currentDockName && <> | Doca Atual: <strong className="text-teal-800 font-mono">{currentDockName}</strong></>}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        onClick={() => setIsResetDialogOpen(true)}
                        disabled={isResetting || checkingData?.totalChecked === 0}
                        className="border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 text-xs h-9"
                    >
                        <RotateCcw className="h-3.5 w-3.5 mr-1 text-slate-400" /> Reinicializar Conferência
                    </Button>

                    {/* ATALHO EXCLUSIVO PARA AVANÇAR PARA A EXPEDIÇÃO E NOTA FISCAL */}
                    {isFullyChecked && (
                        <Button
                            onClick={() => navigate(`/outbound/revisao-fiscal/${orderId}`)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 px-5 shadow-xs"
                        >
                            <CheckCircle2 size={16} className="mr-1.5" /> Avançar para Expedição & NF-e <ArrowRight size={15} className="ml-1" />
                        </Button>
                    )}
                </div>
            </div>

            {/* AVISO DE BLOQUEIO DE CONFERÊNCIA PARALELA EM PEDIDOS FRACIONADOS */}
            {isParallelCheckingBlocked && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 shadow-xs animate-in fade-in">
                    <div className="p-2 rounded-xl bg-amber-200/80 text-amber-900 shrink-0 mt-0.5">
                        <Lock size={18} />
                    </div>
                    <div className="space-y-1 text-xs text-amber-950">
                        <strong className="block text-sm font-bold text-amber-900">
                            Conferência Paralela Bloqueada (Pedido com Fracionamento)
                        </strong>
                        <p className="leading-relaxed">
                            Este pedido contém itens fracionados que requerem passagem obrigatória pela mesa de <strong>Packing</strong>. A conferência física só estará disponível após a conclusão de 100% da separação e o fecho dos volumes na mesa de embalagem.
                        </p>
                    </div>
                </div>
            )}

            {/* CARD OBRIGATÓRIO DE SELEÇÃO DA DOCA DE CARREGAMENTO */}
            <div className={`p-4 rounded-xl border transition-all ${!selectedDockId
                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20 shadow-xs'
                : 'bg-white border-slate-200 shadow-2xs'
                }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg mt-0.5 shrink-0 ${!selectedDockId ? 'bg-amber-200 text-amber-900' : 'bg-teal-100 text-teal-800'}`}>
                            <Warehouse size={18} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                    Doca de Carregamento / Staging *
                                </Label>
                                {selectedDockId && (
                                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] gap-1">
                                        <Check size={10} /> Doca Definida
                                    </Badge>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                                {!selectedDockId
                                    ? 'Indique a doca onde os volumes estão a ser posicionados para embarque antes de bipar os itens.'
                                    : 'Volumes conferidos serão vinculados diretamente a esta doca para despacho.'
                                }
                            </p>
                        </div>
                    </div>

                    <div className="min-w-[260px] flex items-center gap-2">
                        <Select
                            value={selectedDockId}
                            onValueChange={handleAssignDock}
                            disabled={isSavingDock}
                        >
                            <SelectTrigger className={`h-10 text-xs bg-white font-mono font-bold ${!selectedDockId ? 'border-amber-400 focus:ring-amber-400' : 'border-slate-300'}`}>
                                <SelectValue placeholder="Selecione a Doca de Saída..." />
                            </SelectTrigger>
                            <SelectContent>
                                {docks.map(d => (
                                    <SelectItem key={d.id} value={d.id} className="font-mono text-xs">
                                        {d.fullPath || d.code}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {isSavingDock && <Loader2 size={16} className="animate-spin text-teal-600" />}
                    </div>
                </div>
            </div>

            {/* PAINEL DE MÉTRICAS GLOBAIS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Previsto no Pedido</span>
                        <span className="text-xl font-mono font-extrabold text-slate-900">{checkingData?.totalExpected || 0}</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 text-slate-600 rounded-lg border border-slate-100"><Layers size={20} /></div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Separado no Coletor</span>
                        <span className="text-xl font-mono font-extrabold text-purple-700">{checkingData?.totalPicked || 0}</span>
                    </div>
                    <div className="p-2.5 bg-purple-50 text-purple-700 rounded-lg border border-purple-100"><Box size={20} /></div>
                </div>

                <div className="bg-white border border-teal-200 rounded-xl p-4 shadow-2xs flex items-center justify-between bg-teal-50/20">
                    <div>
                        <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider block">Total Conferido</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-mono font-extrabold text-teal-700">{checkingData?.totalChecked || 0}</span>
                            <span className="text-xs font-mono text-slate-400">({percentGlobal.toFixed(0)}%)</span>
                        </div>
                    </div>
                    <div className="p-2.5 bg-teal-100 text-teal-700 rounded-lg border border-teal-200"><ShieldCheck size={20} /></div>
                </div>
            </div>

            {/* BARRA DE PROGRESSO GERAL */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>Progresso da Conferência Física</span>
                    <span className="font-mono text-teal-700 font-bold">{checkingData?.totalChecked} / {checkingData?.totalExpected} un</span>
                </div>
                <Progress value={percentGlobal} className="h-2 bg-slate-100 [&>div]:bg-teal-600" />
            </div>

            {/* BANNER 100% CONFERIDO COM BOTÃO DE EXPEDIÇÃO */}
            {isFullyChecked && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-emerald-900 shadow-2xs">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                        <div>
                            <strong className="block text-sm font-bold">Conferência 100% Concluída com Sucesso!</strong>
                            <span>Todos os volumes físicos foram auditados contra o pedido. A ordem foi liberada para revisão tributária e emissão da NF-e.</span>
                        </div>
                    </div>
                    <Button
                        onClick={() => navigate(`/outbound/revisao-fiscal/${orderId}`)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 shrink-0 shadow-xs"
                    >
                        Emitir NF-e & Despachar Carga <ArrowRight size={14} className="ml-1.5" />
                    </Button>
                </div>
            )}

            {/* ÁREA DE LEITURA (SCANNER) + ITENS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* COLUNA ESQUERDA: BIPAGEM E ITENS (SKUs) */}
                <div className="lg:col-span-7 space-y-4">
                    {/* CARD DO SCANNER */}
                    <Card className="border-teal-200 bg-white shadow-xs">
                        <CardHeader className="p-3 border-b bg-teal-50/50 flex flex-row items-center justify-between">
                            <CardTitle className="text-xs uppercase font-bold text-teal-900 flex items-center gap-1.5">
                                <Barcode size={16} className="text-teal-600" /> Leitura / Bipagem de Volumes e Peças
                            </CardTitle>
                            <span className="text-[10px] text-slate-400 font-mono">LPN / Volume / SKU</span>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            {!selectedDockId ? (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2">
                                    <AlertCircle size={16} className="text-amber-600 shrink-0" />
                                    <span>Selecione a doca no painel acima para habilitar o leitor de conferência.</span>
                                </div>
                            ) : isParallelCheckingBlocked ? (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2">
                                    <Lock size={16} className="text-amber-600 shrink-0" />
                                    <span>Leitor bloqueado: conclua o packing dos itens fracionados para liberar a conferência.</span>
                                </div>
                            ) : null}

                            <form onSubmit={handleScanSubmit} className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                                    <div className="sm:col-span-8 space-y-1">
                                        <Label className="text-xs font-semibold text-slate-700">Código de Barras / LPN / Volume *</Label>
                                        <Input
                                            ref={inputRef}
                                            placeholder={
                                                isParallelCheckingBlocked
                                                    ? "Conferência bloqueada até o fim do packing..."
                                                    : !selectedDockId
                                                        ? "Aguardando seleção de doca..."
                                                        : "Bipe o LPN da HU, Volume VOL-... ou Código do SKU..."
                                            }
                                            value={scannedCode}
                                            onChange={(e) => setScannedCode(e.target.value)}
                                            disabled={isScanning || isFullyChecked || !selectedDockId || isParallelCheckingBlocked}
                                            autoFocus={!!selectedDockId && !isParallelCheckingBlocked}
                                            className="bg-white font-mono text-sm h-11 border-teal-300 focus-visible:ring-teal-500 font-bold disabled:bg-slate-50 disabled:text-slate-400"
                                        />
                                    </div>

                                    <div className="sm:col-span-4 space-y-1">
                                        <Label className="text-xs font-semibold text-slate-700">Qtd (Avulsos)</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                type="number"
                                                step="0.0001"
                                                value={scanQuantity}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setScanQuantity(e.target.value)}
                                                disabled={isScanning || isFullyChecked || !selectedDockId || isParallelCheckingBlocked}
                                                className="bg-white font-mono text-sm h-11 text-center border-teal-300 w-24 disabled:bg-slate-50 disabled:text-slate-400"
                                            />
                                            <Button
                                                type="submit"
                                                disabled={isScanning || !scannedCode.trim() || isFullyChecked || !selectedDockId || isParallelCheckingBlocked}
                                                className="bg-teal-600 hover:bg-teal-700 text-white font-bold h-11 flex-1 shadow-xs"
                                            >
                                                {isScanning ? <Loader2 size={16} className="animate-spin" /> : 'Conferir'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    {/* TABELA DE ITENS (SKUs) */}
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-3 border-b bg-slate-50/60 flex flex-row items-center justify-between">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <Layers size={16} className="text-teal-600" /> Baldes de Conferência por SKU ({checkingData?.items?.length || 0})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>SKU / Descrição</TableHead>
                                        <TableHead className="text-center font-mono text-xs">Previsto</TableHead>
                                        <TableHead className="text-center font-mono text-xs">Separado</TableHead>
                                        <TableHead className="text-center font-mono text-xs">Conferido</TableHead>
                                        <TableHead className="w-24 text-right">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {checkingData?.items?.map((item) => {
                                        const isComplete = item.isFullyChecked;
                                        return (
                                            <TableRow key={item.orderItemId} className={isComplete ? 'bg-teal-50/20' : 'hover:bg-slate-50/50'}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-mono font-bold text-xs text-slate-900">{item.skuCode}</span>
                                                        <span className="text-[11px] text-slate-500 truncate max-w-xs">{item.description}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-xs font-semibold text-slate-700">
                                                    {item.expectedQuantity} {item.unit}
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-xs text-purple-700 font-bold">
                                                    {item.pickedQuantity} {item.unit}
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-xs font-extrabold text-teal-700">
                                                    {item.checkedQuantity} {item.unit}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isComplete ? (
                                                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] gap-1">
                                                            <CheckCircle2 size={11} /> 100% OK
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]">
                                                            Faltam {item.expectedQuantity - item.checkedQuantity}
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* COLUNA DIREITA: VOLUMES E TRÍADE DE AUDITORIA */}
                <div className="lg:col-span-5 space-y-4">
                    <Card className="border-slate-200/80 bg-white shadow-xs">
                        <CardHeader className="p-3 border-b bg-slate-50/60 flex flex-row items-center justify-between">
                            <CardTitle className="text-xs uppercase font-bold text-slate-800 flex items-center gap-2">
                                <Box size={16} className="text-teal-600" /> Volumes e HUs ({checkingData?.volumes?.length || 0})
                            </CardTitle>
                            <span className="text-[10px] text-slate-400 font-mono">Tríade de Rastreabilidade</span>
                        </CardHeader>
                        <CardContent className="p-3 space-y-2.5 max-h-[580px] overflow-y-auto">
                            {!checkingData?.volumes || checkingData.volumes.length === 0 ? (
                                <div className="p-6 text-center text-xs text-slate-400 italic">
                                    Nenhum volume alocado para esta ordem ainda.
                                </div>
                            ) : (
                                checkingData.volumes.map((vol) => (
                                    <div
                                        key={vol.id}
                                        className={`p-3 rounded-xl border transition-all space-y-1.5 ${vol.isChecked
                                            ? 'border-emerald-200 bg-emerald-50/30'
                                            : vol.isPicked
                                                ? 'border-teal-200 bg-white hover:border-teal-300'
                                                : 'border-slate-200 bg-slate-50 opacity-70'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-xs text-slate-900">{vol.lpn}</span>
                                                <Badge variant="outline" className="font-mono text-[10px]">{vol.skuCode}</Badge>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-xs text-slate-800">
                                                    {vol.quantity} {vol.unit}
                                                </span>
                                                {vol.isChecked ? (
                                                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px] gap-1">
                                                        <CheckCircle2 size={11} /> Conferido
                                                    </Badge>
                                                ) : vol.isPicked ? (
                                                    <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                                                        Pronto p/ Bipar
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-slate-400 text-[10px]">
                                                        Em Separação
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {/* AUDITORIA NOMINAL (TRÍADE) */}
                                        <div className="pt-1.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-500">
                                            <div>
                                                <span className="text-slate-400 block uppercase">Separado por:</span>
                                                <span className="font-semibold text-slate-700">{vol.pickedByName || 'Aguardando'}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-slate-400 block uppercase">Conferido por:</span>
                                                <span className={vol.checkedByName ? 'font-bold text-teal-700' : 'text-slate-400'}>
                                                    {vol.checkedByName || 'Pendente'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* DIÁLOGO CONFIRMAÇÃO RESET */}
            <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                <AlertDialogContent className="bg-white sm:max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
                            <RotateCcw className="h-5 w-5 text-rose-600" /> Reinicializar Conferência da Ordem?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-600 space-y-2">
                            <span>
                                Deseja reinicializar todos os apontamentos de conferência da Ordem <strong className="text-slate-900 font-mono">#{checkingData?.orderNumber}</strong>?
                            </span>
                            <p className="text-slate-500">
                                As separações físicas (picking) e volumes gerados no packing serão preservados. Apenas os baldes de conferência voltarão a zero para nova contagem.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isResetting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => resetChecking({ orderId })}
                            disabled={isResetting}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                            {isResetting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                            Confirmar Reinicialização
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}