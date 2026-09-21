using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Picking;

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

        var tasks = await _db.OutboundAllocations
            .AsNoTracking()
            .Include(a => a.HandlingUnit)
                .ThenInclude(h => h.CurrentLocation)
            .Include(a => a.OutboundOrderItem)
                .ThenInclude(i => i.Product)
            .Where(a => a.OutboundOrder.CompanyId == companyId && a.OutboundOrderId == request.OrderId)
            .OrderBy(a => a.HandlingUnit.CurrentLocation != null ? a.HandlingUnit.CurrentLocation.FullPath : "ZZZ")
            .Select(a => new PickingTaskDto(
                a.Id, a.OutboundOrderItemId, a.OutboundOrderItem.SkuCode, a.OutboundOrderItem.Product.Description,
                a.HandlingUnit.CurrentLocation != null ? a.HandlingUnit.CurrentLocation.FullPath : "SEM ENDEREÇO",
                a.HandlingUnit.Lpn, a.HandlingUnit.Batch, a.HandlingUnit.ExpirationDate,
                a.Quantity, a.IsPicked
            ))
            .ToListAsync(ct);

        return Results.Ok(tasks);
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