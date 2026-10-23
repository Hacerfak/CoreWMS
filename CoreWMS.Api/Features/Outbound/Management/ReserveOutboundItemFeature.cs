using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

// ====================================================================
// 1. RESERVA SÍNCRONA DE VOLUMES FECHADOS
// ====================================================================
public record ReserveClosedVolumesCommand(
    Guid OrderId,
    Guid ProductId,
    List<Guid> HandlingUnitIds
) : IRequest<IResult>;

public class ReserveClosedVolumesHandler : IRequestHandler<ReserveClosedVolumesCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ReserveClosedVolumesHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ReserveClosedVolumesCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Ordem de saída não encontrada." });

        if (order.Status != OutboundOrderStatus.Pending && order.Status != OutboundOrderStatus.Allocated)
            return Results.BadRequest(new { Message = "Não é possível adicionar itens após o início da separação (Picking)." });

        var hasStartedPicking = await _db.OutboundAllocations
            .AnyAsync(a => a.OutboundOrderId == order.Id && a.IsPicked, ct);

        if (hasStartedPicking)
            return Results.BadRequest(new { Message = "A separação física deste pedido já foi iniciada no coletor. Não é mais possível adicionar itens." });

        var hus = await _db.HandlingUnits
            .Where(h => h.CompanyId == companyId &&
                        h.CustomerId == order.CustomerId &&
                        h.ProductId == request.ProductId &&
                        h.Status == HuStatus.Stored &&
                        h.QualityStatus == QualityStatus.Available &&
                        request.HandlingUnitIds.Contains(h.Id))
            .ToListAsync(ct);

        if (hus.Count != request.HandlingUnitIds.Count)
            return Results.BadRequest(new { Message = "Um ou mais volumes selecionados já foram reservados por outro pedido ou estão indisponíveis." });

        var alreadyAllocatedHuIds = await _db.OutboundAllocations
            .Where(a => request.HandlingUnitIds.Contains(a.HandlingUnitId) && !a.IsPicked)
            .Select(a => a.HandlingUnitId)
            .ToListAsync(ct);

        if (alreadyAllocatedHuIds.Any())
            return Results.Conflict(new { Message = "Um ou mais volumes selecionados acabaram de ser reservados por outro operador." });

        var orderItem = order.Items.FirstOrDefault(i => i.ProductId == request.ProductId);
        var product = await _db.Products.AsNoTracking().FirstAsync(p => p.Id == request.ProductId, ct);

        decimal totalQtyToAdd = hus.Sum(h => h.CurrentQuantity);

        if (orderItem == null)
        {
            orderItem = new OutboundOrderItem(order.Id, product.Id, order.Items.Count + 1, product.Sku, totalQtyToAdd, 0m);
            order.AddItem(orderItem);
        }
        else
        {
            orderItem.IncreaseExpectedQuantity(totalQtyToAdd);
        }

        // Busca alocações anteriores para incluir no cálculo do preço médio
        var existingAllocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderItemId == orderItem.Id)
            .Include(a => a.HandlingUnit)
            .Select(a => new { a.Quantity, UnitValue = a.HandlingUnit.UnitValue })
            .ToListAsync(ct);

        foreach (var hu in hus)
        {
            // Sempre será Volume Fechado
            var allocation = new OutboundAllocation(order.Id, orderItem.Id, hu.Id, hu.CurrentQuantity, isFractional: false);
            allocation.BindToOrderItem(orderItem);
            _db.OutboundAllocations.Add(allocation);
            orderItem.AddAllocatedQuantity(hu.CurrentQuantity);
        }

        // CÁLCULO DO PREÇO MÉDIO DE ENTRADA (INBOUND_UNIT_VALUE)
        decimal totalAllocQty = existingAllocations.Sum(a => a.Quantity) + hus.Sum(h => h.CurrentQuantity);
        if (totalAllocQty > 0)
        {
            decimal totalVal = existingAllocations.Sum(a => a.Quantity * a.UnitValue) + hus.Sum(h => h.CurrentQuantity * h.UnitValue);
            decimal avgUnitVal = Math.Round(totalVal / totalAllocQty, 4);

            orderItem.UpdateInboundUnitValue(avgUnitVal);

            if (order.IsReturnToCustomer && orderItem.UnitValue <= 0)
            {
                orderItem.UpdateUnitValue(avgUnitVal);
            }
        }

        var balance = await _db.InventoryBalances
            .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == request.ProductId && b.CustomerId == order.CustomerId, ct);
        if (balance != null) balance.AllocateForPicking(totalQtyToAdd);

        if (order.Items.All(i => i.AllocatedQuantity >= i.ExpectedQuantity))
        {
            order.UpdateStatus(OutboundOrderStatus.Allocated);
        }
        else
        {
            order.UpdateStatus(OutboundOrderStatus.Pending);
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = $"{hus.Count} volume(s) reservado(s) com sucesso na ordem." });
    }
}

