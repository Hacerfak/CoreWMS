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
    string LocationPath
);

public record StockReceiptGroupDto(
    Guid? InboundOrderId,
    string ReceiptNumber,
    DateTime ReceiptDate,
    string? Batch,
    DateTime? ExpirationDate,
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

        // Busca HUs em estoque (Stored + Available + Saldo > 0)
        var huQuery = _db.HandlingUnits
            .AsNoTracking()
            .Include(h => h.CurrentLocation)
            .Include(h => h.PackagingType)
            .Where(h => h.CompanyId == companyId &&
                        h.CustomerId == order.CustomerId &&
                        h.ProductId == request.ProductId &&
                        h.Status == HuStatus.Stored &&
                        h.QualityStatus == QualityStatus.Available &&
                        h.CurrentQuantity > 0);

        // Aplica ordenação pela estratégia logistica (FEFO, FIFO, LIFO)
        if (product.PickingStrategy == PickingStrategy.Fefo)
            huQuery = huQuery.OrderBy(h => h.ExpirationDate).ThenBy(h => h.CreatedAt);
        else if (product.PickingStrategy == PickingStrategy.Fifo)
            huQuery = huQuery.OrderBy(h => h.CreatedAt);
        else
            huQuery = huQuery.OrderByDescending(h => h.CreatedAt);

        var husList = await huQuery.ToListAsync(ct);

        // Agrupamento por Nota de Entrada / Lote
        var receiptGroups = husList
            .GroupBy(h => new { h.ReceiptDocumentId, h.Batch, h.ExpirationDate })
            .Select(g => new StockReceiptGroupDto(
                g.Key.ReceiptDocumentId,
                g.First().Batch ?? "SEM LOTE",
                g.First().CreatedAt,
                g.Key.Batch,
                g.Key.ExpirationDate,
                g.Select(h => new AvailableHuDto(
                    h.Id,
                    h.Lpn,
                    h.PackagingType != null ? h.PackagingType.Code : "UN",
                    h.CurrentQuantity,
                    h.CurrentLocation != null ? h.CurrentLocation.FullPath : "SEM ENDEREÇO"
                )).ToList()
            )).ToList();

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