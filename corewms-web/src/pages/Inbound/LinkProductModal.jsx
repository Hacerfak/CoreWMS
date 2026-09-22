import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiProducts, usePostApiProducts } from '@/api/generated/products/products';
import { usePostApiInboundReviewItemIdLink } from '@/api/generated/inbound/inbound';
import { useGetApiPackagingTypes } from '@/api/generated/packaging-types/packaging-types';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Link as LinkIcon, PackageCheck, AlertCircle, Plus, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

// Validation Schema - Apens para os campos editáveis na tela
const quickPackagingSchema = z.object({
    packagingTypeId: z.string().min(1, 'Selecione o tipo de embalagem.'),
    conversionFactor: z.coerce.number().min(1, 'Mínimo 1.'),
    barcode: z.string().optional().nullable()
});

const quickProductSchema = z.object({
    description: z.string().min(3, 'Descrição obrigatória.'),
    baseUnit: z.string().min(1, 'Unidade obrigatória.'),
    packagings: z.array(quickPackagingSchema).min(1, 'Adicione pelo menos uma embalagem.')
});

export default function LinkProductModal({ open, onOpenChange, item }) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('existing');
    const [search, setSearch] = useState(item?.rawSkuCode || '');
    const [selectedProductId, setSelectedProductId] = useState(null);

    const { data: packTypesResponse } = useGetApiPackagingTypes();
    const packagingTypes = Array.isArray(packTypesResponse) ? packTypesResponse : (packTypesResponse?.items || []);

    const { data: apiResponse, isLoading: isLoadingProducts } = useGetApiProducts(
        { Search: search, PageSize: 5 },
        { query: { enabled: open && search.length >= 2 } }
    );
    const products = apiResponse?.items || (Array.isArray(apiResponse) ? apiResponse : []);

    const { register, control, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(quickProductSchema),
        defaultValues: {
            description: '',
            baseUnit: 'UN',
            packagings: [{ packagingTypeId: '', conversionFactor: 1, barcode: '' }]
        }
    });

    const { fields, append, remove } = useFieldArray({ control, name: 'packagings' });

    useEffect(() => {
        if (open && item) {
            reset({
                description: item.rawDescription || '',
                baseUnit: item.rawUnit || 'UN',
                packagings: [{ packagingTypeId: '', conversionFactor: 1, barcode: item.rawBarcode || '' }]
            });
            setSearch(item.rawSkuCode || '');
            setSelectedProductId(null);
            setActiveTab('existing');
        }
    }, [open, item, reset]);

    // Mutação para Vincular Produto Existente
    const { mutate: linkProduct, isPending: isLinking } = usePostApiInboundReviewItemIdLink({
        mutation: {
            onSuccess: () => {
                toast.success('Produto vinculado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/inbound/review'] });
                queryClient.invalidateQueries({ queryKey: ['/api/inbound'] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao vincular produto.')
        }
    });

    // Mutação para Cadastro Rápido
    const { mutate: createProduct, isPending: isCreating } = usePostApiProducts({
        mutation: {
            onSuccess: (newProduct) => {
                toast.success('Novo SKU cadastrado no WMS!');
                queryClient.invalidateQueries({ queryKey: ['/api/products'] });

                const createdId = newProduct?.id;
                if (createdId) {
                    linkProduct({ itemId: item.itemId, data: { productId: createdId } });
                } else {
                    toast.info('Procure pelo novo SKU na aba de busca para concluir o vínculo.');
                    setActiveTab('existing');
                }
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao cadastrar SKU rápido.')
        }
    });

    const handleLinkExisting = () => {
        if (!selectedProductId) return;
        linkProduct({ itemId: item.itemId, data: { productId: selectedProductId } });
    };

    const handleCreateQuickProduct = (data) => {
        // Envia todos os dados fiscais diretamente extraídos do XML da Nota Fiscal
        const fullPayload = {
            customerId: item.customerId,
            sku: item.rawSkuCode,
            baseBarcode: item.rawBarcode || null,
            description: data.description,
            baseUnit: data.baseUnit,
            ncm: item.rawNcm || null,      // Injetado do XML
            cest: item.rawCest || null,    // Injetado do XML
            origin: 0,
            maxStacking: 1,
            pickingStrategy: 1,
            pickingBaseDate: 1,
            tracksBatch: false,
            strictBatch: false,
            tracksManufacture: false,
            strictManufacture: false,
            tracksExpiration: false,
            strictExpiration: false,
            tracksSerial: false,
            strictSerial: false,
            packagings: data.packagings.map((p, idx) => ({
                packagingTypeId: p.packagingTypeId,
                conversionFactor: p.conversionFactor,
                barcode: p.barcode || null,
                isDefaultInbound: idx === 0,
                isDefaultOutbound: idx === 0,
                allowFractionalPicking: true,
                grossWeight: 0,
                netWeight: 0,
                lengthMm: 0,
                widthMm: 0,
                heightMm: 0
            }))
        };

        createProduct({ data: fullPayload });
    };

    const isBusy = isLinking || isCreating;

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!isBusy) onOpenChange(v); }}>
            <DialogContent className="sm:max-w-2xl bg-white p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 flex items-center gap-2">
                            <LinkIcon className="text-blue-600" size={20} /> Tratamento de Produto Desconhecido
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Escolha um produto existente no catálogo ou crie um novo SKU rápido para a nota fiscal.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="p-6 pb-0 space-y-4">
                    {/* Referência do XML */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-amber-800 text-xs font-bold uppercase tracking-wider mb-1">
                            <AlertCircle size={14} /> Dados Brutos Extraídos do XML
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            <div>
                                <p className="text-[10px] text-amber-700/70 font-semibold uppercase">SKU / Cód. Item</p>
                                <p className="text-xs font-mono font-bold text-amber-900">{item?.rawSkuCode}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-amber-700/70 font-semibold uppercase">EAN Original</p>
                                <p className="text-xs font-mono text-amber-900">{item?.rawBarcode || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-amber-700/70 font-semibold uppercase">NCM</p>
                                <p className="text-xs font-mono text-amber-900">{item?.rawNcm || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-amber-700/70 font-semibold uppercase">CEST</p>
                                <p className="text-xs font-mono text-amber-900">{item?.rawCest || 'N/A'}</p>
                            </div>
                        </div>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid grid-cols-2 w-full bg-slate-100 p-1">
                            <TabsTrigger value="existing" className="data-[state=active]:bg-white text-xs font-semibold">
                                <Search size={14} className="mr-2" /> Buscar SKU Existente
                            </TabsTrigger>
                            <TabsTrigger value="new" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs font-semibold">
                                <Sparkles size={14} className="mr-2" /> Cadastro Rápido de SKU
                            </TabsTrigger>
                        </TabsList>

                        {/* BUSCAR EXISTENTE */}
                        <TabsContent value="existing" className="space-y-4 pt-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar por SKU, EAN ou Descrição..."
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setSelectedProductId(null); }}
                                    className="pl-9 h-10 border-blue-200 focus-visible:ring-blue-600 bg-white"
                                />
                            </div>

                            <div className="space-y-2 border border-slate-100 rounded-lg max-h-52 overflow-y-auto bg-slate-50/50 p-2">
                                {isLoadingProducts ? (
                                    <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
                                ) : search.length < 2 ? (
                                    <div className="py-8 text-center text-xs text-slate-400">Digite pelo menos 2 caracteres para buscar.</div>
                                ) : products.length === 0 ? (
                                    <div className="py-8 text-center text-xs text-rose-500">Nenhum produto encontrado no catálogo deste depositante.</div>
                                ) : (
                                    products.map(p => (
                                        <div
                                            key={p.id}
                                            onClick={() => setSelectedProductId(p.id)}
                                            className={`p-3 rounded-md cursor-pointer border transition-all flex items-center justify-between ${selectedProductId === p.id ? 'bg-blue-50 border-blue-400 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-300'}`}
                                        >
                                            <div className="flex flex-col">
                                                <span className={`text-sm font-semibold ${selectedProductId === p.id ? 'text-blue-900' : 'text-slate-800'}`}>
                                                    {p.sku} - {p.description}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                                                    EAN: {p.baseBarcode || 'N/A'} | UN Base: {p.baseUnit}
                                                </span>
                                            </div>
                                            {selectedProductId === p.id && <PackageCheck size={18} className="text-blue-600" />}
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="pt-2 flex justify-end">
                                <Button
                                    onClick={handleLinkExisting}
                                    disabled={!selectedProductId || isBusy}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    {isLinking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Vínculo'}
                                </Button>
                            </div>
                        </TabsContent>

                        {/* CADASTRO RÁPIDO */}
                        <TabsContent value="new" className="pt-4">
                            <form onSubmit={handleSubmit(handleCreateQuickProduct)} className="space-y-4">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2 space-y-1">
                                        <Label className="text-xs">Descrição Completa *</Label>
                                        <Input {...register('description')} className="h-9 text-xs" />
                                        {errors.description && <p className="text-[10px] text-rose-500">{errors.description.message}</p>}
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">UN Fiscal *</Label>
                                        <Input {...register('baseUnit')} placeholder="Ex: UN, KG" className="h-9 text-xs font-mono uppercase" />
                                        {errors.baseUnit && <p className="text-[10px] text-rose-500">{errors.baseUnit.message}</p>}
                                    </div>
                                </div>

                                {/* EMBALAGENS */}
                                <div className="space-y-3 pt-2">
                                    <div className="flex items-center justify-between border-b pb-1">
                                        <Label className="text-xs font-bold text-slate-800">Embalagens & Fatores de Conversão *</Label>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => append({ packagingTypeId: '', conversionFactor: 1, barcode: '' })}
                                            className="h-6 text-[10px] text-blue-600 hover:bg-blue-50"
                                        >
                                            <Plus size={12} className="mr-1" /> Adicionar Embalagem
                                        </Button>
                                    </div>

                                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                        {fields.map((field, idx) => (
                                            <div key={field.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                                <div className="flex-1">
                                                    <Select value={watch(`packagings.${idx}.packagingTypeId`)} onValueChange={(v) => setValue(`packagings.${idx}.packagingTypeId`, v, { shouldValidate: true })}>
                                                        <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Tipo..." /></SelectTrigger>
                                                        <SelectContent>
                                                            {packagingTypes.map(pt => <SelectItem key={pt.id} value={pt.id}>{pt.code} - {pt.description}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="w-24">
                                                    <Input type="number" step="0.0001" placeholder="Fator" {...register(`packagings.${idx}.conversionFactor`)} className="h-8 text-xs bg-white font-mono" />
                                                </div>
                                                <div className="w-32">
                                                    <Input placeholder="Cód. Barras" {...register(`packagings.${idx}.barcode`)} className="h-8 text-xs bg-white font-mono" />
                                                </div>
                                                {fields.length > 1 && (
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)} className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-50"><Trash2 size={14} /></Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-slate-100 flex justify-end">
                                    <Button type="submit" disabled={isBusy} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[150px]">
                                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-2" /> Salvar e Vincular</>}
                                    </Button>
                                </div>
                            </form>
                        </TabsContent>
                    </Tabs>
                </div>

                <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50/50 mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>Cancelar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}