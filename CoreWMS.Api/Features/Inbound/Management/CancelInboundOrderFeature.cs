using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Management;

public record CancelInboundOrderCommand(Guid Id) : IRequest<IResult>;

public class CancelInboundOrderHandler : IRequestHandler<CancelInboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CancelInboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CancelInboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.InboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.Id, ct);

        if (order == null) return Results.NotFound();

        if (order.Items.Any(i => i.Status == InboundOrderItemStatus.Completed || i.ReceivedQuantity > 0))
            return Results.BadRequest(new { Message = "Não é possível cancelar uma ordem que já possui recebimentos parciais ou totais. Estorne as HUs primeiro." });

        if (order.Status == InboundOrderStatus.Canceled)
            return Results.BadRequest(new { Message = "A ordem já está cancelada." });

        order.UpdateStatus(InboundOrderStatus.Canceled);

        if (order.CustomerId.HasValue)
        {
            var customerId = order.CustomerId.Value;

            foreach (var item in order.Items.Where(i => i.ProductId.HasValue && i.ReceivedQuantity == 0))
            {
                var productId = item.ProductId!.Value;

                var balance = await _db.InventoryBalances
                    .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.CustomerId == customerId && b.ProductId == productId, ct);

                if (balance != null)
                {
                    balance.RemoveExpected(item.ExpectedQuantity);
                }
            }
        }

        foreach (var item in order.Items)
        {
            if (item.LockedByUserId.HasValue) item.Unlock();
        }

        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public static class CancelInboundOrderEndpoints
{
    public static void MapCancelInboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/inbound/{id:guid}/cancel", async (Guid id, IMediator mediator) => await mediator.Send(new CancelInboundOrderCommand(id)))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Manage);
    }
}