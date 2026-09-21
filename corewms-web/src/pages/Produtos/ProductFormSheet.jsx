import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiCustomers } from '@/api/generated/customers/customers';

// Importa apenas os produtos daqui
import { usePostApiProducts, usePutApiProductsId } from '@/api/generated/products/products';

// Importação do hook do novo ficheiro
import { useGetApiPackagingTypes } from '@/api/generated/packaging-types/packaging-types';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Package, Settings2, FileText, Box, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// Zod Schema Alinhado ao Backend
const packagingSchema = z.object({
    id: z.string().optional().nullable(),
    packagingTypeId: z.string().min(1, 'Selecione o tipo.'),
    barcode: z.string().optional().nullable(),
    conversionFactor: z.coerce.number().min(1, 'Min 1'),
    isDefaultInbound: z.boolean().default(false),
    isDefaultOutbound: z.boolean().default(false),
    allowFractionalPicking: z.boolean().default(true),
    grossWeight: z.coerce.number().min(0),
    netWeight: z.coerce.number().min(0),
    lengthMm: z.coerce.number().min(0),
    widthMm: z.coerce.number().min(0),
    heightMm: z.coerce.number().min(0)
});

const productSchema = z.object({
    customerId: z.string().min(1, 'Depositante obrigatório.'),
    sku: z.string().min(1, 'SKU obrigatório.'),
    description: z.string().min(3, 'Descrição obrigatória.'),
    baseUnit: z.string().min(1, 'Unidade Base obrigatória.'),
    baseBarcode: z.string().optional().nullable(),
    ncm: z.string().optional().nullable(),
    cest: z.string().optional().nullable(),
    origin: z.coerce.number().default(0),
    maxStacking: z.coerce.number().min(1, 'Min 1'),

    tracksBatch: z.boolean().default(false),
    strictBatch: z.boolean().default(false),
    tracksManufacture: z.boolean().default(false),
    strictManufacture: z.boolean().default(false),
    tracksExpiration: z.boolean().default(false),
    strictExpiration: z.boolean().default(false),
    tracksSerial: z.boolean().default(false),
    strictSerial: z.boolean().default(false),

    pickingStrategy: z.coerce.number().min(1),
    pickingBaseDate: z.coerce.number().min(1),
    inboundShelfLifeToleranceDays: z.coerce.number().optional().nullable(),
    outboundShelfLifeToleranceDays: z.coerce.number().optional().nullable(),
    packagings: z.array(packagingSchema).min(1, 'Adicione pelo menos uma embalagem (ex: Unidade Mestre).')
});

