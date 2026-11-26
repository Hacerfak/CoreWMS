import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiPrintingTemplates, usePutApiPrintingTemplatesId } from '@/api/generated/printing/printing';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Tag, Save, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const templateSchema = z.object({
    name: z.string().min(3, 'Mínimo 3 caracteres.'),
    zplContent: z.string().min(10, 'Conteúdo ZPL inválido.'),
    widthMm: z.coerce.number().min(1, 'Obrigatório.'),
    heightMm: z.coerce.number().min(1, 'Obrigatório.')
});

const ZPL_PRESETS = {
    inbound_hu: {
        label: 'Recebimento (HU)',
        widthMm: 100,
        heightMm: 70,
        zpl: `^XA
^PW799
^LL549
^PON
^CI28
^FX --- Lote e SKU ---
^FT730,30^A0N,20,20^FDSKU^FS
^FT0,100^A0N,50,50^FB780,1,0,R,0^FD<codigo>^FS
^FT40,30^A0N,20,20^FDLote/NFe Compra^FS
^FT40,100^A0N,50,50^FD<lote>^FS
^FO20,115^GB800,3,3^FS
^FX --- ESQUERDA: Validade e HU ---
^FT40,150^A0N,20,20^FDHU^FS
^FT40,200^A0N,45,45^FD<num_hu>^FS
^FT40,250^A0N,20,20^FDValidade^FS
^FT40,310^A0N,45,45^FD<validade>^FS
^FX --- CENTRO: QR Code ---
^FO320,125^BQN,2,9^FDQA,<num_hu>^FS
^FX --- DIREITA: NFe e Data Entrada ---
^FT675,150^A0N,20,20^FDNFe Remessa^FS
^FT0,230^A0N,35,35^FB780,2,0,R,0^FD<nfe_entrada>^FS
^FT675,250^A0N,20,20^FDData Entrada^FS
^FT0,340^A0N,35,35^FB780,2,0,R,0^FD<data_recebimento>^FS
^FO20,340^GB800,3,3^FS
^FX --- Depositante, Produto e Quantidade ---
^FT0,400^A0N,35,35^FB799,1,0,C,0^FD<depositante>^FS
^FT0,460^A0N,35,35^FB799,1,0,C,0^FD<nome_produto>^FS
^FT0,530^A0N,55,55^FB799,1,0,C,0^FD<quantidade_produto> <unidade_medida>^FS
^XZ`
    },
    outbound_volume: {
        label: 'Expedição (Volume)',
        widthMm: 100,
        heightMm: 150,
        zpl: `^XA
^PW799
^LL1198
^PON
^CI28
^FT30,50^A0N,24,24^FDPEDIDO: <num_pedido>^FS
^FT30,85^A0N,22,22^FDNF-E: <nfe_saida>^FS
^FT30,125^A0N,22,22^FDDEPOSITANTE: <depositante>^FS
^FT30,165^A0N,24,24^FDDESTINO: <destinatario>^FS
^FT30,200^A0N,22,22^FDCIDADE/UF: <destino_cidade_uf>^FS
^FT30,240^A0N,20,20^FDTRANSP.: <transportadora>^FS
^FO20,260^GB760,3,3^FS
^FT30,305^A0N,24,24^FDVOLUME: <lpn_volume> (<tipo_volume>)^FS
^FT30,340^A0N,20,20^FDPESO BRUTO: <peso_bruto> KG | DATA: <data_expedicao>^FS
^FO220,380^BY3^BCN,140,Y,N,N^FD<lpn_volume>^FS
^XZ`
    },
    location: {
        label: 'Endereço (Topologia)',
        widthMm: 100,
        heightMm: 50,
        zpl: `^XA
^PW799
^LL399
^PON
^CI28
^FT30,50^A0N,22,22^FDARM.: <armazem> | ZONA: <zona>^FS
^FT0,145^A0N,65,65^FB799,1,0,C,0^FD<caminho_endereco>^FS
^FO210,175^BY3^BCN,120,Y,N,N^FD<caminho_endereco>^FS
^FT30,375^A0N,20,20^FDCOD: <codigo_endereco> | TIPO: <tipo_armazenagem> | CAP: <capacidade_base>^FS
^XZ`
    }
};