// ====================================================================
// 2. RESERVA SÍNCRONA DE QUANTIDADE FRACIONADA
// ====================================================================
public record ReserveFractionalCommand(
    Guid OrderId,
    Guid ProductId,
    decimal Quantity
) : IRequest<IResult>;

public class ReserveFractionalHandler : IRequestHandler<ReserveFractionalCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ReserveFractionalHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ReserveFractionalCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Ordem de saída não encontrada." });

        if (order.Status != OutboundOrderStatus.Pending && order.Status != OutboundOrderStatus.Allocated)
            return Results.BadRequest(new { Message = "Não é possível adicionar itens após o início da separação (Picking)." });

        var hasStartedPicking = await _db.OutboundAllocations
            .AnyAsync(a => a.OutboundOrderId == order.Id && a.IsPicked, ct);

        if (hasStartedPicking)
            return Results.BadRequest(new { Message = "A separação física deste pedido já foi iniciada no coletor. Não é mais possível adicionar itens." });

        var product = await _db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == request.ProductId && p.CompanyId == companyId, ct);
        if (product == null) return Results.NotFound(new { Message = "Produto não encontrado." });

        var availableHus = await _db.HandlingUnits
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
            .Where(x => x.Hu.CurrentQuantity > x.AllocatedQty)
            .ToListAsync(ct);

        var sortedHus = availableHus
            .Select(x => new { x.Hu, FreeQty = x.Hu.CurrentQuantity - x.AllocatedQty })
            .OrderBy(x => x.FreeQty)
            .ThenBy(x => product.PickingStrategy == PickingStrategy.Fefo ? x.Hu.ExpirationDate : x.Hu.CreatedAt)
            .ToList();

        decimal remainingToReserve = request.Quantity;
        var reservedAllocations = new List<(OutboundAllocation Alloc, decimal UnitVal)>();

        foreach (var item in sortedHus)
        {
            if (remainingToReserve <= 0) break;
            var qtyToTake = Math.Min(remainingToReserve, item.FreeQty);

            // Sempre será Fracionado pela intenção da aba
            var alloc = new OutboundAllocation(order.Id, Guid.Empty, item.Hu.Id, qtyToTake, isFractional: true);
            reservedAllocations.Add((alloc, item.Hu.UnitValue));
            remainingToReserve -= qtyToTake;
        }

        if (remainingToReserve > 0)
            return Results.BadRequest(new { Message = $"Estoque livre insuficiente no momento. Faltou reservar {remainingToReserve} {product.BaseUnit}." });

        var orderItem = order.Items.FirstOrDefault(i => i.ProductId == request.ProductId);
        if (orderItem == null)
        {
            orderItem = new OutboundOrderItem(order.Id, product.Id, order.Items.Count + 1, product.Sku, request.Quantity, 0m);
            order.AddItem(orderItem);
        }
        else
        {
            orderItem.IncreaseExpectedQuantity(request.Quantity);
        }

        var existingAllocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderItemId == orderItem.Id)
            .Include(a => a.HandlingUnit)
            .Select(a => new { a.Quantity, UnitValue = a.HandlingUnit.UnitValue })
            .ToListAsync(ct);

        foreach (var (alloc, _) in reservedAllocations)
        {
            alloc.BindToOrderItem(orderItem);
            _db.OutboundAllocations.Add(alloc);
            orderItem.AddAllocatedQuantity(alloc.Quantity);
        }

        // CÁLCULO DO PREÇO MÉDIO DE ENTRADA (INBOUND_UNIT_VALUE)
        decimal totalAllocQty = existingAllocations.Sum(a => a.Quantity) + reservedAllocations.Sum(a => a.Alloc.Quantity);
        if (totalAllocQty > 0)
        {
            decimal totalVal = existingAllocations.Sum(a => a.Quantity * a.UnitValue) + reservedAllocations.Sum(a => a.Alloc.Quantity * a.UnitVal);
            decimal avgUnitVal = Math.Round(totalVal / totalAllocQty, 4);

            orderItem.UpdateInboundUnitValue(avgUnitVal);

            if (order.IsReturnToCustomer && orderItem.UnitValue <= 0)
            {
                orderItem.UpdateUnitValue(avgUnitVal);
            }
        }

        var balance = await _db.InventoryBalances
            .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == request.ProductId && b.CustomerId == order.CustomerId, ct);
        if (balance != null) balance.AllocateForPicking(request.Quantity);

        if (order.Items.All(i => i.AllocatedQuantity >= i.ExpectedQuantity))
        {
            order.UpdateStatus(OutboundOrderStatus.Allocated);
        }
        else
        {
            order.UpdateStatus(OutboundOrderStatus.Pending);
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = $"Reserva fracionada de {request.Quantity} {product.BaseUnit} concluída com sucesso." });
    }
}

