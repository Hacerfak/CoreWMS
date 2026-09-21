using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Allocation;

public record AllocateOutboundOrderCommand(Guid OrderId) : IRequest<IResult>;

public class AllocateOutboundOrderHandler : IRequestHandler<AllocateOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public AllocateOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(AllocateOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
                .ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido não encontrado." });
        if (order.Status == OutboundOrderStatus.Allocated || order.Status == OutboundOrderStatus.Canceled || order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Este pedido não está em um status válido para alocação." });

        order.UpdateStatus(OutboundOrderStatus.Allocating);

        var itemsToAllocate = order.Items.Where(i => i.ExpectedQuantity > i.AllocatedQuantity).ToList();
        var errors = new List<string>();

        foreach (var item in itemsToAllocate)
        {
            var qtyNeeded = item.ExpectedQuantity - item.AllocatedQuantity;

            var huQuery = _db.HandlingUnits
                .Where(h => h.CompanyId == companyId &&
                            h.ProductId == item.ProductId &&
                            h.CustomerId == order.CustomerId &&
                            h.Status == HuStatus.Stored &&
                            h.QualityStatus == QualityStatus.Available)
                .Select(h => new
                {
                    Hu = h,
                    AllocatedAlready = _db.OutboundAllocations.Where(a => a.HandlingUnitId == h.Id && !a.IsPicked).Sum(a => (decimal?)a.Quantity) ?? 0m
                })
                .Where(x => x.Hu.CurrentQuantity > x.AllocatedAlready);

            if (item.Product.PickingStrategy == PickingStrategy.Fefo)
                huQuery = huQuery.OrderBy(x => x.Hu.ExpirationDate).ThenBy(x => x.Hu.CreatedAt);
            else if (item.Product.PickingStrategy == PickingStrategy.Fifo)
                huQuery = huQuery.OrderBy(x => x.Hu.CreatedAt);
            else
                huQuery = huQuery.OrderByDescending(x => x.Hu.CreatedAt);

            var availableHus = await huQuery.ToListAsync(ct);
            decimal totalAllocatedInThisRun = 0;

            foreach (var huData in availableHus)
            {
                if (qtyNeeded <= 0) break;
                var huAvailableQty = huData.Hu.CurrentQuantity - huData.AllocatedAlready;
                if (huAvailableQty <= 0) continue;

                var qtyToTake = Math.Min(qtyNeeded, huAvailableQty);
                var allocation = new OutboundAllocation(order.Id, item.Id, huData.Hu.Id, qtyToTake);

                _db.OutboundAllocations.Add(allocation);
                item.AddAllocatedQuantity(qtyToTake);

                qtyNeeded -= qtyToTake;
                totalAllocatedInThisRun += qtyToTake;
            }

            if (totalAllocatedInThisRun > 0)
            {
                var balance = await _db.InventoryBalances.FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == item.ProductId && b.CustomerId == order.CustomerId, ct);
                if (balance != null) balance.AllocateForPicking(totalAllocatedInThisRun);
            }

            if (qtyNeeded > 0)
            {
                errors.Add($"Estoque insuficiente para o Produto SKU {item.SkuCode}. Faltou alocar {qtyNeeded}.");
            }
        }

        if (order.Items.All(i => i.Status == OutboundOrderItemStatus.Allocated || i.Status == OutboundOrderItemStatus.Picked || i.Status == OutboundOrderItemStatus.Packed))
        {
            order.UpdateStatus(OutboundOrderStatus.Allocated);
        }

        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(new { Message = "Conflito de alocação (Outro operador reservou o estoque ao mesmo tempo). Tente novamente." }); }

        return Results.Ok(new
        {
            Message = errors.Any() ? "Alocação parcial concluída com avisos de falta de estoque." : "Alocação 100% concluída.",
            Status = order.Status.ToString(),
            Shortages = errors
        });
    }
}

public static class OutboundAllocationEndpoints
{
    public static void MapOutboundAllocationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/{id:guid}/allocate", async (Guid id, IMediator mediator) => await mediator.Send(new AllocateOutboundOrderCommand(id)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}