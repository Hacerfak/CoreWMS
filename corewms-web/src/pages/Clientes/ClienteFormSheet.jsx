import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
    usePostApiCustomersConsultSefazCnpj,
    usePostApiCustomers,
    usePutApiCustomersId
} from '@/api/generated/customers/customers';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Building2, MapPin, Settings2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

// 1. Zod Schema
const customerSchema = z.object({
    cnpj: z.string().min(14, 'CNPJ obrigatório.'),
    corporateName: z.string().min(3, 'Razão Social é obrigatória.'),
    tradeName: z.string().optional().nullable(),
    stateRegistration: z.string().optional().nullable(),
    municipalRegistration: z.string().optional().nullable(),
    crt: z.coerce.number().min(1, 'Selecione o CRT.'),
    cnae: z.string().optional().nullable(),
    email: z.string().email('E-mail inválido.').or(z.literal('')).optional().nullable(),
    phone: z.string().optional().nullable(),
    zipCode: z.string().optional().nullable(),
    street: z.string().optional().nullable(),
    number: z.string().optional().nullable(),
    complement: z.string().optional().nullable(),
    neighborhood: z.string().optional().nullable(),
    cityName: z.string().optional().nullable(),
    cityCode: z.coerce.number().optional().nullable(),
    state: z.string().length(2, 'UF inválida.'),
    requireBatchControl: z.boolean().default(false),
    requireExpirationControl: z.boolean().default(false),
    requireSerialControl: z.boolean().default(false),
    allowNegativeStock: z.boolean().default(false),
    autoApproveReceiving: z.boolean().default(false),
});

