import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    ArrowLeft, ArrowRight, Loader2, Truck, UserCheck, Sparkles, Building2, FileText
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
    destinationCity: z.string().optional().nullable(),
    destinationState: z.string().optional().nullable(),
    destinationZipCode: z.string().optional().nullable(),
    carrierCnpjCpf: z.string().optional().nullable(),
    carrierName: z.string().optional().nullable(),
    vehiclePlate: z.string().optional().nullable(),
    vehiclePlateState: z.string().optional().nullable(),
    additionalNotes: z.string().optional().nullable()
});

export default function CreateOutboundOrderPage() {
    const navigate = useNavigate();
    const [isSaving, setIsSaving] = useState(false);
    const [isConsultingDestSefaz, setIsConsultingDestSefaz] = useState(false);
    const [isConsultingCarrierSefaz, setIsConsultingCarrierSefaz] = useState(false);

    const [customers, setCustomers] = useState([]);

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
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
            destinationCity: '',
            destinationState: 'RS',
            destinationZipCode: '',
            carrierCnpjCpf: '',
            carrierName: '',
            vehiclePlate: '',
            vehiclePlateState: 'RS',
            additionalNotes: ''
        }
    });

    const isReturnToCustomer = watch('isReturnToCustomer');
    const selectedCustomerId = watch('customerId');
    const destCnpjCpf = watch('destinationCnpjCpf');
    const destState = watch('destinationState');
    const carrierCnpjCpf = watch('carrierCnpjCpf');
    const carrierState = watch('vehiclePlateState');

    // Carrega a lista de depositantes no início
    useEffect(() => {
        customInstance({ url: '/api/customers/summary', method: 'GET' })
            .then(res => setCustomers(res || []))
            .catch(() => toast.error('Erro ao carregar depositantes.'));
    }, []);

    // Consulta SEFAZ para Destinatário
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
            setValue('destinationCity', sefazData.cityName || '');
            setValue('destinationState', sefazData.state || destState);
            setValue('destinationZipCode', sefazData.zipCode || '');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Não foi possível consultar os dados na SEFAZ.');
        } finally {
            setIsConsultingDestSefaz(false);
        }
    };

    // Consulta SEFAZ para Transportadora
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
                carrierCnpjCpf: data.carrierCnpjCpf ? data.carrierCnpjCpf.replace(/\D/g, '') : null,
                expectedShipDate: new Date(data.expectedShipDate).toISOString()
            };

            const res = await customInstance({
                url: '/api/outbound/orders',
                method: 'POST',
                data: cleanPayload
            });

            toast.success(`Cabeçalho da Ordem ${res.orderNumber} criado com sucesso!`);
            // Redireciona para o painel interativo de seleção de itens/estoque
            navigate(`/outbound/ordem/${res.id}/itens`);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao criar ordem de saída.');
        } finally {
            setIsSaving(false);
        }
    };

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
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nova Ordem de Saída Manual</h1>
                        <p className="text-xs text-slate-500 mt-0.5">Etapa 1 de 2: Defina as informações básicas do pedido, destinatário e transporte.</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/outbound')} disabled={isSaving}>Cancelar</Button>
                    <Button onClick={handleSubmit(onSubmit)} disabled={isSaving} className="bg-orange-600 hover:bg-orange-700 text-white font-bold min-w-[170px]">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                        Avançar para Itens
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
                            <Label className="text-slate-800 font-semibold">Depositante (Dono do Estoque) *</Label>
                            <Select value={selectedCustomerId} onValueChange={(val) => setValue('customerId', val, { shouldValidate: true })}>
                                <SelectTrigger className={errors.customerId ? 'border-rose-500' : ''}>
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
                            <Label className="text-slate-800 font-semibold">Data Prevista de Envio *</Label>
                            <Input type="date" {...register('expectedShipDate')} className={errors.expectedShipDate ? 'border-rose-500 text-xs' : 'text-xs'} />
                            {errors.expectedShipDate && <p className="text-xs text-rose-500">{errors.expectedShipDate.message}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100 pt-3">
                        <div className="space-y-1.5">
                            <Label>Nº do Pedido</Label>
                            <Input {...register('orderNumber')} placeholder="Opcional (ex: PED-1001)" className="font-mono text-xs" />
                        </div>

                        <div className="space-y-1.5">
                            <Label>Nº da NF-e</Label>
                            <Input {...register('invoiceNumber')} placeholder="Ex: 1250" className="font-mono text-xs" />
                        </div>

                        <div className="space-y-1.5">
                            <Label>Série NF-e</Label>
                            <Input {...register('invoiceSerie')} placeholder="Ex: 1" className="font-mono text-xs" />
                        </div>

                        <div className="space-y-1.5">
                            <Label>Chave de Acesso (44 dígitos)</Label>
                            <Input
                                maxLength={44}
                                {...register('accessKey')}
                                placeholder="3523..."
                                className="font-mono text-xs"
                            />
                        </div>
                    </div>
                </div>

                {/* BLOCO 2: TIPO DE ENVIO & DESTINATÁRIO */}
                <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                        <Building2 className="text-orange-600" size={18} /> 2. Tipo de Envio & Destinatário Final *
                    </h3>

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-700">Selecione a Finalidade do Envio *</Label>
                        <RadioGroup
                            value={isReturnToCustomer ? 'return' : 'third_party'}
                            onValueChange={(v) => setValue('isReturnToCustomer', v === 'return')}
                            className="flex gap-6 pt-1"
                        >
                            <div className="flex items-center space-x-2 cursor-pointer">
                                <RadioGroupItem value="return" id="r-return" />
                                <Label htmlFor="r-return" className="cursor-pointer font-semibold text-slate-800 text-xs">
                                    Retorno para o Próprio Depositante (Devolução / Retorno Simbólico)
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2 cursor-pointer">
                                <RadioGroupItem value="third_party" id="r-third" />
                                <Label htmlFor="r-third" className="cursor-pointer font-semibold text-slate-800 text-xs">
                                    Entrega a Terceiros (Cliente Final)
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {!isReturnToCustomer && (
                        <div className="space-y-4 animate-in fade-in duration-200 pt-1">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label>CNPJ / CPF Destinatário</Label>
                                    <div className="flex gap-2">
                                        <Input {...register('destinationCnpjCpf')} placeholder="00.000.000/0000-00" className="font-mono text-xs flex-1" />
                                        <Button
                                            type="button" variant="outline"
                                            onClick={handleConsultDestSefaz}
                                            disabled={isConsultingDestSefaz}
                                            className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 text-xs h-9"
                                        >
                                            {isConsultingDestSefaz ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                                            SEFAZ
                                        </Button>
                                    </div>
                                </div>

                                <div className="md:col-span-2 space-y-1.5">
                                    <Label>Nome / Razão Social Destinatário</Label>
                                    <Input {...register('destinationName')} className="text-xs" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-2 space-y-1.5">
                                    <Label>Cidade</Label>
                                    <Input {...register('destinationCity')} className="text-xs" />
                                </div>

                                <div className="space-y-1.5">
                                    <Label>UF</Label>
                                    <Select value={watch('destinationState')} onValueChange={(val) => setValue('destinationState', val)}>
                                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>CEP</Label>
                                    <Input {...register('destinationZipCode')} className="font-mono text-xs" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* BLOCO 3: TRANSPORTADORA & VEÍCULO */}
                <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                        <Truck className="text-orange-600" size={18} /> 3. Transportadora & Veículo
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label>CNPJ Transportadora</Label>
                            <div className="flex gap-2">
                                <Input {...register('carrierCnpjCpf')} placeholder="00.000.000/0000-00" className="font-mono text-xs flex-1" />
                                <Button
                                    type="button" variant="outline"
                                    onClick={handleConsultCarrierSefaz}
                                    disabled={isConsultingCarrierSefaz}
                                    className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50 text-xs h-9"
                                >
                                    {isConsultingCarrierSefaz ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                                    SEFAZ
                                </Button>
                            </div>
                        </div>

                        <div className="md:col-span-2 space-y-1.5">
                            <Label>Nome Transportadora</Label>
                            <Input {...register('carrierName')} className="text-xs" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-100 pt-3">
                        <div className="space-y-1.5">
                            <Label>Placa do Veículo</Label>
                            <Input {...register('vehiclePlate')} placeholder="Ex: ABC1D23" className="font-mono uppercase text-xs" />
                        </div>

                        <div className="space-y-1.5">
                            <Label>UF da Placa</Label>
                            <Select value={watch('vehiclePlateState')} onValueChange={(val) => setValue('vehiclePlateState', val)}>
                                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="md:col-span-2 space-y-1.5">
                            <Label>Observações Adicionais / Instruções de Entrega</Label>
                            <Input {...register('additionalNotes')} placeholder="Ex: Entregar apenas no período da manhã..." className="text-xs" />
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}