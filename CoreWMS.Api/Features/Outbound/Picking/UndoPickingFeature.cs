using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Picking;

// 1. Reverter Separação de uma HU Específica (Estorno Individual)
public record UndoPickAllocationCommand(Guid OrderId, Guid AllocationId) : IRequest<IResult>;

// 2. Reiniciar Todo o Processo de Separação da Ordem (Estorno Geral)
public record ResetOrderPickingCommand(Guid OrderId) : IRequest<IResult>;

public class UndoPickingHandler :
    IRequestHandler<UndoPickAllocationCommand, IResult>,
    IRequestHandler<ResetOrderPickingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UndoPickingHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    // ESTORNO DE UMA HU INDIVIDUAL
    public async Task<IResult> Handle(UndoPickAllocationCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });
        if (order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Não é possível estornar separação de um pedido já expedido." });

        var alloc = await _db.OutboundAllocations
            .Include(a => a.HandlingUnit)
            .FirstOrDefaultAsync(a => a.Id == request.AllocationId && a.OutboundOrderId == order.Id, ct);

        if (alloc == null) return Results.NotFound(new { Message = "Alocação/HU não encontrada neste pedido." });
        if (!alloc.IsPicked) return Results.BadRequest(new { Message = "Esta HU ainda não foi marcada como recolhida." });

        var item = order.Items.FirstOrDefault(i => i.Id == alloc.OutboundOrderItemId);
        if (item != null)
        {
            item.AddPickedQuantity(-alloc.Quantity);
        }

        // Se houve auto-packing do volume fechado, estorna o volume também
        var autoVol = order.Volumes.FirstOrDefault(v => v.VolumeLpn == alloc.HandlingUnit.Lpn && v.IsAutoPacked);
        if (autoVol != null)
        {
            _db.OutboundVolumes.Remove(autoVol);
            item?.AddPackedQuantity(-alloc.Quantity);
        }

        // Volta a alocação para não recolhida
        var propIsPicked = typeof(OutboundAllocation).GetProperty("IsPicked");
        var propPickedByName = typeof(OutboundAllocation).GetProperty("PickedByName");
        var propPickedAt = typeof(OutboundAllocation).GetProperty("PickedAt");
        var propPickedByUserId = typeof(OutboundAllocation).GetProperty("PickedByUserId");

        propIsPicked?.SetValue(alloc, false);
        propPickedByName?.SetValue(alloc, null);
        propPickedAt?.SetValue(alloc, null);
        propPickedByUserId?.SetValue(alloc, null);

        order.RefreshStatusAfterProgress();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Separação da HU {alloc.HandlingUnit.Lpn} ({alloc.Quantity} un) estornada com sucesso!",
            OrderStatus = order.Status.ToString()
        });
    }

    // RESET COMPLETO DA SEPARAÇÃO DO PEDIDO
    public async Task<IResult> Handle(ResetOrderPickingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });
        if (order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Não é possível reiniciar um pedido já expedido." });

        var allocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .ToListAsync(ct);

        foreach (var a in allocations)
        {
            typeof(OutboundAllocation).GetProperty("IsPicked")?.SetValue(a, false);
            typeof(OutboundAllocation).GetProperty("PickedByName")?.SetValue(a, null);
            typeof(OutboundAllocation).GetProperty("PickedAt")?.SetValue(a, null);
            typeof(OutboundAllocation).GetProperty("PickedByUserId")?.SetValue(a, null);
        }

        // Remove volumes gerados automaticamente no picking
        var autoVolumes = order.Volumes.Where(v => v.IsAutoPacked).ToList();
        if (autoVolumes.Any())
        {
            _db.OutboundVolumes.RemoveRange(autoVolumes);
        }

        // Zera contadores de separação nos itens
        foreach (var i in order.Items)
        {
            var propPickedQty = typeof(OutboundOrderItem).GetProperty("PickedQuantity");
            propPickedQty?.SetValue(i, 0m);

            if (autoVolumes.Any())
            {
                var propPackedQty = typeof(OutboundOrderItem).GetProperty("PackedQuantity");
                propPackedQty?.SetValue(i, 0m);
            }
        }

        order.UpdateStatus(OutboundOrderStatus.Allocated);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = "Toda a separação do pedido foi estornada e o status reiniciado para 'Alocado'.",
            OrderStatus = order.Status.ToString()
        });
    }
}

public static class UndoPickingEndpoints
{
    public static void MapUndoPickingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbound/picking").WithTags("Outbound").RequireAuthorization();

        // Estorno individual de uma HU
        group.MapPost("/orders/{orderId:guid}/undo/{allocationId:guid}",
            async (Guid orderId, Guid allocationId, IMediator mediator) =>
                await mediator.Send(new UndoPickAllocationCommand(orderId, allocationId)))
            .RequirePermission(Permissions.Outbound.Manage);

        // Reset geral da separação do pedido
        group.MapPost("/orders/{orderId:guid}/reset",
            async (Guid orderId, IMediator mediator) =>
                await mediator.Send(new ResetOrderPickingCommand(orderId)))
            .RequirePermission(Permissions.Outbound.Manage);
    }
}