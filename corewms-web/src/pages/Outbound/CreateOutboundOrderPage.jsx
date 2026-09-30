import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { customInstance } from '@/api/orval-mutator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Save, Loader2, Plus, Trash2, Truck, UserCheck, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const itemSchema = z.object({
    productId: z.string().min(1, 'Selecione o produto.'),
    lineNumber: z.coerce.number().min(1),
    quantity: z.coerce.number().min(0.0001, 'Informe a quantidade.'),
    unitValue: z.coerce.number().min(0, 'Valor não pode ser negativo.')
});

const outboundOrderSchema = z.object({
    customerId: z.string().min(1, 'Selecione o depositante.'),
    orderNumber: z.string().min(1, 'Número do pedido é obrigatório.').max(50),
    destinationCnpjCpf: z.string().min(11, 'Informe o CNPJ ou CPF do destinatário.'),
    destinationName: z.string().min(3, 'Nome do destinatário é obrigatório.'),
    destinationCity: z.string().min(2, 'Cidade é obrigatória.'),
    destinationState: z.string().length(2, 'UF é obrigatória.'),
    destinationZipCode: z.string().optional().nullable(),
    carrierCnpjCpf: z.string().optional().nullable(),
    carrierName: z.string().optional().nullable(),
    additionalNotes: z.string().optional().nullable(),
    expectedShipDate: z.string().optional().nullable(),
    items: z.array(itemSchema).min(1, 'Adicione pelo menos um produto ao pedido.')
});

