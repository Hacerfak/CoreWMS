import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { customInstance } from '@/api/orval-mutator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import {
    ArrowLeft, ArrowRight, Loader2, Truck, UserCheck, Sparkles,
    Save, Search, ChevronDown, CheckCircle2, X
} from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const outboundOrderHeaderSchema = z.object({
    customerId: z.string().min(1, 'Selecione o depositante.'),
    expectedShipDate: z.string().min(1, 'Data prevista de envio é obrigatória.'),
    orderNumber: z.string().optional().nullable(),
    invoiceNumber: z.string().optional().nullable(),
    invoiceSerie: z.string().optional().nullable(),
    accessKey: z.string().optional().nullable(),
    isReturnToCustomer: z.boolean().default(true),

    carrierCnpjCpf: z.string().optional().nullable(),
    carrierName: z.string().optional().nullable(),
    carrierStateRegistration: z.string().optional().nullable(),
    carrierAddress: z.string().optional().nullable(),
    carrierCity: z.string().optional().nullable(),
    carrierState: z.string().optional().nullable(),
    vehiclePlate: z.string().optional().nullable(),
    vehiclePlateState: z.string().optional().nullable(),
    freightModality: z.coerce.number().default(9),
    additionalNotes: z.string().optional().nullable()
});

// Componente Moderno de Seleção Pesquisável de Depositante
function SearchableCustomerSelect({ value, onChange, customers, disabled = false, error = false, placeholder = "Selecione o Depositante..." }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef(null);

    const selectedCustomer = customers.find(c => c.id === value);

    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return customers.slice(0, 30);
        const term = searchTerm.toLowerCase();
        const termDigits = searchTerm.replace(/\D/g, '');
        return customers.filter(c =>
            c.corporateName?.toLowerCase().includes(term) ||
            (termDigits && c.cnpj?.replace(/\D/g, '').includes(termDigits))
        ).slice(0, 30);
    }, [customers, searchTerm]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative w-full">
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between text-left transition-all focus:outline-none focus:ring-1 focus:ring-orange-500 ${error ? 'border-rose-500' : value ? 'border-orange-400 font-semibold text-slate-900' : 'border-slate-200 text-slate-500'
                    } ${disabled ? 'bg-slate-50 cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-slate-300'}`}
            >
                <span className="truncate">{selectedCustomer ? selectedCustomer.corporateName : placeholder}</span>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                    {value && !disabled && (
                        <X
                            size={13}
                            className="text-slate-400 hover:text-rose-600 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange('');
                            }}
                        />
                    )}
                    <ChevronDown size={14} className="text-slate-400" />
                </div>
            </button>

            {isOpen && !disabled && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Buscar por nome ou CNPJ..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-orange-500"
                        />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1">
                        {filteredCustomers.length === 0 ? (
                            <div className="p-2 text-center text-xs text-slate-400 italic">Nenhum depositante encontrado</div>
                        ) : (
                            filteredCustomers.map(cust => (
                                <div
                                    key={cust.id}
                                    onClick={() => {
                                        onChange(cust.id);
                                        setIsOpen(false);
                                        setSearchTerm('');
                                    }}
                                    className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between transition-colors ${value === cust.id ? 'bg-orange-50 text-orange-800 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                        }`}
                                >
                                    <div className="flex flex-col">
                                        <span className="truncate">{cust.corporateName}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">CNPJ: {cust.cnpj}</span>
                                    </div>
                                    {value === cust.id && <CheckCircle2 size={13} className="text-orange-600" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CreateOutboundOrderPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();
    const isEditMode = !!orderId;

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isConsultingCarrierSefaz, setIsConsultingCarrierSefaz] = useState(false);

    const [customers, setCustomers] = useState([]);

    const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(outboundOrderHeaderSchema),
        defaultValues: {
            customerId: '',
            expectedShipDate: '',
            orderNumber: '',
            invoiceNumber: '',
            invoiceSerie: '',
            accessKey: '',
            isReturnToCustomer: true,
            carrierCnpjCpf: '',
            carrierName: '',
            carrierStateRegistration: '',
            carrierAddress: '',
            carrierCity: '',
            carrierState: 'RS',
            vehiclePlate: '',
            vehiclePlateState: 'RS',
            freightModality: 9,
            additionalNotes: ''
        }
    });

    const selectedCustomerId = watch('customerId');
    const expectedShipDate = watch('expectedShipDate');
    const carrierCnpjCpf = watch('carrierCnpjCpf');
    const carrierState = watch('carrierState');
    const freightModality = watch('freightModality');
    const isSemFrete = Number(freightModality) === 9;

    useEffect(() => {
        customInstance({ url: '/api/customers/summary', method: 'GET' })
            .then(res => setCustomers(res || []))
            .catch(() => toast.error('Erro ao carregar depositantes.'));
    }, []);

    // Carrega dados no modo de Edição
    useEffect(() => {
        if (isEditMode) {
            setIsLoading(true);
            customInstance({ url: `/api/outbound/orders/${orderId}`, method: 'GET' })
                .then(order => {
                    const formattedDate = order.expectedShipDate
                        ? new Date(order.expectedShipDate).toISOString().split('T')[0]
                        : '';

                    reset({
                        customerId: order.customerId || '',
                        expectedShipDate: formattedDate,
                        orderNumber: order.orderNumber || '',
                        invoiceNumber: order.invoiceNumber || '',
                        invoiceSerie: order.invoiceSerie || '',
                        accessKey: order.accessKey || '',
                        isReturnToCustomer: true,
                        carrierCnpjCpf: order.carrierCnpjCpf || '',
                        carrierName: order.carrierName || '',
                        carrierStateRegistration: order.carrierStateRegistration || '',
                        carrierAddress: order.carrierAddress || '',
                        carrierCity: order.carrierCity || '',
                        carrierState: order.carrierState || 'RS',
                        vehiclePlate: order.vehiclePlate || '',
                        vehiclePlateState: order.vehiclePlateState || 'RS',
                        freightModality: order.freightModality ?? 9,
                        additionalNotes: order.additionalNotes || ''
                    });
                })
                .catch(() => toast.error('Erro ao carregar dados da ordem para edição.'))
                .finally(() => setIsLoading(false));
        }
    }, [orderId, isEditMode, reset]);

    const handleConsultCarrierSefaz = async () => {
        const cleanCnpj = (carrierCnpjCpf || '').replace(/\D/g, '');
        if (cleanCnpj.length !== 14) return toast.warning('Digite um CNPJ válido com 14 dígitos para consultar.');

        setIsConsultingCarrierSefaz(true);
        try {
            const sefazData = await customInstance({
                url: `/api/customers/consult-sefaz/${cleanCnpj}?uf=${carrierState || 'RS'}`,
                method: 'POST'
            });

            toast.success('Dados da transportadora sincronizados da SEFAZ!');
            setValue('carrierName', sefazData.corporateName || '');
            setValue('carrierStateRegistration', sefazData.stateRegistration || '');

            const addressParts = [
                sefazData.street,
                sefazData.number,
                sefazData.complement,
                sefazData.neighborhood
            ].filter(Boolean);

            setValue('carrierAddress', addressParts.join(', ') || '');
            setValue('carrierCity', sefazData.cityName || '');
            setValue('carrierState', sefazData.state || carrierState || 'RS');

            if (!watch('vehiclePlateState')) {
                setValue('vehiclePlateState', sefazData.state || 'RS');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Não foi possível consultar a transportadora na SEFAZ.');
        } finally {
            setIsConsultingCarrierSefaz(false);
        }
    };

    const onSubmit = async (data) => {
        try {
            setIsSaving(true);
            const isNoFreight = Number(data.freightModality) === 9;

            const cleanPayload = {
                ...data,
                isReturnToCustomer: true,
                freightModality: Number(data.freightModality),
                expectedShipDate: new Date(data.expectedShipDate).toISOString(),

                // Limpa campos se a modalidade for 9 (Sem Frete)
                carrierCnpjCpf: !isNoFreight && data.carrierCnpjCpf ? data.carrierCnpjCpf.replace(/\D/g, '') : null,
                carrierName: !isNoFreight ? (data.carrierName?.trim() || null) : null,
                carrierStateRegistration: !isNoFreight ? (data.carrierStateRegistration?.trim() || null) : null,
                carrierAddress: !isNoFreight ? (data.carrierAddress?.trim() || null) : null,
                carrierCity: !isNoFreight ? (data.carrierCity?.trim() || null) : null,
                carrierState: !isNoFreight ? (data.carrierState?.trim()?.toUpperCase() || null) : null,
                vehiclePlate: !isNoFreight ? (data.vehiclePlate?.trim()?.toUpperCase() || null) : null,
                vehiclePlateState: !isNoFreight ? (data.vehiclePlateState?.trim()?.toUpperCase() || null) : null
            };

            if (isEditMode) {
                await customInstance({
                    url: `/api/outbound/orders/${orderId}`,
                    method: 'PUT',
                    data: { id: orderId, ...cleanPayload }
                });
                toast.success('Cabeçalho da Ordem de Saída atualizado com sucesso!');
                navigate(`/outbound/ordem/${orderId}/itens`);
            } else {
                const res = await customInstance({
                    url: '/api/outbound/orders',
                    method: 'POST',
                    data: cleanPayload
                });
                toast.success(`Ordem ${res.orderNumber} criada com sucesso!`);
                navigate(`/outbound/ordem/${res.id}/itens`);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar ordem de saída.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                <p className="text-xs text-slate-500 font-medium">Carregando dados da ordem...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => navigate('/outbound')}
                        className="shrink-0 text-slate-500 hover:text-slate-900"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                            {isEditMode ? 'Editar Ordem de Saída' : 'Nova Ordem de Saída Manual'}
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">Defina as informações de retorno de estoque ao depositante e dados de transporte.</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/outbound')} disabled={isSaving}>Cancelar</Button>
                    <Button onClick={handleSubmit(onSubmit)} disabled={isSaving} className="bg-orange-600 hover:bg-orange-700 text-white font-bold min-w-[170px]">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : isEditMode ? <Save className="h-4 w-4 mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                        {isEditMode ? 'Salvar Alterações' : 'Avançar para Itens'}
                    </Button>
                </div>
            </div>

            {/* FORMULÁRIO */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 overflow-y-auto pr-1 flex-1">
                {/* BLOCO 1: ORIGEM & IDENTIFICAÇÃO */}
                <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                        <UserCheck className="text-orange-600" size={18} /> 1. Origem & Identificação
                    </h3>

                    {/* Linha Superior: Depositante (6 cols), Data Prevista (3 cols) e Nº do Pedido (3 cols) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="space-y-1.5 md:col-span-6">
                            <Label className="text-slate-800 font-semibold text-xs">Depositante (Dono do Estoque) *</Label>
                            <SearchableCustomerSelect
                                disabled={isEditMode}
                                value={selectedCustomerId}
                                onChange={(val) => setValue('customerId', val, { shouldValidate: true })}
                                customers={customers}
                                error={!!errors.customerId}
                                placeholder="Selecione o depositante..."
                            />
                            {errors.customerId && <p className="text-xs text-rose-500">{errors.customerId.message}</p>}
                        </div>

                        <div className="space-y-1.5 md:col-span-3">
                            <Label className="text-slate-800 font-semibold text-xs">Data Prevista de Envio *</Label>
                            <DatePicker
                                date={expectedShipDate}
                                setDate={(d) => setValue('expectedShipDate', d ? d.toISOString().split('T')[0] : '', { shouldValidate: true })}
                                placeholder="DD/MM/AAAA"
                            />
                            {errors.expectedShipDate && <p className="text-xs text-rose-500">{errors.expectedShipDate.message}</p>}
                        </div>

                        <div className="space-y-1.5 md:col-span-3">
                            <Label className="text-xs">Nº do Pedido / Solicitação</Label>
                            <Input
                                {...register('orderNumber')}
                                placeholder="Opcional (ex: RET-1001)"
                                className="font-mono text-xs bg-white h-9"
                            />
                        </div>
                    </div>

                    {/* Linha Intermediária: Dados da NF-e e Chave de Acesso Expandida (7 cols) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 border-t border-slate-100 pt-3">
                        <div className="space-y-1.5 md:col-span-3">
                            <Label className="text-xs">Nº NF-e Ref. (Opcional)</Label>
                            <Input
                                {...register('invoiceNumber')}
                                placeholder="Ex: 1250"
                                className="font-mono text-xs bg-white h-9"
                            />
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-xs">Série NF-e</Label>
                            <Input
                                {...register('invoiceSerie')}
                                placeholder="Ex: 1"
                                className="font-mono text-xs bg-white h-9"
                            />
                        </div>

                        <div className="space-y-1.5 md:col-span-7">
                            <Label className="text-xs">Chave de Acesso Referenciada</Label>
                            <Input
                                maxLength={44}
                                {...register('accessKey')}
                                placeholder="44 dígitos da chave de acesso da NF-e referenciada..."
                                className="font-mono text-xs bg-white h-9 tracking-wider"
                            />
                        </div>
                    </div>

                    {/* Observações da Ordem: Mais Alta e com Expansão Vertical */}
                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                        <Label className="text-xs font-semibold text-slate-800">
                            Observações Adicionais da Ordem / Instruções (infCpl)
                        </Label>
                        <textarea
                            rows={3}
                            {...register('additionalNotes')}
                            placeholder="Ex: Entregar apenas no período da manhã. Ref. Pedido de Compra #1234..."
                            className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-y min-h-[76px] font-sans transition-all"
                        />
                    </div>
                </div>

                {/* BLOCO 2: TRANSPORTADORA, VEÍCULO & FRETE (Seção 2 de Regra Fiscal suprimida para ordens manuais) */}
                <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                        <Truck className="text-orange-600" size={18} /> 2. Transportadora, Veículo & Frete
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5 md:col-span-3">
                            <Label className="text-xs">Modalidade do Frete *</Label>
                            <Select value={watch('freightModality')?.toString()} onValueChange={(val) => setValue('freightModality', Number(val))}>
                                <SelectTrigger className="text-xs bg-white h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="9">9 - Sem Ocorrência de Transporte (Padrão)</SelectItem>
                                    <SelectItem value="0">0 - Contratação do Frete por conta do Remetente (CIF)</SelectItem>
                                    <SelectItem value="1">1 - Contratação do Frete por conta do Destinatário (FOB)</SelectItem>
                                    <SelectItem value="2">2 - Contratação do Frete por conta de Terceiros</SelectItem>
                                    <SelectItem value="3">3 - Transporte Próprio por conta do Remetente</SelectItem>
                                    <SelectItem value="4">4 - Transporte Próprio por conta do Destinatário</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* SELEÇÃO CONDICIONAL: CASO MODALIDADE SEJA 9 (SEM FRETE) */}
                    {isSemFrete ? (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs text-slate-600">
                            <div className="flex items-center gap-2 font-bold text-slate-800">
                                <Badge variant="outline" className="font-mono text-xs">modFrete = 9</Badge> Sem Ocorrência de Transporte
                            </div>
                            <p className="leading-relaxed">
                                Para ordens com modalidade sem frete, a SEFAZ dispensa o preenchimento de transportadora, placa de veículo e volumes de transporte. O XML da NF-e conterá apenas a indicação legal <code className="font-mono text-slate-800 font-bold">&lt;modFrete&gt;9&lt;/modFrete&gt;</code>.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4 pt-2 border-t border-slate-100">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">CNPJ Transportadora</Label>
                                    <div className="flex gap-2">
                                        <Input {...register('carrierCnpjCpf')} placeholder="00.000.000/0000-00" className="font-mono text-xs flex-1 bg-white h-9" />
                                        <Button
                                            type="button" variant="outline"
                                            onClick={handleConsultCarrierSefaz}
                                            disabled={isConsultingCarrierSefaz}
                                            className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 text-xs h-9 shrink-0"
                                        >
                                            {isConsultingCarrierSefaz ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                                            SEFAZ
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Inscrição Estadual Transportadora</Label>
                                    <Input {...register('carrierStateRegistration')} placeholder="IE..." className="font-mono text-xs bg-white h-9" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100 pt-3">
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-xs">Nome / Razão Social Transportadora</Label>
                                    <Input {...register('carrierName')} placeholder="Razão social da transportadora" className="text-xs bg-white h-9" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Placa do Veículo</Label>
                                    <Input {...register('vehiclePlate')} placeholder="Ex: ABC1D23" className="font-mono uppercase text-xs bg-white h-9" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">UF da Placa</Label>
                                    <Select value={watch('vehiclePlateState')} onValueChange={(val) => setValue('vehiclePlateState', val)}>
                                        <SelectTrigger className="text-xs bg-white h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100 pt-3">
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-xs">Endereço da Transportadora (xEnder)</Label>
                                    <Input {...register('carrierAddress')} placeholder="Rua, Número, Bairro..." className="text-xs bg-white h-9" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Município (xMun)</Label>
                                    <Input {...register('carrierCity')} placeholder="Cidade da transportadora" className="text-xs bg-white h-9" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">UF da Transportadora (UF) *</Label>
                                    <Select value={watch('carrierState')} onValueChange={(val) => setValue('carrierState', val)}>
                                        <SelectTrigger className="text-xs bg-white font-mono font-bold h-9"><SelectValue placeholder="UF" /></SelectTrigger>
                                        <SelectContent>
                                            {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
}