import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { customInstance } from '@/api/orval-mutator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
    ArrowLeft, ArrowRight, Loader2, Truck, UserCheck, Sparkles, Building2, MapPin, Save
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
    isReturnToCustomer: z.boolean().default(false),

    destinationCnpjCpf: z.string().optional().nullable(),
    destinationName: z.string().optional().nullable(),
    destinationStateRegistration: z.string().optional().nullable(),
    destinationIeIndicator: z.coerce.number().default(9),
    destinationStreet: z.string().optional().nullable(),
    destinationNumber: z.string().optional().nullable(),
    destinationComplement: z.string().optional().nullable(),
    destinationNeighborhood: z.string().optional().nullable(),
    destinationCityCode: z.coerce.number().default(0),
    destinationCity: z.string().optional().nullable(),
    destinationState: z.string().optional().nullable(),
    destinationZipCode: z.string().optional().nullable(),

    carrierCnpjCpf: z.string().optional().nullable(),
    carrierName: z.string().optional().nullable(),
    carrierStateRegistration: z.string().optional().nullable(),
    vehiclePlate: z.string().optional().nullable(),
    vehiclePlateState: z.string().optional().nullable(),
    freightModality: z.coerce.number().default(9),
    additionalNotes: z.string().optional().nullable()
});

