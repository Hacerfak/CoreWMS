using System.Text.RegularExpressions;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Classes.Flags;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual.Tipos;

namespace CoreWMS.Api.Features.Outbound.Management;

public record FiscalPreviewRuleOptionDto(
    Guid Id,
    string Description,
    int Finalidade,
    string CfopStateInternal,
    string CfopInterstate
);

public record FiscalPreviewItemDto(
    Guid ProductId,
    string SkuCode,
    string Description,
    string Unit,
    decimal Quantity,
    decimal UnitValue,
    decimal TotalValue,
    string Cfop,
    string CstCsosn,
    string? InboundInvoiceNumber = null,
    string? Batch = null
);

public record OutboundFiscalPreviewDto(
    Guid OrderId,
    string OrderNumber,
    string CustomerName,
    string DestinationName,
    string DestinationState,
    bool IsInterstate,
    int SuggestedNfeCount,
    Guid? DefaultFiscalRuleId,
    string DefaultNaturezaOperacao,
    int DefaultIndFinal,       // 0 = Normal, 1 = Consumidor Final
    int DefaultIndPres,        // 1 = Presencial, 2 = Internet, 9 = Outros
    int DefaultTpImp,          // 1 = Retrato, 2 = Paisagem
    string? AdditionalNotes,
    decimal TotalProductsValue,
    List<FiscalPreviewItemDto> Items,
    List<string> ReferencedAccessKeys,
    List<FiscalPreviewRuleOptionDto> FiscalRules
);

public record GetOutboundFiscalPreviewQuery(
    Guid OrderId,
    Guid? FiscalRuleId = null,
    Guid? InboundOrderIdFilter = null
) : IRequest<IResult>;