export default function ClienteFormSheet({ open, onOpenChange, clienteToEdit = null }) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('dados-gerais');
    const isEditing = !!clienteToEdit;

    // 2. React Hook Form Setup
    const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(customerSchema),
        defaultValues: { state: 'RS', crt: 1 }
    });

    useEffect(() => {
        if (open) {
            reset(clienteToEdit || {
                cnpj: '', corporateName: '', tradeName: '', stateRegistration: '', municipalRegistration: '',
                crt: 1, cnae: '', email: '', phone: '', zipCode: '', street: '', number: '',
                complement: '', neighborhood: '', cityName: '', cityCode: 0, state: 'RS',
                requireBatchControl: false, requireExpirationControl: false, requireSerialControl: false,
                allowNegativeStock: false, autoApproveReceiving: false
            });
            setActiveTab('dados-gerais');
        }
    }, [clienteToEdit, open, reset]);

    const watchCnpj = watch('cnpj');
    const watchState = watch('state');

    // Mutações API
    const { mutate: consultSefaz, isPending: isSefazPending } = usePostApiCustomersConsultSefazCnpj({
        mutation: {
            onSuccess: (sefazData) => {
                toast.success('Dados importados com sucesso da SEFAZ!');
                // Auto-preenchimento rápido com setValue
                setValue('corporateName', sefazData.corporateName || '', { shouldValidate: true });
                setValue('tradeName', sefazData.tradeName || '');
                setValue('stateRegistration', sefazData.stateRegistration || '');
                setValue('crt', sefazData.crt ?? 1);
                setValue('cnae', sefazData.cnae || '');
                setValue('street', sefazData.street || '');
                setValue('number', sefazData.number || '');
                setValue('complement', sefazData.complement || '');
                setValue('neighborhood', sefazData.neighborhood || '');
                setValue('cityCode', sefazData.cityCode || 0);
                setValue('cityName', sefazData.cityName || '');
                setValue('state', sefazData.state || watchState);
                setValue('zipCode', sefazData.zipCode || '');
            },
            onError: (err) => toast.error(err.response?.data?.detail || err.response?.data?.message || 'Erro ao consultar SEFAZ.')
        }
    });

    const { mutate: createCustomer, isPending: isCreating } = usePostApiCustomers({
        mutation: {
            onSuccess: () => {
                toast.success('Cliente cadastrado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao cadastrar cliente.')
        }
    });

    const { mutate: updateCustomer, isPending: isUpdating } = usePutApiCustomersId({
        mutation: {
            onSuccess: () => {
                toast.success('Cliente atualizado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar cliente.')
        }
    });

    const handleConsultSefaz = () => {
        const cleanCnpj = (watchCnpj || '').replace(/\D/g, '');
        if (cleanCnpj.length !== 14) return toast.warning('Digite um CNPJ válido com 14 dígitos.');
        if (!watchState) return toast.warning('Selecione a UF.');
        consultSefaz({ cnpj: cleanCnpj, params: { uf: watchState } });
    };

    const onSubmit = (data) => {
        const cleanPayload = {
            ...data,
            cnpj: data.cnpj.replace(/\D/g, '')
        };

        if (isEditing) updateCustomer({ id: clienteToEdit.id, data: cleanPayload });
        else createCustomer({ data: cleanPayload });
    };

    const isSaving = isCreating || isUpdating;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:w-[850px] !max-w-[850px] flex flex-col p-0 bg-white shadow-2xl">
                <SheetHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <SheetTitle className="text-xl font-bold text-slate-900">
                        {isEditing ? 'Editar Cliente Depositante' : 'Novo Cliente Depositante'}
                    </SheetTitle>
                    <SheetDescription className="text-slate-500">
                        {isEditing ? 'Atualize os dados e regras deste parceiro.' : 'Insira o CNPJ, escolha a UF e clique em SEFAZ para auto-preencher.'}
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                        <div className="px-6 border-b border-slate-100 bg-white">
                            <TabsList className="bg-transparent h-12 gap-3 p-0">
                                <TabsTrigger value="dados-gerais" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2 px-4">
                                    <Building2 size={16} /> Dados Gerais
                                </TabsTrigger>
                                <TabsTrigger value="endereco" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2 px-4">
                                    <MapPin size={16} /> Endereço
                                </TabsTrigger>
                                <TabsTrigger value="regras-wms" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2 px-4">
                                    <Settings2 size={16} /> Regras WMS
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6">
                            {/* DADOS GERAIS */}
                            <TabsContent value="dados-gerais" className="mt-0 space-y-5">
                                <div className="bg-blue-50/40 p-5 rounded-xl border border-blue-100 space-y-2">
                                    <div className="flex items-end gap-4">
                                        <div className="flex-1 space-y-1.5">
                                            <Label htmlFor="cnpj" className="text-slate-700 font-medium">CNPJ *</Label>
                                            <Input
                                                id="cnpj" placeholder="00.000.000/0000-00"
                                                {...register('cnpj')}
                                                disabled={isEditing}
                                                className={`bg-white font-mono h-10 ${errors.cnpj ? 'border-rose-500' : ''}`}
                                            />
                                            {errors.cnpj && <p className="text-xs text-rose-500">{errors.cnpj.message}</p>}
                                        </div>
                                        <div className="w-28 space-y-1.5">
                                            <Label className="text-slate-700 font-medium">UF *</Label>
                                            <Select value={watchState} onValueChange={(val) => setValue('state', val)} disabled={isEditing}>
                                                <SelectTrigger className={`bg-white h-10 ${errors.state ? 'border-rose-500' : ''}`}>
                                                    <SelectValue placeholder="UF" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            type="button" variant="outline"
                                            onClick={handleConsultSefaz}
                                            disabled={isSefazPending || isEditing}
                                            className="bg-white hover:bg-blue-600 hover:text-white border-blue-200 text-blue-700 font-medium px-6 h-10"
                                        >
                                            {isSefazPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                            SEFAZ
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Razão Social *</Label>
                                    <Input {...register('corporateName')} className={`h-10 ${errors.corporateName ? 'border-rose-500' : ''}`} />
                                    {errors.corporateName && <p className="text-xs text-rose-500">{errors.corporateName.message}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Nome Fantasia</Label>
                                    <Input {...register('tradeName')} className="h-10" />
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-2 space-y-1.5">
                                        <Label className="text-slate-900 font-semibold">Regime Tributário (CRT) *</Label>
                                        <Select value={String(watch('crt') || '1')} onValueChange={(val) => setValue('crt', Number(val))}>
                                            <SelectTrigger className={`bg-white h-10 ${errors.crt ? 'border-rose-500' : ''}`}>
                                                <SelectValue placeholder="Selecione o CRT" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 - Simples Nacional</SelectItem>
                                                <SelectItem value="2">2 - Simples Nac. (Excesso Sublimite)</SelectItem>
                                                <SelectItem value="3">3 - Regime Normal (Lucro Pres./Real)</SelectItem>
                                                <SelectItem value="4">4 - Simples Nacional (MEI)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {errors.crt && <p className="text-xs text-rose-500">{errors.crt.message}</p>}
                                    </div>
                                    <div className="col-span-1 space-y-1.5">
                                        <Label>CNAE Principal</Label>
                                        <Input {...register('cnae')} placeholder="Ex: 4930-2/02" className="bg-white font-mono h-10" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Inscrição Estadual (IE)</Label>
                                        <Input {...register('stateRegistration')} className="h-10" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Inscrição Municipal (IM)</Label>
                                        <Input {...register('municipalRegistration')} className="h-10" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>E-mail de Contato</Label>
                                        <Input type="email" {...register('email')} className="h-10" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Telefone</Label>
                                        <Input {...register('phone')} className="h-10" />
                                    </div>
                                </div>
                            </TabsContent>

                            {/* ENDEREÇO */}
                            <TabsContent value="endereco" className="mt-0 space-y-5">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>CEP</Label>
                                        <Input {...register('zipCode')} className="h-10 font-mono" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Estado (UF)</Label>
                                        <Select value={watchState} onValueChange={(val) => setValue('state', val, { shouldValidate: true })}>
                                            <SelectTrigger className={`bg-white h-10 ${errors.state ? 'border-rose-500' : ''}`}>
                                                <SelectValue placeholder="UF" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Código IBGE</Label>
                                        <Input type="number" {...register('cityCode')} className="h-10 font-mono" />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Cidade</Label>
                                    <Input {...register('cityName')} className="h-10" />
                                </div>

                                <div className="grid grid-cols-4 gap-4">
                                    <div className="col-span-3 space-y-1.5">
                                        <Label>Logradouro / Rua</Label>
                                        <Input {...register('street')} className="h-10" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Número</Label>
                                        <Input {...register('number')} className="h-10" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Bairro</Label>
                                        <Input {...register('neighborhood')} className="h-10" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Complemento</Label>
                                        <Input {...register('complement')} className="h-10" />
                                    </div>
                                </div>
                            </TabsContent>

                            {/* REGRAS LOGÍSTICAS WMS */}
                            <TabsContent value="regras-wms" className="mt-0 space-y-4">
                                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200/80 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Controle de Lote</Label>
                                            <p className="text-xs text-slate-500">Exige informe de Lote na entrada e movimentação de estoque.</p>
                                        </div>
                                        <Switch checked={watch('requireBatchControl')} onCheckedChange={(val) => setValue('requireBatchControl', val)} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Controle de Data de Validade</Label>
                                            <p className="text-xs text-slate-500">Bloqueia e alerta produtos próximos ao vencimento (FEFO).</p>
                                        </div>
                                        <Switch checked={watch('requireExpirationControl')} onCheckedChange={(val) => setValue('requireExpirationControl', val)} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Rastreabilidade por Número de Série</Label>
                                            <p className="text-xs text-slate-500">Exige bipe de série individual para cada unidade.</p>
                                        </div>
                                        <Switch checked={watch('requireSerialControl')} onCheckedChange={(val) => setValue('requireSerialControl', val)} />
                                    </div>
                                    <div className="flex items-center justify-between border-t border-slate-200 pt-5">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Permitir Saldo Negativo</Label>
                                            <p className="text-xs text-slate-500">Permite expedição mesmo sem confirmação física no endereço.</p>
                                        </div>
                                        <Switch checked={watch('allowNegativeStock')} onCheckedChange={(val) => setValue('allowNegativeStock', val)} />
                                    </div>
                                    <div className="flex items-center justify-between border-t border-slate-200 pt-5">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Aprovação Automática de Recebimento</Label>
                                            <p className="text-xs text-slate-500">Libera o estoque imediatamente após a conferência cega.</p>
                                        </div>
                                        <Switch checked={watch('autoApproveReceiving')} onCheckedChange={(val) => setValue('autoApproveReceiving', val)} />
                                    </div>
                                </div>
                            </TabsContent>
                        </div>

                        <SheetFooter className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="px-5">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSaving} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[130px] px-6">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar</>}
                            </Button>
                        </SheetFooter>
                    </Tabs>
                </form>
            </SheetContent>
        </Sheet>
    );
}