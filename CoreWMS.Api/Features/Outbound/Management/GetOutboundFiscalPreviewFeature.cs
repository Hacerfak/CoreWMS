using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

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
    string DefaultNaturezaOperacao,
    int DefaultIndFinal,       // 0 = Normal, 1 = Consumidor Final
    int DefaultIndPres,        // 1 = Presencial, 2 = Internet, 9 = Outros
    string? AdditionalNotes,
    decimal TotalProductsValue,
    List<FiscalPreviewItemDto> Items,
    List<string> ReferencedAccessKeys
);

public record GetOutboundFiscalPreviewQuery(
    Guid OrderId,
    FiscalOperationType? OperationType = null
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

        var operationType = request.OperationType ?? (order.IsReturnToCustomer
            ? FiscalOperationType.OutboundReturnNormal
            : FiscalOperationType.OutboundShipment);

        var destState = !string.IsNullOrWhiteSpace(order.DestinationState)
            ? order.DestinationState.Trim().ToUpper()
            : (order.Customer?.State?.Trim().ToUpper() ?? "RS");

        bool isInterstate = order.Company.State.Trim().ToUpper() != destState;

        // Chaves de entrada referenciadas (NFref)
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

        var previewItems = new List<FiscalPreviewItemDto>();

        foreach (var item in order.Items.Where(i => i.PackedQuantity > 0))
        {
            var rule = await _db.FiscalOperationRules
                .AsNoTracking()
                .Where(r => r.CompanyId == companyId && r.OperationType == operationType && r.IsActive)
                .Where(r => r.SpecificCustomerId == null || r.SpecificCustomerId == order.CustomerId)
                .Where(r => r.SpecificDestinationState == null || r.SpecificDestinationState == destState)
                .OrderByDescending(r => r.Priority)
                .FirstOrDefaultAsync(ct);

            var cfop = rule != null
                ? (isInterstate ? rule.CfopInterstate : rule.CfopStateInternal)
                : (isInterstate ? "6906" : "5906");

            var cst = rule?.CstCsosnIcms ?? "400";
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

        var dto = new OutboundFiscalPreviewDto(
            order.Id,
            order.OrderNumber,
            order.Customer.CorporateName,
            order.DestinationName ?? order.Customer.CorporateName,
            destState,
            isInterstate,
            SuggestedNfeCount: 1,
            DefaultNaturezaOperacao: operationType == FiscalOperationType.OutboundShipment ? "REMESSA POR CONTA E ORDEM" : "RETORNO DE ARMAZEM GERAL",
            DefaultIndFinal: order.DestinationIeIndicator == 9 ? 1 : 0, // Se não contribuinte, consumidor final
            DefaultIndPres: 9, // Presença do comprador (9=Outros)
            AdditionalNotes: order.AdditionalNotes,
            TotalProductsValue: previewItems.Sum(i => i.TotalValue),
            previewItems,
            originAccessKeys
        );

        return Results.Ok(dto);
    }
}

public static class GetOutboundFiscalPreviewEndpoints
{
    public static void MapGetOutboundFiscalPreviewEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/outbound/orders/{orderId:guid}/fiscal-preview",
            async (Guid orderId, FiscalOperationType? operationType, IMediator mediator) =>
                await mediator.Send(new GetOutboundFiscalPreviewQuery(orderId, operationType)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.View);
    }
}