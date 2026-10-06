using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Picking;

public record PickingAllocatedHuDto(
    Guid AllocationId,
    Guid HandlingUnitId,
    string Lpn,
    string? LocationPath,
    string? Batch,
    DateTime? ExpirationDate,
    decimal Quantity,
    bool IsPicked
);

public record PickingItemTaskDto(
    Guid OrderItemId,
    Guid ProductId,
    string SkuCode,
    string Description,
    string BaseUnit,
    decimal ExpectedQuantity,
    decimal AllocatedQuantity,
    decimal PickedQuantity,
    string Status,
    List<PickingAllocatedHuDto> Allocations
);

public record PickingOrderSummaryDto(
    Guid OrderId,
    string OrderNumber,
    string CustomerName,
    string? DestinationName,
    string Status,
    List<PickingItemTaskDto> Items
);

public record ListPickingTasksQuery(Guid OrderId) : IRequest<IResult>;

public class ListPickingTasksHandler : IRequestHandler<ListPickingTasksQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListPickingTasksHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListPickingTasksQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Include(o => o.Items)
                .ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        var allocations = await _db.OutboundAllocations
            .AsNoTracking()
            .Include(a => a.HandlingUnit)
                .ThenInclude(h => h.CurrentLocation)
            .Where(a => a.OutboundOrderId == order.Id)
            .ToListAsync(ct);

        var itemTasks = order.Items.OrderBy(i => i.LineNumber).Select(item =>
        {
            var itemAllocations = allocations
                .Where(a => a.OutboundOrderItemId == item.Id)
                .Select(a => new PickingAllocatedHuDto(
                    a.Id,
                    a.HandlingUnitId,
                    a.HandlingUnit.Lpn,
                    a.HandlingUnit.CurrentLocation != null ? a.HandlingUnit.CurrentLocation.FullPath : "SEM ENDEREÇO",
                    a.HandlingUnit.Batch,
                    a.HandlingUnit.ExpirationDate,
                    a.Quantity,
                    a.IsPicked
                )).ToList();

            return new PickingItemTaskDto(
                item.Id,
                item.ProductId,
                item.SkuCode,
                item.Product != null ? item.Product.Description : item.SkuCode,
                item.Product != null ? item.Product.BaseUnit : "UN",
                item.ExpectedQuantity,
                item.AllocatedQuantity,
                item.PickedQuantity,
                item.Status.ToString(),
                itemAllocations
            );
        }).ToList();

        var result = new PickingOrderSummaryDto(
            order.Id,
            order.OrderNumber,
            order.Customer.CorporateName,
            order.DestinationName,
            order.Status.ToString(),
            itemTasks
        );

        return Results.Ok(result);
    }
}

public static class ListPickingTasksEndpoints
{
    public static void MapListPickingTasksEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/outbound/picking/{orderId:guid}/tasks", async (Guid orderId, IMediator mediator) => await mediator.Send(new ListPickingTasksQuery(orderId)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}