using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Classes.Flags;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual.Tipos; // <-- Resolve o CS0246 da OrigemMercadoria
using System.Text.RegularExpressions;

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
    string CstCsosn
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
    Guid? FiscalRuleId = null
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

        // 1. Busca todas as regras fiscais ativas para exibição no combo do front
        var allRules = await _db.FiscalOperationRules
            .AsNoTracking()
            .Include(r => r.Exceptions.Where(e => e.IsActive))
            .Where(r => r.CompanyId == companyId && r.IsActive)
            .OrderBy(r => r.Description)
            .ToListAsync(ct);

        // 2. Seleciona a regra solicitada ou a primeira regra ativa da empresa
        FiscalOperationRule? selectedRule = null;
        if (request.FiscalRuleId.HasValue)
        {
            selectedRule = allRules.FirstOrDefault(r => r.Id == request.FiscalRuleId.Value);
        }
        selectedRule ??= allRules.FirstOrDefault();

        // 3. Chaves de entrada referenciadas (NFref)
        var originAccessKeys = await _db.OutboundAllocations
            .AsNoTracking()
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .Join(_db.HandlingUnits.AsNoTracking().Where(h => h.CompanyId == order.CompanyId),
                a => a.HandlingUnitId, h => h.Id, (a, h) => h.ReceiptDocumentId)
            .Where(docId => docId.HasValue)
            .Join(_db.InboundOrders.AsNoTracking(),
                docId => docId, o => o.Id, (docId, o) => o.AccessKey)
            .Distinct()
            .ToListAsync(ct);

        // 4. Monta o espelho dos itens resolvendo CFOP e CST (com base na regra e linhas de exceção)
        var previewItems = new List<FiscalPreviewItemDto>();

        foreach (var item in order.Items.Where(i => i.PackedQuantity > 0))
        {
            var ncm = string.IsNullOrWhiteSpace(item.Product?.Ncm) ? "00000000" : Regex.Replace(item.Product.Ncm, @"\D", "");
            var origem = ObterOrigemProduto(item.Product);

            // Matching inteligente da exceção por NCM, UF de destino e Origem
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

            var totalItem = Math.Round(item.PackedQuantity * item.UnitValue, 2);

            previewItems.Add(new FiscalPreviewItemDto(
                item.ProductId,
                item.SkuCode,
                item.Product?.Description ?? item.SkuCode,
                item.Product?.BaseUnit ?? "UN",
                item.PackedQuantity,
                item.UnitValue,
                totalItem,
                cfop,
                cst
            ));
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
            SuggestedNfeCount: 1,
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
            async (Guid orderId, Guid? fiscalRuleId, IMediator mediator) =>
                await mediator.Send(new GetOutboundFiscalPreviewQuery(orderId, fiscalRuleId)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.View);
    }
}