export default function CreateOutboundOrderPage() {
    const navigate = useNavigate();
    const [isSaving, setIsSaving] = useState(false);

    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [isLoadingProducts, setIsLoadingCustomerProducts] = useState(false);

    const { register, control, handleSubmit, setValue, watch, formState: { errors } } = useForm({
        resolver: zodResolver(outboundOrderSchema),
        defaultValues: {
            customerId: '',
            orderNumber: '',
            destinationCnpjCpf: '',
            destinationName: '',
            destinationCity: '',
            destinationState: 'RS',
            destinationZipCode: '',
            carrierCnpjCpf: '',
            carrierName: '',
            additionalNotes: '',
            expectedShipDate: '',
            items: [{ productId: '', lineNumber: 1, quantity: 1, unitValue: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({ control, name: 'items' });
    const selectedCustomerId = watch('customerId');

    // 1. Carrega a lista resumida de depositantes ao montar a página
    useEffect(() => {
        customInstance({ url: '/api/customers/summary', method: 'GET' })
            .then(res => setCustomers(res || []))
            .catch(() => toast.error('Erro ao carregar depositantes.'));
    }, []);

    // 2. Quando o depositante é alterado, busca os SKUs/Produtos daquele depositante sob demanda
    useEffect(() => {
        if (!selectedCustomerId) {
            setProducts([]);
            return;
        }

        setIsLoadingCustomerProducts(true);
        customInstance({ url: `/api/products?CustomerId=${selectedCustomerId}&PageSize=500`, method: 'GET' })
            .then(res => setProducts(res?.items || []))
            .catch(() => toast.error('Erro ao carregar produtos do depositante.'))
            .finally(() => setIsLoadingCustomerProducts(false));
    }, [selectedCustomerId]);

    const handleProductChange = (index, productId) => {
        setValue(`items.${index}.productId`, productId, { shouldValidate: true });
    };

    const onSubmit = async (data) => {
        try {
            setIsSaving(true);
            const cleanPayload = {
                ...data,
                destinationCnpjCpf: data.destinationCnpjCpf.replace(/\D/g, ''),
                carrierCnpjCpf: data.carrierCnpjCpf ? data.carrierCnpjCpf.replace(/\D/g, '') : null,
                expectedShipDate: data.expectedShipDate ? new Date(data.expectedShipDate).toISOString() : null
            };

            const res = await customInstance({
                url: '/api/outbound/orders',
                method: 'POST',
                data: cleanPayload
            });

            toast.success(`Pedido NF ${data.orderNumber} criado com sucesso!`);
            navigate('/outbound');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao criar pedido de saída.');
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
                        <p className="text-xs text-slate-500 mt-0.5">Cadastre o pedido de envio, destinatário e itens para reserva de estoque WMS.</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/outbound')} disabled={isSaving}>Cancelar</Button>
                    <Button onClick={handleSubmit(onSubmit)} disabled={isSaving} className="bg-orange-600 hover:bg-orange-700 text-white font-bold">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Salvar Ordem
                    </Button>
                </div>
            </div>

            {/* FORMULÁRIO */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 overflow-y-auto pr-1 flex-1">
                {/* BLOCOS 1 e 2: ORIGEM E DESTINATÁRIO */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* DADOS DE ORIGEM E PEDIDO */}
                    <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                            <UserCheck className="text-orange-600" size={18} /> 1. Origem & Identificação
                        </h3>

                        <div className="space-y-1.5">
                            <Label>Depositante (Dono do Estoque) *</Label>
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Nº do Pedido / NF-e *</Label>
                                <Input {...register('orderNumber')} placeholder="Ex: 10542" className={`font-mono ${errors.orderNumber ? 'border-rose-500' : ''}`} />
                                {errors.orderNumber && <p className="text-xs text-rose-500">{errors.orderNumber.message}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <Label>Data Prevista de Envio</Label>
                                <Input type="date" {...register('expectedShipDate')} className="text-xs" />
                            </div>
                        </div>
                    </div>

                    {/* DADOS DO DESTINATÁRIO */}
                    <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                            <Truck className="text-orange-600" size={18} /> 2. Destinatário Final & Entrega
                        </h3>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-1 space-y-1.5">
                                <Label>CNPJ / CPF *</Label>
                                <Input {...register('destinationCnpjCpf')} placeholder="00.000.000/0000-00" className={`font-mono ${errors.destinationCnpjCpf ? 'border-rose-500' : ''}`} />
                                {errors.destinationCnpjCpf && <p className="text-xs text-rose-500">{errors.destinationCnpjCpf.message}</p>}
                            </div>

                            <div className="col-span-2 space-y-1.5">
                                <Label>Nome / Razão Social Destinatário *</Label>
                                <Input {...register('destinationName')} className={errors.destinationName ? 'border-rose-500' : ''} />
                                {errors.destinationName && <p className="text-xs text-rose-500">{errors.destinationName.message}</p>}
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                            <div className="col-span-2 space-y-1.5">
                                <Label>Cidade *</Label>
                                <Input {...register('destinationCity')} className={errors.destinationCity ? 'border-rose-500' : ''} />
                            </div>

                            <div className="col-span-1 space-y-1.5">
                                <Label>UF *</Label>
                                <Select value={watch('destinationState')} onValueChange={(val) => setValue('destinationState', val)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {ESTADOS_BR.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="col-span-1 space-y-1.5">
                                <Label>CEP</Label>
                                <Input {...register('destinationZipCode')} className="font-mono text-xs" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* BLOCO 3: TRANSPORTADORA E OBSERVAÇÕES */}
                <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                    <h3 className="font-bold text-slate-900 text-sm border-b pb-3">3. Transportadora & Observações Fiscais</h3>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label>CNPJ Transportadora</Label>
                            <Input {...register('carrierCnpjCpf')} className="font-mono text-xs" />
                        </div>

                        <div className="col-span-2 space-y-1.5">
                            <Label>Nome Transportadora</Label>
                            <Input {...register('carrierName')} className="text-xs" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Observações Adicionais / Instruções de Entrega</Label>
                        <Input {...register('additionalNotes')} placeholder="Ex: Entregar apenas no período da manhã..." className="text-xs" />
                    </div>
                </div>

                {/* BLOCO 4: ITENS DO PEDIDO */}
                <div className="bg-white border border-slate-200/60 rounded-xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                        <div>
                            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                <PackagePlus className="text-orange-600" size={18} /> 4. Itens do Pedido ({fields.length})
                            </h3>
                            <p className="text-xs text-slate-500">Selecione os produtos cadastrados do depositante e as quantidades desejadas.</p>
                        </div>

                        <Button
                            type="button"
                            onClick={() => append({ productId: '', lineNumber: fields.length + 1, quantity: 1, unitValue: 0 })}
                            disabled={!selectedCustomerId || isLoadingProducts}
                            className="bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100 text-xs h-8"
                        >
                            <Plus size={14} className="mr-1 text-orange-600" /> Adicionar Produto
                        </Button>
                    </div>

                    {errors.items && <p className="text-xs text-rose-500 font-semibold">{errors.items.root?.message || 'Verifique os produtos informados.'}</p>}

                    {!selectedCustomerId ? (
                        <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl bg-slate-50 text-xs">
                            Selecione o <strong>Depositante</strong> no bloco 1 para carregar a lista de produtos disponíveis.
                        </div>
                    ) : (
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="w-12">#</TableHead>
                                        <TableHead>Produto / SKU *</TableHead>
                                        <TableHead className="w-36">Quantidade *</TableHead>
                                        <TableHead className="w-36">Valor Unitário (R$)</TableHead>
                                        <TableHead className="w-12 text-right"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono font-bold text-slate-500 text-xs">
                                                #{index + 1}
                                            </TableCell>

                                            <TableCell>
                                                <Select
                                                    value={watch(`items.${index}.productId`)}
                                                    onValueChange={(v) => handleProductChange(index, v)}
                                                >
                                                    <SelectTrigger className={errors.items?.[index]?.productId ? 'border-rose-500' : ''}>
                                                        <SelectValue placeholder={isLoadingProducts ? "Carregando produtos..." : "Selecione o produto SKU..."} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {products.map(p => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                <span className="font-mono font-bold">{p.sku}</span> - {p.description}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>

                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    step="0.0001"
                                                    {...register(`items.${index}.quantity`)}
                                                    className="font-mono text-xs"
                                                />
                                            </TableCell>

                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    {...register(`items.${index}.unitValue`)}
                                                    className="font-mono text-xs"
                                                />
                                            </TableCell>

                                            <TableCell className="text-right">
                                                {fields.length > 1 && (
                                                    <Button
                                                        type="button" variant="ghost" size="sm"
                                                        onClick={() => remove(index)}
                                                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-md"
                                                    >
                                                        <Trash2 size={15} />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
}