// ====================================================================
// 3. REMOÇÃO DE ITEM / LIBERAÇÃO DE RESERVA
// ====================================================================
public record RemoveOutboundOrderItemCommand(Guid OrderId, Guid OrderItemId) : IRequest<IResult>;

public class RemoveOutboundOrderItemHandler : IRequestHandler<RemoveOutboundOrderItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public RemoveOutboundOrderItemHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(RemoveOutboundOrderItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var orderItem = await _db.OutboundOrderItems
            .Include(i => i.OutboundOrder)
                .ThenInclude(o => o.Items)
            .FirstOrDefaultAsync(i => i.Id == request.OrderItemId && i.OutboundOrderId == request.OrderId && i.OutboundOrder.CompanyId == companyId, ct);

        if (orderItem == null) return Results.NotFound(new { Message = "Item não encontrado." });

        var order = orderItem.OutboundOrder;

        if (order.Status != OutboundOrderStatus.Pending && order.Status != OutboundOrderStatus.Allocated)
            return Results.BadRequest(new { Message = "Não é possível remover itens de um pedido cuja separação já foi iniciada." });

        var allocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderItemId == orderItem.Id)
            .ToListAsync(ct);

        if (allocations.Any(a => a.IsPicked))
            return Results.BadRequest(new { Message = "Não é possível remover um item cujos volumes já foram fisicamente separados no coletor." });

        decimal totalReleased = allocations.Sum(a => a.Quantity);

        var balance = await _db.InventoryBalances
            .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == orderItem.ProductId && b.CustomerId == order.CustomerId, ct);
        if (balance != null) balance.UnallocateForPicking(totalReleased);

        _db.OutboundAllocations.RemoveRange(allocations);
        _db.OutboundOrderItems.Remove(orderItem);

        var remainingItems = order.Items.Where(i => i.Id != orderItem.Id).ToList();
        if (!remainingItems.Any() || remainingItems.Any(i => i.AllocatedQuantity < i.ExpectedQuantity))
        {
            order.UpdateStatus(OutboundOrderStatus.Pending);
        }
        else
        {
            order.UpdateStatus(OutboundOrderStatus.Allocated);
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Item e reservas estornados com sucesso." });
    }
}

public static class ReserveOutboundItemEndpoints
{
    public static void MapReserveOutboundItemEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/{orderId:guid}/items/reserve-volumes",
            async (Guid orderId, ReserveClosedVolumesCommand cmd, IMediator mediator) =>
                await mediator.Send(cmd with { OrderId = orderId }))
           .WithTags("Outbound").RequireAuthorization().RequirePermission(Permissions.Outbound.Manage);

        app.MapPost("/api/outbound/orders/{orderId:guid}/items/reserve-fractional",
            async (Guid orderId, ReserveFractionalCommand cmd, IMediator mediator) =>
                await mediator.Send(cmd with { OrderId = orderId }))
           .WithTags("Outbound").RequireAuthorization().RequirePermission(Permissions.Outbound.Manage);

        app.MapDelete("/api/outbound/orders/{orderId:guid}/items/{orderItemId:guid}",
            async (Guid orderId, Guid orderItemId, IMediator mediator) =>
                await mediator.Send(new RemoveOutboundOrderItemCommand(orderId, orderItemId)))
           .WithTags("Outbound").RequireAuthorization().RequirePermission(Permissions.Outbound.Manage);
    }
}