const VARIABLE_GROUPS = [
    {
        title: 'Recebimento / HU',
        vars: [
            { token: '<codigo>', desc: 'SKU do produto' },
            { token: '<lote>', desc: 'Lote (ou N/A)' },
            { token: '<num_hu>', desc: 'LPN da HU' },
            { token: '<validade>', desc: 'Validade (dd/MM/yyyy)' },
            { token: '<nfe_entrada>', desc: 'Nº NF-e entrada' },
            { token: '<data_recebimento>', desc: 'Data entrada' },
            { token: '<depositante>', desc: 'Nome depositante' },
            { token: '<nome_produto>', desc: 'Descrição SKU' },
            { token: '<quantidade_produto>', desc: 'Qtd atual' },
            { token: '<unidade_medida>', desc: 'Unidade (UN, KG...)' }
        ]
    },
    {
        title: 'Expedição / Volume',
        vars: [
            { token: '<lpn_volume>', desc: 'LPN do volume' },
            { token: '<num_pedido>', desc: 'Nº do pedido' },
            { token: '<nfe_saida>', desc: 'Nº NF-e saída' },
            { token: '<destinatario>', desc: 'Nome destino' },
            { token: '<destino_cidade_uf>', desc: 'Cidade / UF destino' },
            { token: '<transportadora>', desc: 'Transportadora' },
            { token: '<tipo_volume>', desc: 'Embalagem (CX, PLT...)' },
            { token: '<peso_bruto>', desc: 'Peso bruto (KG)' },
            { token: '<data_expedicao>', desc: 'Data expedição' }
        ]
    },
    {
        title: 'Endereço / Topologia',
        vars: [
            { token: '<codigo_endereco>', desc: 'Código endereço' },
            { token: '<caminho_endereco>', desc: 'Caminho (ex: P1-C1-B1)' },
            { token: '<armazem>', desc: 'Armazém' },
            { token: '<zona>', desc: 'Zona' },
            { token: '<tipo_armazenagem>', desc: 'Tipo armazenagem' },
            { token: '<capacidade_base>', desc: 'Capacidade base' }
        ]
    }
];

const DEFAULT_NEW_TEMPLATE = {
    name: '',
    zplContent: ZPL_PRESETS.inbound_hu.zpl,
    widthMm: ZPL_PRESETS.inbound_hu.widthMm,
    heightMm: ZPL_PRESETS.inbound_hu.heightMm
};

