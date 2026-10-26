using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record AvailableHuDto(
    Guid HandlingUnitId,
    string Lpn,
    string PackagingTypeCode,
    decimal CurrentQuantity,
    string LocationPath,
    string? InboundInvoiceNumber = null,
    string? Batch = null,
    DateTime? ManufactureDate = null,
    DateTime? ExpirationDate = null,
    string? SerialNumber = null
);

public record StockReceiptGroupDto(
    Guid? InboundOrderId,
    string ReceiptNumber,
    string? InboundInvoiceNumber,
    DateTime ReceiptDate,
    List<AvailableHuDto> AvailableHus
);

public record AvailableStockResponseDto(
    Guid ProductId,
    string Sku,
    string Description,
    string BaseUnit,
    string PickingStrategy,
    List<StockReceiptGroupDto> ReceiptGroups
);

public record GetOutboundAvailableStockQuery(Guid OrderId, Guid ProductId) : IRequest<IResult>;

public class GetOutboundAvailableStockHandler : IRequestHandler<GetOutboundAvailableStockQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetOutboundAvailableStockHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetOutboundAvailableStockQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Ordem de saída não encontrada." });

        var product = await _db.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.ProductId && p.CompanyId == companyId, ct);

        if (product == null) return Results.NotFound(new { Message = "Produto não encontrado." });

        var huQuery = _db.HandlingUnits
            .AsNoTracking()
            .Include(h => h.CurrentLocation)
            .Include(h => h.PackagingType)
            .Where(h => h.CompanyId == companyId &&
                        h.CustomerId == order.CustomerId &&
                        h.ProductId == request.ProductId &&
                        h.Status == HuStatus.Stored &&
                        h.QualityStatus == QualityStatus.Available)
            .Select(h => new
            {
                Hu = h,
                AllocatedQty = _db.OutboundAllocations.Where(a => a.HandlingUnitId == h.Id && !a.IsPicked).Sum(a => (decimal?)a.Quantity) ?? 0m
            })
            .Where(x => x.Hu.CurrentQuantity > x.AllocatedQty);

        if (product.PickingStrategy == PickingStrategy.Fefo)
            huQuery = huQuery.OrderBy(x => x.Hu.ExpirationDate).ThenBy(x => x.Hu.CreatedAt);
        else if (product.PickingStrategy == PickingStrategy.Fifo)
            huQuery = huQuery.OrderBy(x => x.Hu.CreatedAt);
        else
            huQuery = huQuery.OrderByDescending(x => x.Hu.CreatedAt);

        var husList = await huQuery.ToListAsync(ct);

        var receiptDocIds = husList
            .Where(x => x.Hu.ReceiptDocumentId.HasValue)
            .Select(x => x.Hu.ReceiptDocumentId!.Value)
            .Distinct()
            .ToList();

        var inboundOrders = await _db.InboundOrders
            .AsNoTracking()
            .Where(io => receiptDocIds.Contains(io.Id))
            .ToDictionaryAsync(io => io.Id, ct);

        string? GetInboundInvoiceNumber(Guid? docId)
        {
            if (!docId.HasValue || !inboundOrders.TryGetValue(docId.Value, out var inb))
                return null;

            return !string.IsNullOrWhiteSpace(inb.InvoiceNumber)
                ? inb.InvoiceNumber.TrimStart('0')
                : (!string.IsNullOrWhiteSpace(inb.AccessKey) && inb.AccessKey.Length >= 34
                    ? inb.AccessKey.Substring(25, 9).TrimStart('0')
                    : inb.InvoiceNumber);
        }

        // Agrupamento direto por NF-e de Entrada (ReceiptDocumentId)
        var receiptGroups = husList
            .GroupBy(h => h.Hu.ReceiptDocumentId)
            .Select(g =>
            {
                var invNumber = GetInboundInvoiceNumber(g.Key);
                var firstHu = g.First().Hu;
                var receiptDate = g.Key.HasValue && inboundOrders.TryGetValue(g.Key.Value, out var inb)
                    ? inb.IssueDate
                    : firstHu.CreatedAt;

                return new StockReceiptGroupDto(
                    g.Key,
                    invNumber ?? "SEM NF",
                    invNumber,
                    receiptDate,
                    g.Select(x => new AvailableHuDto(
                        x.Hu.Id,
                        x.Hu.Lpn,
                        x.Hu.PackagingType != null ? x.Hu.PackagingType.Code : "PLT",
                        x.Hu.CurrentQuantity - x.AllocatedQty,
                        x.Hu.CurrentLocation != null ? x.Hu.CurrentLocation.FullPath : "SEM ENDEREÇO",
                        invNumber,
                        x.Hu.Batch,
                        x.Hu.ManufactureDate,
                        x.Hu.ExpirationDate,
                        x.Hu.SerialNumber
                    )).ToList()
                );
            }).ToList();

        var response = new AvailableStockResponseDto(
            product.Id,
            product.Sku,
            product.Description,
            product.BaseUnit,
            product.PickingStrategy.ToString(),
            receiptGroups
        );

        return Results.Ok(response);
    }
}

public static class GetOutboundAvailableStockEndpoints
{
    public static void MapGetOutboundAvailableStockEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/outbound/orders/{orderId:guid}/available-stock/{productId:guid}",
            async (Guid orderId, Guid productId, IMediator mediator) =>
                await mediator.Send(new GetOutboundAvailableStockQuery(orderId, productId)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.View);
    }
}