using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Picking;

public record PickItemCommand(Guid OrderId, Guid AllocationId, string ScannedLpn, decimal PickedQuantity, bool ConfirmOverride = false) : IRequest<IResult>;

public class PickItemCommandValidator : AbstractValidator<PickItemCommand>
{
    public PickItemCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.AllocationId).NotEmpty();
        RuleFor(x => x.ScannedLpn).NotEmpty().MaximumLength(50);
        RuleFor(x => x.PickedQuantity).GreaterThan(0).WithMessage("A quantidade separada deve ser maior que zero.");
    }
}

public class PickItemHandler : IRequestHandler<PickItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public PickItemHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(PickItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var allocation = await _db.OutboundAllocations
            .Include(a => a.HandlingUnit)
            .Include(a => a.OutboundOrderItem)
            .Include(a => a.OutboundOrder)
            .FirstOrDefaultAsync(a => a.Id == request.AllocationId && a.OutboundOrder.CompanyId == companyId, ct);

        if (allocation == null) return Results.NotFound(new { Message = "Tarefa de separação não encontrada." });
        if (allocation.IsPicked) return Results.BadRequest(new { Message = "Esta tarefa já foi separada." });
        if (allocation.OutboundOrder.Status == OutboundOrderStatus.Canceled) return Results.BadRequest(new { Message = "Este pedido foi cancelado." });

        if (allocation.HandlingUnit.Lpn.ToUpper() != request.ScannedLpn.ToUpper())
        {
            if (!request.ConfirmOverride)
            {
                return Results.BadRequest(new
                {
                    Code = "LPN_MISMATCH_WARNING",
                    Message = $"A etiqueta sugerida era a {allocation.HandlingUnit.Lpn}, mas você bipou a {request.ScannedLpn.ToUpper()}. Deseja forçar a troca?"
                });
            }

            var newHu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.CompanyId == companyId && h.Lpn == request.ScannedLpn.ToUpper(), ct);
            if (newHu == null) return Results.BadRequest(new { Message = "A etiqueta bipada não existe no sistema." });
            if (newHu.ProductId != allocation.OutboundOrderItem.ProductId) return Results.BadRequest(new { Message = "A etiqueta bipada pertence a outro produto!" });
            if (newHu.QualityStatus != CoreWMS.Api.Features.Inventory.Enums.QualityStatus.Available) return Results.BadRequest(new { Message = "A etiqueta bipada está bloqueada/quarentena e não pode ser expedida." });

            var allocatedAlready = await _db.OutboundAllocations.Where(a => a.HandlingUnitId == newHu.Id && !a.IsPicked).SumAsync(a => (decimal?)a.Quantity, ct) ?? 0m;
            var availableQty = newHu.CurrentQuantity - allocatedAlready;

            if (availableQty < request.PickedQuantity)
                return Results.BadRequest(new { Message = $"A etiqueta bipada não possui saldo livre suficiente. Requer: {request.PickedQuantity}, Livre: {availableQty}." });

            allocation.SwapHandlingUnit(newHu);
        }

        if (request.PickedQuantity > allocation.Quantity)
            return Results.BadRequest(new { Message = $"Quantidade excede o limite. O sistema pediu apenas {allocation.Quantity} desta etiqueta." });

        allocation.GetType().GetProperty("Quantity")?.SetValue(allocation, request.PickedQuantity);
        allocation.MarkAsPicked();
        allocation.OutboundOrderItem.AddPickedQuantity(request.PickedQuantity);

        if (allocation.OutboundOrder.Status == OutboundOrderStatus.Allocated)
            allocation.OutboundOrder.UpdateStatus(OutboundOrderStatus.Picking);

        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(new { Message = "Erro de concorrência. Outro operador pode ter bipado este item." }); }

        return Results.Ok(new { Message = "Item separado com sucesso." });
    }
}

public static class OutboundPickingEndpoints
{
    public static void MapOutboundPickingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/picking/scan", async (PickItemCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}