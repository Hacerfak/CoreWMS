import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { customInstance } from '@/api/orval-mutator';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Code2, Loader2, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';

const serviceSchema = z.object({
    name: z.string().min(1, 'Informe o nome do serviço.'),
    type: z.string().min(1, 'Selecione a modalidade.'),
    sqlTemplate: z.string().optional()
});

export default function ModalServico({ isOpen, onOpenChange, editingService, reload }) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(serviceSchema),
        defaultValues: {
            name: '',
            type: 'Automatic_Daily',
            sqlTemplate: ''
        }
    });

    const watchType = watch('type');

    useEffect(() => {
        if (isOpen) {
            if (editingService) {
                setValue('name', editingService.name || '');
                const isAuto = editingService.type === 'Automatic_Daily' || editingService.type === 'Automatic_SQL' || editingService.type === 1;
                setValue('type', isAuto ? 'Automatic_Daily' : 'Operational_Event');
                setValue('sqlTemplate', editingService.sqlTemplate || '');
            } else {
                reset({
                    name: '',
                    type: 'Automatic_Daily',
                    sqlTemplate: ''
                });
            }
        }
    }, [isOpen, editingService, setValue, reset]);

    const onSave = async (data) => {
        try {
            setIsSubmitting(true);
            const isAutoDaily = data.type === 'Automatic_Daily' || data.type === 'Automatic_SQL' || data.type === 1;
            const payload = {
                name: data.name.trim(),
                type: isAutoDaily ? 1 : 2,
                sqlTemplate: data.sqlTemplate?.trim() || null,
                isActive: true
            };

            if (editingService?.id) {
                await customInstance({
                    url: `/api/billing/services/${editingService.id}`,
                    method: 'PUT',
                    data: payload
                });
                toast.success('Serviço logístico atualizado com sucesso!');
            } else {
                await customInstance({
                    url: '/api/billing/services',
                    method: 'POST',
                    data: payload
                });
                toast.success('Serviço logístico cadastrado com sucesso!');
            }

            onOpenChange(false);
            reload();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao salvar serviço logístico.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const applySqlPreset = (presetKey) => {
        let sql = '';
        switch (presetKey) {
            case 'storage_daily':
                sql = `-- Armazenagem Diária (Apuração por HU em Custódia)
SELECT 
    h."ReceiptDocumentId" AS "ORDEM_ID",
    COALESCE(io."InvoiceNumber", SUBSTRING(io."AccessKey" FROM 26 FOR 9), 'SEM-NF') AS "NF_ENTRADA",
    io."IssueDate"::date AS "DATA_ENTRADA",
    pt."Code" AS "TIPO_VOLUME",
    pt."Description" AS "DESCRICAO",
    COUNT(DISTINCT h."Id") AS "VOLUME",
    @ServicoValor AS "VALOR_UNITARIO",
    ROUND(COUNT(DISTINCT h."Id") * @ServicoValor, 2) AS "VALOR_TOTAL"
FROM "HandlingUnits" h
LEFT JOIN "InboundOrders" io ON io."Id" = h."ReceiptDocumentId"
LEFT JOIN "PackagingTypes" pt ON pt."Id" = h."PackagingTypeId"
WHERE h."CompanyId" = @ArmazemId
  AND h."CustomerId" = @DepositanteId
  AND h."Status" != 1
  AND h."CreatedAt" <= @CobrancaDataFim
  AND (h."ConsumedAt" IS NULL OR h."ConsumedAt" >= @CobrancaDataIni)
GROUP BY h."ReceiptDocumentId", io."InvoiceNumber", io."AccessKey", io."IssueDate", pt."Code", pt."Description"
ORDER BY "NF_ENTRADA", pt."Code";`;
                break;

            case 'ad_valorem':
                sql = `-- Seguro / Ad-Valorem Diário com Reconstrução Histórica via Kardex
WITH "HuSaldoKardex" AS (
    SELECT 
        t."HandlingUnitId",
        SUM(
            CASE 
                -- Se a HU entrou no próprio dia, considera a quantidade de entrada recebida
                WHEN t."Type" = 1 AND t."CreatedAt" >= @CobrancaDataIni AND t."CreatedAt" <= @CobrancaDataFim 
                    THEN t."QuantityChange"
                -- Para histórico anterior ao dia, soma o saldo acumulado que amanheceu no galpão
                WHEN t."CreatedAt" < @CobrancaDataIni 
                    THEN t."QuantityChange"
                ELSE 0 
            END
        ) AS "SaldoPecas"
    FROM "InventoryTransactions" t
    WHERE t."CompanyId" = @ArmazemId
      AND t."CustomerId" = @DepositanteId
      AND t."CreatedAt" <= @CobrancaDataFim
    GROUP BY t."HandlingUnitId"
    HAVING SUM(
        CASE 
            WHEN t."Type" = 1 AND t."CreatedAt" >= @CobrancaDataIni AND t."CreatedAt" <= @CobrancaDataFim 
                THEN t."QuantityChange"
            WHEN t."CreatedAt" < @CobrancaDataIni 
                THEN t."QuantityChange"
            ELSE 0 
        END
    ) > 0
)
SELECT 
    h."ReceiptDocumentId" AS "ORDEM_ID",
    COALESCE(io."InvoiceNumber", SUBSTRING(io."AccessKey" FROM 26 FOR 9), 'SEM-NF') AS "NF_ENTRADA",
    io."IssueDate"::date AS "DATA_ENTRADA",
    pt."Code" AS "TIPO_VOLUME",
    pt."Description" AS "DESCRICAO",
    COUNT(DISTINCT h."Id") AS "VOLUME",
    ROUND(SUM(k."SaldoPecas" * h."UnitValue"), 2) AS "BASE_CALCULO",
    @ServicoValor AS "VALOR_UNITARIO",
    ROUND(SUM(k."SaldoPecas" * h."UnitValue") * @ServicoValor, 2) AS "VALOR_TOTAL"
FROM "HuSaldoKardex" k
JOIN "HandlingUnits" h ON h."Id" = k."HandlingUnitId"
LEFT JOIN "InboundOrders" io ON io."Id" = h."ReceiptDocumentId"
LEFT JOIN "PackagingTypes" pt ON pt."Id" = h."PackagingTypeId"
GROUP BY h."ReceiptDocumentId", io."InvoiceNumber", io."AccessKey", io."IssueDate", pt."Code", pt."Description"
ORDER BY "NF_ENTRADA", pt."Code";`;
                break;

            case 'inbound_volumes':
                sql = `-- Recebimento por Tipo de Volume (Inbound - Valores Fixos por Embalagem)
SELECT 
    pt."Code" AS "TIPO_VOLUME",
    pt."Description" AS "DESCRICAO",
    COUNT(h."Id") AS "VOLUME",
    CASE pt."Code" 
        WHEN 'PLT' THEN 12.00 
        WHEN 'CX'  THEN 1.80 
        WHEN 'UN'  THEN 0.90 
        WHEN 'GF'  THEN 0.50
        ELSE 0.90 
    END AS "VALOR_UNITARIO",
    ROUND(
        COUNT(h."Id") * 
        CASE pt."Code" 
            WHEN 'PLT' THEN 12.00 
            WHEN 'CX'  THEN 1.80 
            WHEN 'UN'  THEN 0.90 
            WHEN 'GF'  THEN 0.50
            ELSE 0.90 
        END, 
        2
    ) AS "VALOR_TOTAL"
FROM "HandlingUnits" h
JOIN "PackagingTypes" pt ON pt."Id" = h."PackagingTypeId"
WHERE h."ReceiptDocumentId" = @OrdemId
  AND h."CustomerId" = @DepositanteId
GROUP BY pt."Code", pt."Description";`;
                break;

            case 'outbound_handling':
                sql = `-- Expedição / Handling Out por NF-e de Entrada de Origem (Custódia 3PL)
WITH "OutboundVolumeOrigins" AS (
    -- 1. Volumes Fechados (Auto-Packing: o VolumeLpn é o LPN da HU original)
    SELECT 
        h."ReceiptDocumentId" AS "ORDEM_ID",
        COALESCE(io."InvoiceNumber", SUBSTRING(io."AccessKey" FROM 26 FOR 9), 'SEM-NF') AS "NF_ENTRADA",
        pt."Code" AS "TIPO_VOLUME",
        pt."Description" AS "DESCRICAO",
        v."Id" AS "VOLUME_ID"
    FROM "OutboundVolumes" v
    JOIN "PackagingTypes" pt ON pt."Id" = v."PackagingTypeId"
    JOIN "HandlingUnits" h ON h."Lpn" = v."VolumeLpn"
    LEFT JOIN "InboundOrders" io ON io."Id" = h."ReceiptDocumentId"
    WHERE v."OutboundOrderId" = @OrdemId
      AND v."IsAutoPacked" = TRUE

    UNION ALL

    -- 2. Volumes Fracionados / Caixas (Packing Manual: liga pelo item e HU alocada)
    SELECT 
        h."ReceiptDocumentId" AS "ORDEM_ID",
        COALESCE(io."InvoiceNumber", SUBSTRING(io."AccessKey" FROM 26 FOR 9), 'SEM-NF') AS "NF_ENTRADA",
        pt."Code" AS "TIPO_VOLUME",
        pt."Description" AS "DESCRICAO",
        v."Id" AS "VOLUME_ID"
    FROM "OutboundVolumes" v
    JOIN "PackagingTypes" pt ON pt."Id" = v."PackagingTypeId"
    JOIN "OutboundItemPacks" p ON p."OutboundOrderId" = v."OutboundOrderId" AND p."PackagingTypeId" = v."PackagingTypeId"
    JOIN "OutboundAllocations" a ON a."OutboundOrderItemId" = p."OutboundOrderItemId"
    JOIN "HandlingUnits" h ON h."Id" = a."HandlingUnitId"
    LEFT JOIN "InboundOrders" io ON io."Id" = h."ReceiptDocumentId"
    WHERE v."OutboundOrderId" = @OrdemId
      AND v."IsAutoPacked" = FALSE
)
SELECT 
    "ORDEM_ID",
    "NF_ENTRADA",
    "TIPO_VOLUME",
    "DESCRICAO",
    COUNT(DISTINCT "VOLUME_ID") AS "VOLUME",
    ROUND(
        CASE "TIPO_VOLUME" 
            WHEN 'PLT' THEN 12.00 
            WHEN 'CX'  THEN 1.80 
            WHEN 'UN'  THEN 0.90 
            WHEN 'GF'  THEN 0.50
            ELSE 0.90 
        END, 
        2
    ) AS "VALOR_UNITARIO",
    ROUND(
        COUNT(DISTINCT "VOLUME_ID") * 
        CASE "TIPO_VOLUME" 
            WHEN 'PLT' THEN 12.00 
            WHEN 'CX'  THEN 1.80 
            WHEN 'UN'  THEN 0.90 
            WHEN 'GF'  THEN 0.50
            ELSE 0.90 
        END, 
        2
    ) AS "VALOR_TOTAL"
FROM "OutboundVolumeOrigins"
GROUP BY "ORDEM_ID", "NF_ENTRADA", "TIPO_VOLUME", "DESCRICAO"
ORDER BY "NF_ENTRADA", "TIPO_VOLUME";`;
                break;

            case 'outbound_stretch':
                sql = `-- Insumo Filme Stretch Aplicado (Outbound - Momento 2)
SELECT 
    pt."Code" AS "TIPO_VOLUME",
    'Aplicação Filme Stretch' AS "DESCRICAO",
    COUNT(v."Id") AS "VOLUME",
    ROUND(COALESCE(NULLIF(@ServicoValor, 0), 15.00), 2) AS "VALOR_UNITARIO",
    ROUND(COUNT(v."Id") * COALESCE(NULLIF(@ServicoValor, 0), 15.00), 2) AS "VALOR_TOTAL"
FROM "OutboundVolumes" v
JOIN "PackagingTypes" pt ON pt."Id" = v."PackagingTypeId"
WHERE v."OutboundOrderId" = @OrdemId
  AND v."UsedStretchFilm" = TRUE
GROUP BY pt."Code";`;
                break;

            default:
                break;
        }

        setValue('sqlTemplate', sql);
        toast.info('Template SQL carregado e validado!');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl bg-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <Code2 className="text-purple-600" size={20} />
                        {editingService ? 'Editar Serviço Logístico' : 'Cadastrar Serviço & Regra SQL'}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Configure o modelo de tarifação. Serviços com query SQL são apurados dinamicamente pelo banco de dados.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSave)} className="space-y-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Nome do Serviço *</Label>
                            <Input
                                placeholder="Ex: Armazenagem Diária (Palete) / Expedição de Caixa"
                                value={watch('name')}
                                onChange={(e) => setValue('name', e.target.value, { shouldValidate: true })}
                                className="bg-white text-xs h-9"
                            />
                            {errors.name && <p className="text-[10px] text-rose-500">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Modalidade de Apuração *</Label>
                            <Select value={watchType} onValueChange={(v) => setValue('type', v, { shouldValidate: true })}>
                                <SelectTrigger className="bg-white text-xs h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Automatic_Daily">⚡ Diário Automático (Armazenagem / Ad-Valorem Noturno)</SelectItem>
                                    <SelectItem value="Operational_Event">📦 Operacional / Evento (Recebimento, Expedição, Stretch, Manual)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* PRESETS SQL */}
                    <div className="space-y-2 pt-2 border-t">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <Code2 size={14} className="text-purple-600" /> Query SQL Dinâmica (PostgreSQL Dapper)
                            </Label>

                            <div className="flex flex-wrap gap-1">
                                <span className="text-[10px] text-slate-400 self-center mr-1">Modelos Prontos:</span>
                                <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('storage_daily')} className="h-6 text-[10px] px-2 bg-slate-50">
                                    Armazenagem
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('ad_valorem')} className="h-6 text-[10px] px-2 bg-slate-50">
                                    Ad-Valorem
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('inbound_volumes')} className="h-6 text-[10px] px-2 bg-slate-50">
                                    Recebimento
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('outbound_handling')} className="h-6 text-[10px] px-2 bg-slate-50">
                                    Handling Out
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => applySqlPreset('outbound_stretch')} className="h-6 text-[10px] px-2 bg-slate-50">
                                    Stretch
                                </Button>
                            </div>
                        </div>

                        <Textarea
                            rows={8}
                            placeholder="SELECT COUNT(*) AS VOLUME, COUNT(*) * @ServicoValor AS VALOR_TOTAL FROM ..."
                            value={watch('sqlTemplate')}
                            onChange={(e) => setValue('sqlTemplate', e.target.value)}
                            className="font-mono text-xs bg-slate-900 text-emerald-400 p-3 leading-relaxed border-slate-800 focus:ring-purple-500 rounded-xl"
                        />

                        <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl text-xs space-y-1.5 text-purple-950">
                            <p className="font-bold flex items-center gap-1">
                                <Info size={14} className="text-purple-700" /> Parâmetros Dinâmicos Substituídos pelo Motor:
                            </p>
                            <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                                <Badge variant="outline" className="bg-white">@ArmazemId</Badge>
                                <Badge variant="outline" className="bg-white">@DepositanteId</Badge>
                                <Badge variant="outline" className="bg-white">@ServicoValor</Badge>
                                <Badge variant="outline" className="bg-white">@DataReferencia</Badge>
                                <Badge variant="outline" className="bg-white">@OrdemId</Badge>
                                <Badge variant="outline" className="bg-white">@OrderItemId</Badge>
                                <Badge variant="outline" className="bg-white">@CobrancaDataIni</Badge>
                                <Badge variant="outline" className="bg-white">@CobrancaDataFim</Badge>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="pt-3">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700 text-white min-w-[130px] font-bold h-9">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                            Salvar Serviço
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}