export default function TemplateFormModal({ open, onOpenChange, templateToEdit }) {
    const queryClient = useQueryClient();
    const canManagePrinting = useHasPermission('printing:manage');
    const isEditing = Boolean(templateToEdit);

    const formValues = useMemo(() => {
        if (!open) return DEFAULT_NEW_TEMPLATE;
        if (isEditing && templateToEdit) {
            return {
                name: templateToEdit.name || '',
                zplContent: templateToEdit.zplContent || '',
                widthMm: templateToEdit.widthMm ?? 100,
                heightMm: templateToEdit.heightMm ?? 150
            };
        }
        return DEFAULT_NEW_TEMPLATE;
    }, [open, isEditing, templateToEdit]);

    const { register, control, handleSubmit, setValue, getValues, formState: { errors } } = useForm({
        resolver: zodResolver(templateSchema),
        defaultValues: DEFAULT_NEW_TEMPLATE,
        values: formValues
    });

    const zplValue = useWatch({ control, name: 'zplContent' }) || '';

    const { mutate: createTemplate, isPending: isCreating } = usePostApiPrintingTemplates({
        mutation: {
            onSuccess: () => handleSuccess('Template salvo!'),
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar.')
        }
    });

    const { mutate: updateTemplate, isPending: isUpdating } = usePutApiPrintingTemplatesId({
        mutation: {
            onSuccess: () => handleSuccess('Template atualizado!'),
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar.')
        }
    });

    const handleSuccess = (msg) => {
        toast.success(msg);
        queryClient.invalidateQueries({ queryKey: ['/api/printing/templates'] });
        onOpenChange(false);
    };

    const applyPreset = (presetKey) => {
        if (!canManagePrinting) return;
        const preset = ZPL_PRESETS[presetKey];
        if (!preset) return;
        setValue('zplContent', preset.zpl, { shouldValidate: true });
        setValue('widthMm', preset.widthMm, { shouldValidate: true });
        setValue('heightMm', preset.heightMm, { shouldValidate: true });
        toast.info(`Modelo padrão "${preset.label}" aplicado!`);
    };

    const handleInsertToken = (token) => {
        if (!canManagePrinting) return;
        const current = getValues('zplContent') || '';
        const next = current ? `${current}\n${token}` : token;
        setValue('zplContent', next, { shouldValidate: true });
        toast.success(`Variável ${token} adicionada ao ZPL.`);
    };

    const onSubmit = (data) => {
        if (!canManagePrinting) return;
        if (isEditing) updateTemplate({ id: templateToEdit.id, data });
        else createTemplate({ data });
    };

    const isPending = isCreating || isUpdating;

    return (
        <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
            <DialogContent className="sm:max-w-3xl bg-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-900">
                        <Tag className="text-blue-600" size={20} />
                        {isEditing ? 'Editar Template' : 'Novo Template ZPL'}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Configure o layout ZPL e utilize as variáveis disponíveis para recebimento, expedição ou endereçamento.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Nome do Template *</Label>
                        <Input
                            {...register('name')}
                            disabled={!canManagePrinting || isPending}
                            placeholder="Ex: Etiqueta HU Recebimento / Etiqueta Volume Expedição / Endereço"
                            className="h-9 text-xs bg-white"
                        />
                        {errors.name && <p className="text-xs text-rose-500">{errors.name.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Largura (mm) *</Label>
                            <Input type="number" {...register('widthMm')} disabled={!canManagePrinting || isPending} className="h-9 text-xs font-mono bg-white" />
                            {errors.widthMm && <p className="text-xs text-rose-500">{errors.widthMm.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Altura (mm) *</Label>
                            <Input type="number" {...register('heightMm')} disabled={!canManagePrinting || isPending} className="h-9 text-xs font-mono bg-white" />
                            {errors.heightMm && <p className="text-xs text-rose-500">{errors.heightMm.message}</p>}
                        </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <Sparkles size={14} className="text-blue-600" /> Código ZPL
                            </Label>

                            {canManagePrinting && (
                                <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[10px] text-slate-400 mr-1">Modelos padrão:</span>
                                    <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('inbound_hu')} className="h-6 text-[10px] px-2 bg-slate-50">
                                        Recebimento (HU)
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('outbound_volume')} className="h-6 text-[10px] px-2 bg-slate-50">
                                        Expedição (Volume)
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('location')} className="h-6 text-[10px] px-2 bg-slate-50">
                                        Endereço
                                    </Button>
                                </div>
                            )}
                        </div>

                        <Textarea
                            {...register('zplContent')}
                            value={zplValue}
                            disabled={!canManagePrinting || isPending}
                            className="h-56 font-mono text-xs bg-slate-900 text-emerald-400 p-3 leading-relaxed border-slate-800 rounded-xl"
                            placeholder="^XA...^XZ"
                        />
                        {errors.zplContent && <p className="text-xs text-rose-500">{errors.zplContent.message}</p>}

                        <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs space-y-2.5 text-slate-800">
                            <p className="font-bold flex items-center gap-1.5 text-blue-950">
                                <Info size={14} className="text-blue-700" /> Variáveis Disponíveis (clique para inserir):
                            </p>

                            {VARIABLE_GROUPS.map((group) => (
                                <div key={group.title} className="space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                                        {group.title}
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {group.vars.map((v) => (
                                            <button
                                                key={v.token}
                                                type="button"
                                                disabled={!canManagePrinting || isPending}
                                                onClick={() => handleInsertToken(v.token)}
                                                title={v.desc}
                                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-mono text-slate-800 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-60"
                                            >
                                                <Badge variant="outline" className="border-0 p-0 text-[10px] font-mono font-bold text-blue-700">
                                                    {v.token}
                                                </Badge>
                                                <span className="font-sans text-slate-500">• {v.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <DialogFooter className="pt-4 border-t border-slate-100">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
                        {canManagePrinting && (
                            <Button type="submit" disabled={isPending} className="bg-slate-900 text-white min-w-[120px]">
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar</>}
                            </Button>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}