export default function CreateOutboundOrderPage() {
    const { id: orderId } = useParams();
    const navigate = useNavigate();
    const isEditMode = !!orderId;

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isConsultingDestSefaz, setIsConsultingDestSefaz] = useState(false);
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
            isReturnToCustomer: false,
            destinationCnpjCpf: '',
            destinationName: '',
            destinationStateRegistration: '',
            destinationIeIndicator: 9,
            destinationStreet: '',
            destinationNumber: '',
            destinationComplement: '',
            destinationNeighborhood: '',
            destinationCityCode: 0,
            destinationCity: '',
            destinationState: 'RS',
            destinationZipCode: '',
            carrierCnpjCpf: '',
            carrierName: '',
            carrierStateRegistration: '',
            vehiclePlate: '',
            vehiclePlateState: 'RS',
            freightModality: 9,
            additionalNotes: ''
        }
    });

    const isReturnToCustomer = watch('isReturnToCustomer');
    const selectedCustomerId = watch('customerId');
    const destCnpjCpf = watch('destinationCnpjCpf');
    const destState = watch('destinationState');
    const carrierCnpjCpf = watch('carrierCnpjCpf');
    const carrierState = watch('vehiclePlateState');

    useEffect(() => {
        customInstance({ url: '/api/customers/summary', method: 'GET' })
            .then(res => setCustomers(res || []))
            .catch(() => toast.error('Erro ao carregar depositantes.'));
    }, []);

    // Carrega dados da ordem se for Edição
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
                        isReturnToCustomer: !!order.isReturnToCustomer,
                        destinationCnpjCpf: order.destinationCnpjCpf || '',
                        destinationName: order.destinationName || '',
                        destinationStateRegistration: order.destinationStateRegistration || '',
                        destinationIeIndicator: order.destinationIeIndicator ?? 9,
                        destinationStreet: order.destinationStreet || '',
                        destinationNumber: order.destinationNumber || '',
                        destinationComplement: order.destinationComplement || '',
                        destinationNeighborhood: order.destinationNeighborhood || '',
                        destinationCityCode: order.destinationCityCode || 0,
                        destinationCity: order.destinationCity || '',
                        destinationState: order.destinationState || 'RS',
                        destinationZipCode: order.destinationZipCode || '',
                        carrierCnpjCpf: order.carrierCnpjCpf || '',
                        carrierName: order.carrierName || '',
                        carrierStateRegistration: order.carrierStateRegistration || '',
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

    const handleConsultDestSefaz = async () => {
        const cleanCnpj = (destCnpjCpf || '').replace(/\D/g, '');
        if (cleanCnpj.length !== 14) return toast.warning('Digite um CNPJ válido com 14 dígitos para consultar.');

        setIsConsultingDestSefaz(true);
        try {
            const sefazData = await customInstance({
                url: `/api/customers/consult-sefaz/${cleanCnpj}?uf=${destState}`,
                method: 'POST'
            });

            toast.success('Dados do destinatário sincronizados da SEFAZ!');
            setValue('destinationName', sefazData.corporateName || '');
            setValue('destinationStateRegistration', sefazData.stateRegistration || '');
            setValue('destinationIeIndicator', sefazData.stateRegistration ? 1 : 9);
            setValue('destinationStreet', sefazData.street || '');
            setValue('destinationNumber', sefazData.number || '');
            setValue('destinationComplement', sefazData.complement || '');
            setValue('destinationNeighborhood', sefazData.neighborhood || '');
            setValue('destinationCityCode', sefazData.cityCode || 0);
            setValue('destinationCity', sefazData.cityName || '');
            setValue('destinationState', sefazData.state || destState);
            setValue('destinationZipCode', sefazData.zipCode || '');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Não foi possível consultar os dados na SEFAZ.');
        } finally {
            setIsConsultingDestSefaz(false);
        }
    };

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
        } catch (error) {
            toast.error(error.response?.data?.message || 'Não foi possível consultar a transportadora na SEFAZ.');
        } finally {
            setIsConsultingCarrierSefaz(false);
        }
    };

    const onSubmit = async (data) => {
        try {
            setIsSaving(true);
            const cleanPayload = {
                ...data,
                destinationCnpjCpf: data.destinationCnpjCpf ? data.destinationCnpjCpf.replace(/\D/g, '') : null,
                destinationZipCode: data.destinationZipCode ? data.destinationZipCode.replace(/\D/g, '') : null,
                carrierCnpjCpf: data.carrierCnpjCpf ? data.carrierCnpjCpf.replace(/\D/g, '') : null,
                destinationIeIndicator: Number(data.destinationIeIndicator),
                destinationCityCode: Number(data.destinationCityCode),
                freightModality: Number(data.freightModality),
                expectedShipDate: new Date(data.expectedShipDate).toISOString()
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
                        <p className="text-xs text-slate-500 mt-0.5">Defina as informações cadastrais, fiscais e de transporte da ordem.</p>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-slate-800 font-semibold text-xs">Depositante (Dono do Estoque) *</Label>
                            <Select
                                disabled={isEditMode}
                                value={selectedCustomerId}
                                onValueChange={(val) => setValue('customerId', val, { shouldValidate: true })}
                            >
                                <SelectTrigger className={errors.customerId ? 'border-rose-500 text-xs' : 'text-xs bg-white'}>
                                    <SelectValue placeholder="Selecione o depositante..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {customers.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.customerId && <p className="text-xs text-rose-500">{errors.customerId.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-slate-800 font-semibold text-xs">Data Prevista de Envio *</Label>
                            <Input type="date" {...register('expectedShipDate')} className={errors.expectedShipDate ? 'border-rose-500 text-xs' : 'text-xs bg-white'} />
                            {errors.expectedShipDate && <p className="text-xs text-rose-500">{errors.expectedShipDate.message}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100 pt-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Nº do Pedido</Label>
                            <Input {...register('orderNumber')} placeholder="Opcional (ex: PED-1001)" className="font-mono text-xs bg-white" />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Nº da NF-e Venda/ERP</Label>
                            <Input {...register('invoiceNumber')} placeholder="Ex: 1250" className="font-mono text-xs bg-white" />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Série NF-e</Label>
                            <Input {...register('invoiceSerie')} placeholder="Ex: 1" className="font-mono text-xs bg-white" />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Chave de Acesso (44 dígitos)</Label>
                            <Input
                                maxLength={44}
                                {...register('accessKey')}
                                placeholder="3523..."
                                className="font-mono text-xs bg-white"
                            />
                        </div>
                    </div>
                </div>

                {/* BLOCO 2: TIPO DE ENVIO & ENDEREÇO SEFAZ DESTINATÁRIO */}
                <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                        <Building2 className="text-orange-600" size={18} /> 2. Destinatário Final & Dados Fiscais *
                    </h3>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-700">Finalidade da Operação *</Label>
                        <RadioGroup
                            value={isReturnToCustomer ? 'return' : 'third_party'}
                            onValueChange={(v) => setValue('isReturnToCustomer', v === 'return')}
                            className="flex gap-6 pt-1"
                        >
                            <div className="flex items-center space-x-2 cursor-pointer">
                                <RadioGroupItem value="return" id="r-return" />
                                <Label htmlFor="r-return" className="cursor-pointer font-semibold text-slate-800 text-xs">
                                    Retorno para o Próprio Depositante (Devolução / Retorno Simbólico - CFOP 5906)
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2 cursor-pointer">
                                <RadioGroupItem value="third_party" id="r-third" />
                                <Label htmlFor="r-third" className="cursor-pointer font-semibold text-slate-800 text-xs">
                                    Entrega a Terceiros (Venda por Conta e Ordem - CFOP 5923)
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {!isReturnToCustomer && (
                        <div className="space-y-4 animate-in fade-in duration-200 pt-1">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-xs">CNPJ / CPF Destinatário *</Label>
                                    <div className="flex gap-2">
                                        <Input {...register('destinationCnpjCpf')} placeholder="00.000.000/0000-00" className="font-mono text-xs flex-1 bg-white" />
                                        <Button
                                            type="button" variant="outline"
                                            onClick={handleConsultDestSefaz}
                                            disabled={isConsultingDestSefaz}
                                            className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 text-xs h-9 shrink-0"
                                        >
                                            {isConsultingDestSefaz ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                                            SEFAZ
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-xs">Razão Social / Nome Completo *</Label>
                                    <Input {...register('destinationName')} className="text-xs bg-white" placeholder="Razão social..." />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Inscrição Estadual (IE)</Label>
                                    <Input {...register('destinationStateRegistration')} placeholder="Isento se vazio" className="font-mono text-xs bg-white" />
                                </div>

                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-xs">Indicador de IE SEFAZ *</Label>
                                    <Select value={watch('destinationIeIndicator')?.toString()} onValueChange={(val) => setValue('destinationIeIndicator', Number(val))}>
                                        <SelectTrigger className="text-xs bg-white"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">1 - Contribuinte ICMS</SelectItem>
                                            <SelectItem value="2">2 - Contribuinte Isento</SelectItem>
                                            <SelectItem value="9">9 - Não Contribuinte</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 space-y-3">
                                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <MapPin size={14} className="text-orange-600" /> Endereço de Entrega Destinatário
                                </Label>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-xs">Logradouro / Rua</Label>
                                        <Input {...register('destinationStreet')} className="text-xs bg-white" placeholder="Ex: Av. Brasil" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Número</Label>
                                        <Input {...register('destinationNumber')} className="text-xs bg-white font-mono" placeholder="Ex: 1000" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Complemento</Label>
                                        <Input {...register('destinationComplement')} className="text-xs bg-white" placeholder="Ex: Sala 201" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                    <div className="space-y-1.5 md:col-span-2">
                                        <Label className="text-xs">Bairro</Label>
                                        <Input {...register('destinationNeighborhood')} className="text-xs bg-white" placeholder="Ex: Centro" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Cidade</Label>
                                        <Input {...register('destinationCity')} className="text-xs bg-white" placeholder="Cidade..." />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Cód. IBGE Cidade</Label>
                                        <Input type="number" {...register('destinationCityCode')} className="font-mono text-xs bg-white" placeholder="Ex: 4305108" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs">UF / CEP</Label>
                                        <div className="flex gap-2">
                                            <Select value={watch('destinationState')} onValueChange={(val) => setValue('destinationState', val)}>
                                                <SelectTrigger className="text-xs bg-white w-20"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <Input {...register('destinationZipCode')} placeholder="CEP..." className="font-mono text-xs bg-white flex-1" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* BLOCO 3: TRANSPORTADORA, VEÍCULO & FRETE */}
                <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                        <Truck className="text-orange-600" size={18} /> 3. Transportadora, Veículo & Frete
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Modalidade do Frete *</Label>
                            <Select value={watch('freightModality')?.toString()} onValueChange={(val) => setValue('freightModality', Number(val))}>
                                <SelectTrigger className="text-xs bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">0 - Contratação pelo Remetente (CIF)</SelectItem>
                                    <SelectItem value="1">1 - Contratação pelo Destinatário (FOB)</SelectItem>
                                    <SelectItem value="2">2 - Contratação por Terceiros</SelectItem>
                                    <SelectItem value="9">9 - Sem Ocorrência de Transporte</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">CNPJ Transportadora</Label>
                            <div className="flex gap-2">
                                <Input {...register('carrierCnpjCpf')} placeholder="00.000.000/0000-00" className="font-mono text-xs flex-1 bg-white" />
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
                            <Input {...register('carrierStateRegistration')} placeholder="IE..." className="font-mono text-xs bg-white" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100 pt-3">
                        <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-xs">Nome / Razão Social Transportadora</Label>
                            <Input {...register('carrierName')} className="text-xs bg-white" />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Placa do Veículo</Label>
                            <Input {...register('vehiclePlate')} placeholder="Ex: ABC1D23" className="font-mono uppercase text-xs bg-white" />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">UF da Placa</Label>
                            <Select value={watch('vehiclePlateState')} onValueChange={(val) => setValue('vehiclePlateState', val)}>
                                <SelectTrigger className="text-xs bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                        <Label className="text-xs">Observações Adicionais / Instruções de Entrega (infCpl)</Label>
                        <Input {...register('additionalNotes')} placeholder="Ex: Entregar apenas no período da manhã..." className="text-xs bg-white" />
                    </div>
                </div>
            </form>
        </div>
    );
}