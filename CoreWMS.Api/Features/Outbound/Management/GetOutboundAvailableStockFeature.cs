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
    decimal GrossWeight,
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

public record CustomerOrderLimitsDto(
    decimal? MaxWeightKg,
    Dictionary<string, int> PackagingTypeLimits // Ex: { "PAL": 32, "CX": 1350 }
);

public record AvailableStockResponseDto(
    Guid ProductId,
    string Sku,
    string Description,
    string BaseUnit,
    string PickingStrategy,
    CustomerOrderLimitsDto Limits,
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

        // 1. Busca a Ordem de Saída
        var order = await _db.OutboundOrders
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Ordem de saída não encontrada." });

        // 2. Busca o Produto e suas regras
        var product = await _db.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.ProductId && p.CompanyId == companyId, ct);

        if (product == null) return Results.NotFound(new { Message = "Produto não encontrado." });

        // 3. Busca os limites do Depositante (Peso + Limites por tipo de volume)
        var customerLimits = await _db.Customers
            .AsNoTracking()
            .Where(c => c.Id == order.CustomerId && c.CompanyId == companyId)
            .Select(c => new CustomerOrderLimitsDto(
                c.MaxStockVolume, // Ou campo específico de Peso Máximo por Pedido
                _db.Set<Entities.CustomerPackagingLimit>()
                    .Where(l => l.CustomerId == c.Id)
                    .ToDictionary(l => l.PackagingType.Code, l => l.MaxQuantityPerOrder)
            ))
            .FirstOrDefaultAsync(ct) ?? new CustomerOrderLimitsDto(null, new Dictionary<string, int>());

        // 4. Busca os HUs em estoque disponíveis para este Produto + Depositante
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

        // Aplicação da estratégia de ordenação (FIFO, FEFO, LIFO)
        if (product.PickingStrategy == PickingStrategy.Fefo)
            huQuery = huQuery.OrderBy(h => h.ExpirationDate).ThenBy(h => h.CreatedAt);
        else if (product.PickingStrategy == PickingStrategy.Fifo)
            huQuery = huQuery.OrderBy(h => h.CreatedAt);
        else
            huQuery = huQuery.OrderByDescending(h => h.CreatedAt);

        var husList = await huQuery.ToListAsync(ct);

        // 5. Agrupamento por Nota de Entrada / Lote
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
                    h.GrossWeight,
                    h.CurrentLocation != null ? h.CurrentLocation.FullPath : "SEM ENDEREÇO"
                )).ToList()
            )).ToList();

        var response = new AvailableStockResponseDto(
            product.Id,
            product.Sku,
            product.Description,
            product.BaseUnit,
            product.PickingStrategy.ToString(),
            customerLimits,
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