export default function ProductFormSheet({ open, onOpenChange, productToEdit }) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('dados');
    const isEditing = !!productToEdit;

    // Combos Data
    const { data: customers = [] } = useGetApiCustomers({ OnlyActive: true });

    // Atualização da chamada do hook
    const { data: packagingTypes = [] } = useGetApiPackagingTypes();

    const { register, control, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(productSchema),
        defaultValues: {
            customerId: '', sku: '', description: '', baseUnit: 'UN', origin: 0, maxStacking: 1, pickingStrategy: 1, pickingBaseDate: 1,
            tracksBatch: false, strictBatch: false, tracksManufacture: false, strictManufacture: false,
            tracksExpiration: false, strictExpiration: false, tracksSerial: false, strictSerial: false,
            packagings: [{ packagingTypeId: '', conversionFactor: 1, isDefaultInbound: true, isDefaultOutbound: true, allowFractionalPicking: false, grossWeight: 0, netWeight: 0, lengthMm: 0, widthMm: 0, heightMm: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({ control, name: 'packagings' });

    useEffect(() => {
        if (open) {
            if (productToEdit) {
                reset({ ...productToEdit, customerId: productToEdit.customerId });
            } else {
                reset({
                    customerId: '', sku: '', description: '', baseUnit: 'UN', baseBarcode: '', origin: 0, maxStacking: 1, pickingStrategy: 1, pickingBaseDate: 1,
                    tracksBatch: false, strictBatch: false, tracksManufacture: false, strictManufacture: false,
                    tracksExpiration: false, strictExpiration: false, tracksSerial: false, strictSerial: false,
                    packagings: [{ packagingTypeId: '', conversionFactor: 1, isDefaultInbound: true, isDefaultOutbound: true, allowFractionalPicking: false, grossWeight: 0, netWeight: 0, lengthMm: 0, widthMm: 0, heightMm: 0 }]
                });
            }
            setActiveTab('dados');
        }
    }, [open, productToEdit, reset]);

    const { mutate: createProduct, isPending: isCreating } = usePostApiProducts({
        mutation: {
            onSuccess: () => { toast.success('Produto criado!'); queryClient.invalidateQueries({ queryKey: ['/api/products'] }); onOpenChange(false); },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar produto.')
        }
    });

    const { mutate: updateProduct, isPending: isUpdating } = usePutApiProductsId({
        mutation: {
            onSuccess: () => { toast.success('Produto atualizado!'); queryClient.invalidateQueries({ queryKey: ['/api/products'] }); onOpenChange(false); },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar produto.')
        }
    });

    const onSubmit = (data) => {
        // Validações Manuais Visuais Antes de Enviar
        if (data.pickingStrategy === 2 && !data.tracksExpiration) {
            toast.error("A estratégia FEFO exige que o 'Controle de Validade' esteja habilitado nas Regras WMS.");
            setActiveTab('regras');
            return;
        }

        const defaultIn = data.packagings.filter(p => p.isDefaultInbound).length;
        const defaultOut = data.packagings.filter(p => p.isDefaultOutbound).length;
        if (defaultIn !== 1 || defaultOut !== 1) {
            toast.error("Você deve marcar EXATAMENTE UMA embalagem como Padrão de Recebimento e UMA como Padrão de Expedição.");
            setActiveTab('embalagens');
            return;
        }

        isEditing ? updateProduct({ id: productToEdit.id, data }) : createProduct({ data });
    };

    // A Herança Perfeita do Depositante
    const handleCustomerChange = (customerId) => {
        setValue('customerId', customerId, { shouldValidate: true });
        if (!isEditing) {
            const customer = customers.find(c => c.id === customerId);
            if (customer) {
                setValue('tracksBatch', customer.tracksBatch);
                setValue('strictBatch', customer.strictBatch);
                setValue('tracksManufacture', customer.tracksManufacture);
                setValue('strictManufacture', customer.strictManufacture);
                setValue('tracksExpiration', customer.tracksExpiration);
                setValue('strictExpiration', customer.strictExpiration);
                setValue('tracksSerial', customer.tracksSerial);
                setValue('strictSerial', customer.strictSerial);
                setValue('pickingStrategy', customer.defaultPickingStrategy);
                setValue('pickingBaseDate', customer.defaultPickingBaseDate);
                toast.info("Regras logísticas pré-carregadas a partir do Depositante.");
            }
        }
    };

    // Helper Visual
    const renderToggle = (title, desc, trackField, strictField) => (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div>
                    <Label className="text-sm text-slate-900 font-bold">{title}</Label>
                    <p className="text-[10px] text-slate-500">{desc}</p>
                </div>
                <Switch
                    checked={watch(trackField)}
                    onCheckedChange={(v) => { setValue(trackField, v); if (!v) setValue(strictField, false); }}
                />
            </div>
            {watch(trackField) && (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 ml-2 animate-in slide-in-from-top-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                        <Checkbox checked={watch(strictField)} onCheckedChange={(v) => setValue(strictField, v)} />
                        <span className="text-rose-700">Exigência Fiscal Obrigatória</span>
                    </label>
                </div>
            )}
        </div>
    );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:w-[950px] !max-w-[950px] flex flex-col p-0 bg-white shadow-2xl">
                <SheetHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <SheetTitle className="text-xl font-bold text-slate-900">{isEditing ? 'Editar Produto' : 'Novo Produto'}</SheetTitle>
                    <SheetDescription className="text-slate-500">Configure as regras logísticas e a árvore de embalagens.</SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                        <div className="px-6 border-b border-slate-100 bg-white">
                            <TabsList className="bg-transparent h-12 gap-3 p-0">
                                <TabsTrigger value="dados" className="data-[state=active]:bg-slate-100 gap-2 px-4"><Package size={16} /> Básicos</TabsTrigger>
                                <TabsTrigger value="fiscal" className="data-[state=active]:bg-slate-100 gap-2 px-4"><FileText size={16} /> Fiscal</TabsTrigger>
                                <TabsTrigger value="regras" className="data-[state=active]:bg-slate-100 gap-2 px-4"><Settings2 size={16} /> WMS & Capacidade</TabsTrigger>
                                <TabsTrigger value="embalagens" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 gap-2 px-4"><Box size={16} /> Volumes & Conversão</TabsTrigger>
                            </TabsList>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">

                            {/* ABA BÁSICOS */}
                            <TabsContent value="dados" className="space-y-4 mt-0">
                                <div className="space-y-1.5">
                                    <Label>Depositante (Cliente) *</Label>
                                    <Select value={watch('customerId')} onValueChange={handleCustomerChange} disabled={isEditing}>
                                        <SelectTrigger className={errors.customerId ? 'border-rose-500' : ''}><SelectValue placeholder="Selecione o dono da mercadoria" /></SelectTrigger>
                                        <SelectContent>
                                            {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.corporateName}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1.5 col-span-2">
                                        <Label>SKU *</Label>
                                        <Input {...register('sku')} className={`font-mono uppercase ${errors.sku ? 'border-rose-500' : ''}`} disabled={isEditing} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Unidade Base (Fiscal) *</Label>
                                        <Input {...register('baseUnit')} placeholder="Ex: UN, KG" className="font-mono uppercase" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Descrição Completa *</Label>
                                    <Input {...register('description')} className={errors.description ? 'border-rose-500' : ''} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Código de Barras Base (EAN/GTIN)</Label>
                                    <Input {...register('baseBarcode')} className="font-mono" />
                                </div>
                            </TabsContent>

                            {/* ABA FISCAL */}
                            <TabsContent value="fiscal" className="space-y-4 mt-0">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>NCM</Label>
                                        <Input {...register('ncm')} className="font-mono" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>CEST</Label>
                                        <Input {...register('cest')} className="font-mono" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Origem da Mercadoria</Label>
                                    <Select value={String(watch('origin') || '0')} onValueChange={(v) => setValue('origin', Number(v))}>
                                        <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0">0 - Nacional</SelectItem>
                                            <SelectItem value="1">1 - Estrangeira (Importação Direta)</SelectItem>
                                            <SelectItem value="2">2 - Estrangeira (Mercado Interno)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </TabsContent>

                            {/* ABA WMS */}
                            <TabsContent value="regras" className="space-y-6 mt-0">
                                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200/80 space-y-5">
                                    <h3 className="font-bold text-slate-800 text-sm border-b pb-2">Controles de Rastreabilidade</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        {renderToggle('Lote / Partida', 'Tracking interno WMS', 'tracksBatch', 'strictBatch')}
                                        {renderToggle('Data de Fabricação', 'Produção industrial', 'tracksManufacture', 'strictManufacture')}
                                        {renderToggle('Data de Validade', 'Vencimento para FEFO', 'tracksExpiration', 'strictExpiration')}
                                        {renderToggle('Número de Série', 'Serialização de unitários', 'tracksSerial', 'strictSerial')}
                                    </div>

                                    <h3 className="font-bold text-slate-800 text-sm border-b pb-2 pt-4">Motor de Separação & Físico</h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label>Estratégia de Fila</Label>
                                            <Select value={String(watch('pickingStrategy'))} onValueChange={(val) => setValue('pickingStrategy', Number(val))}>
                                                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="1">FIFO (Primeiro que Entra, Sai)</SelectItem>
                                                    <SelectItem value="2" disabled={!watch('tracksExpiration')}>FEFO (Primeiro que Vence, Sai)</SelectItem>
                                                    <SelectItem value="3">LIFO (Último que Entra, Sai)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Data Base Analisada</Label>
                                            <Select value={String(watch('pickingBaseDate'))} onValueChange={(val) => setValue('pickingBaseDate', Number(val))} disabled={watch('pickingStrategy') == 2}>
                                                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="1">Data Física WMS</SelectItem>
                                                    <SelectItem value="2">Data Sistêmica WMS</SelectItem>
                                                    <SelectItem value="3">Data Emissão NF-e</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Limite Empilhamento (Blocado)</Label>
                                            <Input type="number" {...register('maxStacking')} className="bg-white" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                                        <div className="space-y-1.5"><Label>Tol. Recebimento (Dias Vida Útil)</Label><Input type="number" {...register('inboundShelfLifeToleranceDays')} placeholder="Ex: Bloqueia se < 30 dias" /></div>
                                        <div className="space-y-1.5"><Label>Tol. Expedição (Dias Vida Útil)</Label><Input type="number" {...register('outboundShelfLifeToleranceDays')} placeholder="Ex: Não expede se < 10 dias" /></div>
                                    </div>
                                </div>
                            </TabsContent>

                            {/* ABA EMBALAGENS (FIELD ARRAY) */}
                            <TabsContent value="embalagens" className="space-y-4 mt-0">
                                {errors.packagings && <div className="bg-rose-50 text-rose-600 text-sm p-3 rounded-md">{errors.packagings.root?.message || 'Verifique as informações das embalagens.'}</div>}
                                {fields.map((item, index) => (
                                    <div key={item.id} className="relative p-5 border border-slate-200 rounded-xl bg-slate-50/50 space-y-4">
                                        <div className="absolute top-4 right-4">
                                            {fields.length > 1 && (
                                                <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="text-rose-500 hover:bg-rose-50 h-8 w-8 p-0"><Trash2 size={16} /></Button>
                                            )}
                                        </div>
                                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Box size={16} /> Embalagem #{index + 1}</h4>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="space-y-1.5">
                                                <Label>Tipo de Embalagem *</Label>
                                                <Select value={watch(`packagings.${index}.packagingTypeId`)} onValueChange={(v) => setValue(`packagings.${index}.packagingTypeId`, v, { shouldValidate: true })}>
                                                    <SelectTrigger className={errors?.packagings?.[index]?.packagingTypeId ? 'border-rose-500' : ''}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                                    <SelectContent>
                                                        {packagingTypes.map(pt => <SelectItem key={pt.id} value={pt.id}>{pt.code} - {pt.description}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Fator de Conversão *</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input type="number" step="0.0001" {...register(`packagings.${index}.conversionFactor`)} className={errors?.packagings?.[index]?.conversionFactor ? 'border-rose-500' : ''} />
                                                    <span className="text-xs font-mono text-slate-500">{watch('baseUnit')}</span>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>Cód. Barras (DUN/ITF)</Label>
                                                <Input {...register(`packagings.${index}.barcode`)} className="font-mono" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-5 gap-3">
                                            <div className="space-y-1.5"><Label className="text-xs">Peso Bruto (KG)</Label><Input type="number" step="0.001" {...register(`packagings.${index}.grossWeight`)} className="h-8 text-xs" /></div>
                                            <div className="space-y-1.5"><Label className="text-xs">Peso Líq. (KG)</Label><Input type="number" step="0.001" {...register(`packagings.${index}.netWeight`)} className="h-8 text-xs" /></div>
                                            <div className="space-y-1.5"><Label className="text-xs">Comp. (mm)</Label><Input type="number" step="0.1" {...register(`packagings.${index}.lengthMm`)} className="h-8 text-xs" /></div>
                                            <div className="space-y-1.5"><Label className="text-xs">Largura (mm)</Label><Input type="number" step="0.1" {...register(`packagings.${index}.widthMm`)} className="h-8 text-xs" /></div>
                                            <div className="space-y-1.5"><Label className="text-xs">Altura (mm)</Label><Input type="number" step="0.1" {...register(`packagings.${index}.heightMm`)} className="h-8 text-xs" /></div>
                                        </div>
                                        <div className="flex gap-6 pt-2 border-t border-slate-200">
                                            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer"><Checkbox checked={watch(`packagings.${index}.isDefaultInbound`)} onCheckedChange={(v) => setValue(`packagings.${index}.isDefaultInbound`, v)} /> Padrão Recebimento</label>
                                            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer"><Checkbox checked={watch(`packagings.${index}.isDefaultOutbound`)} onCheckedChange={(v) => setValue(`packagings.${index}.isDefaultOutbound`, v)} /> Padrão Expedição</label>
                                            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer text-amber-700"><Checkbox checked={watch(`packagings.${index}.allowFractionalPicking`)} onCheckedChange={(v) => setValue(`packagings.${index}.allowFractionalPicking`, v)} /> Permite Quebra (Fração)</label>
                                        </div>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" onClick={() => append({ packagingTypeId: '', conversionFactor: 1, isDefaultInbound: false, isDefaultOutbound: false, allowFractionalPicking: false, grossWeight: 0, netWeight: 0, lengthMm: 0, widthMm: 0, heightMm: 0 })} className="w-full border-dashed border-2 text-blue-600 hover:bg-blue-50">
                                    <PlusCircle size={16} className="mr-2" /> Adicionar Embalagem Secundária
                                </Button>
                            </TabsContent>
                        </div>
                        <SheetFooter className="p-6 border-t border-slate-100 bg-slate-50/50">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isCreating || isUpdating} className="bg-slate-900 text-white min-w-[140px]">
                                {isCreating || isUpdating ? <Loader2 className="animate-spin h-4 w-4" /> : <><Save className="h-4 w-4 mr-2" /> Salvar Produto</>}
                            </Button>
                        </SheetFooter>
                    </Tabs>
                </form>
            </SheetContent>
        </Sheet>
    );
}