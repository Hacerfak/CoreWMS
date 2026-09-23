using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record ShipOutboundOrderCommand(Guid OrderId) : IRequest<IResult>;

public class ShipOutboundOrderHandler : IRequestHandler<ShipOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public ShipOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(ShipOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status != OutboundOrderStatus.ReadyToShip)
            return Results.BadRequest(new { Message = "O pedido precisa estar com a conferência e embalagem concluídas (ReadyToShip) para ser expedido." });

        var allocations = await _db.OutboundAllocations
            .Include(a => a.HandlingUnit)
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .ToListAsync(ct);

        foreach (var alloc in allocations)
        {
            var hu = alloc.HandlingUnit;
            hu.Consume(alloc.Quantity);

            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == alloc.HandlingUnit.ProductId && b.CustomerId == order.CustomerId, ct);

            if (balance != null)
            {
                balance.ShipAllocated(alloc.Quantity);
            }

            await _kardex.WriteAsync(new InventoryTransaction(
                companyId, order.CustomerId, alloc.HandlingUnit.ProductId, hu.Id, order.DockLocationId,
                TransactionType.Outbound_FullPallet, -alloc.Quantity, hu.CurrentQuantity,
                order.Id, $"EXPEDIÇÃO NF/PEDIDO {order.OrderNumber}"), ct);
        }

        order.UpdateStatus(OutboundOrderStatus.Shipped);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Erro de concorrência ao expedir o pedido. Tente novamente." });
        }

        return Results.Ok(new { Message = $"Pedido {order.OrderNumber} expedido com sucesso. Estoque baixado e Kardex atualizado." });
    }
}

public static class ShipOutboundOrderEndpoints
{
    public static void MapShipOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/{orderId:guid}/ship", async (Guid orderId, IMediator mediator) =>
            await mediator.Send(new ShipOutboundOrderCommand(orderId)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}