public class GetOutboundFiscalPreviewHandler : IRequestHandler<GetOutboundFiscalPreviewQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetOutboundFiscalPreviewHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetOutboundFiscalPreviewQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .AsNoTracking()
            .Include(o => o.Company)
            .Include(o => o.Customer)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        var destState = !string.IsNullOrWhiteSpace(order.DestinationState)
            ? order.DestinationState.Trim().ToUpper()
            : (order.Customer?.State?.Trim().ToUpper() ?? "RS");

        bool isInterstate = order.Company.State.Trim().ToUpper() != destState;

        // 1. Procura todas as naturezas/regras fiscais ativas da empresa
        var allRules = await _db.FiscalOperationRules
            .AsNoTracking()
            .Include(r => r.Exceptions.Where(e => e.IsActive))
            .Where(r => r.CompanyId == companyId && r.IsActive)
            .OrderBy(r => r.Description)
            .ToListAsync(ct);

        // 2. Seleciona a regra requisitada ou a primeira regra ativa disponível
        FiscalOperationRule? selectedRule = null;
        if (request.FiscalRuleId.HasValue)
        {
            selectedRule = allRules.FirstOrDefault(r => r.Id == request.FiscalRuleId.Value);
        }
        selectedRule ??= allRules.FirstOrDefault();

        // 3. Obtém as alocações colhidas e as respetivas NFs de entrada (Remessa de Armazém)
        var allocationsQuery = _db.OutboundAllocations
            .AsNoTracking()
            .Include(a => a.HandlingUnit)
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked);

        var allocations = await allocationsQuery.ToListAsync(ct);

        var receiptDocIds = allocations
            .Where(a => a.HandlingUnit?.ReceiptDocumentId != null)
            .Select(a => a.HandlingUnit!.ReceiptDocumentId!.Value)
            .Distinct()
            .ToList();

        var inboundOrders = await _db.InboundOrders
            .AsNoTracking()
            .Where(io => receiptDocIds.Contains(io.Id))
            .ToDictionaryAsync(io => io.Id, ct);

        // Filtra por NF de entrada específica se solicitado
        if (request.InboundOrderIdFilter.HasValue && request.InboundOrderIdFilter.Value != Guid.Empty)
        {
            allocations = allocations
                .Where(a => a.HandlingUnit?.ReceiptDocumentId == request.InboundOrderIdFilter.Value)
                .ToList();
        }

        // Determina a quantidade sugerida de notas fiscais com base no parâmetro do cliente depositante
        int suggestedNfeCount = 1;
        if (order.Customer?.ReturnInvoicePerReferencedInvoice == true && receiptDocIds.Count > 1)
        {
            suggestedNfeCount = receiptDocIds.Count;
        }

        // Chaves de entrada referenciadas (NFref)
        var originAccessKeys = allocations
            .Where(a => a.HandlingUnit?.ReceiptDocumentId != null && inboundOrders.ContainsKey(a.HandlingUnit.ReceiptDocumentId.Value))
            .Select(a => inboundOrders[a.HandlingUnit!.ReceiptDocumentId!.Value].AccessKey)
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Distinct()
            .ToList()!;

        // 4. Monta o espelho analítico de itens desmembrando por SKU + NF de Entrada (sem agrupar origens distintas)
        var previewItems = new List<FiscalPreviewItemDto>();

        var groupedAllocations = allocations
            .GroupBy(a => new
            {
                a.OutboundOrderItemId,
                ReceiptDocumentId = a.HandlingUnit?.ReceiptDocumentId
            })
            .ToList();

        if (groupedAllocations.Any())
        {
            foreach (var group in groupedAllocations)
            {
                var item = order.Items.FirstOrDefault(i => i.Id == group.Key.OutboundOrderItemId);
                if (item?.Product == null) continue;

                decimal itemGroupQuantity = group.Sum(a => a.Quantity);
                if (itemGroupQuantity <= 0) continue;

                var ncm = string.IsNullOrWhiteSpace(item.Product.Ncm) ? "00000000" : Regex.Replace(item.Product.Ncm, @"\D", "");
                var origem = ObterOrigemProduto(item.Product);

                var matchedException = selectedRule?.Exceptions?
                    .Where(e => e.IsActive)
                    .Where(e => string.IsNullOrWhiteSpace(e.SpecificDestinationState) || e.SpecificDestinationState == destState)
                    .Where(e => string.IsNullOrWhiteSpace(e.SpecificNcmStart) || ncm.StartsWith(e.SpecificNcmStart))
                    .Where(e => !e.SpecificOrigin.HasValue || e.SpecificOrigin.Value == (int)origem)
                    .OrderByDescending(e =>
                        (!string.IsNullOrWhiteSpace(e.SpecificNcmStart) ? 4 : 0) +
                        (!string.IsNullOrWhiteSpace(e.SpecificDestinationState) ? 2 : 0) +
                        (e.SpecificOrigin.HasValue ? 1 : 0))
                    .FirstOrDefault();

                var cfopInterno = matchedException?.CfopStateInternal ?? selectedRule?.CfopStateInternal ?? "5906";
                var cfopInter = matchedException?.CfopInterstate ?? selectedRule?.CfopInterstate ?? "6906";
                var cfop = isInterstate ? cfopInter : cfopInterno;
                var cst = matchedException?.CstCsosnIcms ?? selectedRule?.CstCsosnIcms ?? "400";

                bool isRetornoArmazem = cfop is "5906" or "6906" or "5907" or "6907"
                                     || (selectedRule != null && selectedRule.CfopStateInternal is "5906" or "5907");

                var unitValue = isRetornoArmazem
                    ? (item.InboundUnitValue > 0 ? item.InboundUnitValue : item.UnitValue)
                    : (item.UnitValue > 0 ? item.UnitValue : item.InboundUnitValue);

                string? inboundInvoiceNumber = null;
                if (group.Key.ReceiptDocumentId.HasValue && inboundOrders.TryGetValue(group.Key.ReceiptDocumentId.Value, out var inb))
                {
                    inboundInvoiceNumber = !string.IsNullOrWhiteSpace(inb.InvoiceNumber)
                        ? inb.InvoiceNumber.TrimStart('0')
                        : (!string.IsNullOrWhiteSpace(inb.AccessKey) && inb.AccessKey.Length >= 34
                            ? inb.AccessKey.Substring(25, 9).TrimStart('0')
                            : inb.InvoiceNumber);
                }

                var batches = group
                    .Where(a => !string.IsNullOrWhiteSpace(a.HandlingUnit?.Batch))
                    .Select(a => a.HandlingUnit!.Batch!.Trim())
                    .Distinct()
                    .ToList();

                var complementDetails = new List<string>();
                if (!string.IsNullOrWhiteSpace(inboundInvoiceNumber))
                {
                    complementDetails.Add($"NF Remessa: {inboundInvoiceNumber}");
                }
                if (batches.Any())
                {
                    complementDetails.Add($"Lote: {string.Join(", ", batches)}");
                }

                var baseDescription = item.Product.Description ?? item.SkuCode;
                var fullDescription = complementDetails.Any()
                    ? $"{baseDescription} ({string.Join(" | ", complementDetails)})"
                    : baseDescription;

                var totalItem = Math.Round(itemGroupQuantity * unitValue, 2);

                previewItems.Add(new FiscalPreviewItemDto(
                    item.ProductId,
                    item.SkuCode,
                    fullDescription,
                    item.Product.BaseUnit ?? "UN",
                    itemGroupQuantity,
                    unitValue,
                    totalItem,
                    cfop,
                    cst,
                    inboundInvoiceNumber,
                    batches.FirstOrDefault()
                ));
            }
        }
        else
        {
            // Fallback caso a ordem ainda não possua separação física registrada
            foreach (var item in order.Items.Where(i => i.PackedQuantity > 0 || i.ExpectedQuantity > 0))
            {
                var qty = item.PackedQuantity > 0 ? item.PackedQuantity : item.ExpectedQuantity;
                if (item.Product == null || qty <= 0) continue;

                var ncm = string.IsNullOrWhiteSpace(item.Product.Ncm) ? "00000000" : Regex.Replace(item.Product.Ncm, @"\D", "");
                var origem = ObterOrigemProduto(item.Product);

                var matchedException = selectedRule?.Exceptions?
                    .Where(e => e.IsActive)
                    .Where(e => string.IsNullOrWhiteSpace(e.SpecificDestinationState) || e.SpecificDestinationState == destState)
                    .Where(e => string.IsNullOrWhiteSpace(e.SpecificNcmStart) || ncm.StartsWith(e.SpecificNcmStart))
                    .Where(e => !e.SpecificOrigin.HasValue || e.SpecificOrigin.Value == (int)origem)
                    .OrderByDescending(e =>
                        (!string.IsNullOrWhiteSpace(e.SpecificNcmStart) ? 4 : 0) +
                        (!string.IsNullOrWhiteSpace(e.SpecificDestinationState) ? 2 : 0) +
                        (e.SpecificOrigin.HasValue ? 1 : 0))
                    .FirstOrDefault();

                var cfopInterno = matchedException?.CfopStateInternal ?? selectedRule?.CfopStateInternal ?? "5906";
                var cfopInter = matchedException?.CfopInterstate ?? selectedRule?.CfopInterstate ?? "6906";
                var cfop = isInterstate ? cfopInter : cfopInterno;
                var cst = matchedException?.CstCsosnIcms ?? selectedRule?.CstCsosnIcms ?? "400";

                bool isRetornoArmazem = cfop is "5906" or "6906" or "5907" or "6907"
                                     || (selectedRule != null && selectedRule.CfopStateInternal is "5906" or "5907");

                var unitValue = isRetornoArmazem
                    ? (item.InboundUnitValue > 0 ? item.InboundUnitValue : item.UnitValue)
                    : (item.UnitValue > 0 ? item.UnitValue : item.InboundUnitValue);

                var totalItem = Math.Round(qty * unitValue, 2);

                previewItems.Add(new FiscalPreviewItemDto(
                    item.ProductId,
                    item.SkuCode,
                    item.Product.Description ?? item.SkuCode,
                    item.Product.BaseUnit ?? "UN",
                    qty,
                    unitValue,
                    totalItem,
                    cfop,
                    cst
                ));
            }
        }

        var fiscalRuleOptions = allRules.Select(r => new FiscalPreviewRuleOptionDto(
            r.Id,
            r.Description,
            (int)r.Finalidade,
            r.CfopStateInternal,
            r.CfopInterstate
        )).ToList();

        var customerName = order.Customer?.CorporateName ?? "NÃO INFORMADO";

        var dto = new OutboundFiscalPreviewDto(
            order.Id,
            order.OrderNumber,
            customerName,
            order.DestinationName ?? customerName,
            destState,
            isInterstate,
            suggestedNfeCount,
            DefaultFiscalRuleId: selectedRule?.Id,
            DefaultNaturezaOperacao: selectedRule?.Description ?? "RETORNO DE ARMAZEM GERAL",
            DefaultIndFinal: order.DestinationIeIndicator == 9 ? 1 : 0,
            DefaultIndPres: 9,
            DefaultTpImp: 1,
            AdditionalNotes: order.AdditionalNotes,
            TotalProductsValue: previewItems.Sum(i => i.TotalValue),
            previewItems,
            originAccessKeys,
            fiscalRuleOptions
        );

        return Results.Ok(dto);
    }

    private static OrigemMercadoria ObterOrigemProduto(object? product)
    {
        if (product == null) return OrigemMercadoria.OmNacional;
        var prop = product.GetType().GetProperty("Origin") ?? product.GetType().GetProperty("Origem");
        if (prop != null)
        {
            var val = prop.GetValue(product);
            if (val is int intVal && Enum.IsDefined(typeof(OrigemMercadoria), intVal))
                return (OrigemMercadoria)intVal;
            if (val is OrigemMercadoria origEnum)
                return origEnum;
            if (val != null && int.TryParse(val.ToString(), out var parsedInt) && Enum.IsDefined(typeof(OrigemMercadoria), parsedInt))
                return (OrigemMercadoria)parsedInt;
        }
        return OrigemMercadoria.OmNacional;
    }
}

public static class GetOutboundFiscalPreviewEndpoints
{
    public static void MapGetOutboundFiscalPreviewEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/outbound/orders/{orderId:guid}/fiscal-preview",
            async (Guid orderId, Guid? fiscalRuleId, Guid? inboundOrderIdFilter, IMediator mediator) =>
                await mediator.Send(new GetOutboundFiscalPreviewQuery(orderId, fiscalRuleId, inboundOrderIdFilter)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.View);
    }
}