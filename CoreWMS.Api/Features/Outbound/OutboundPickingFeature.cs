using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound;

// ==========================================
// 1. DTOs e Contratos
// ==========================================
public record PickingTaskDto(
    Guid AllocationId,
    Guid ItemId,
    string SkuCode,
    string Description,
    string LocationPath,
    string ExpectedLpn,
    string? Batch,
    DateTime? ExpirationDate,
    decimal QuantityToPick,
    bool IsPicked);

public record ListPickingTasksQuery(Guid OrderId) : IRequest<IResult>;

public record PickItemCommand(Guid OrderId, Guid AllocationId, string ScannedLpn, decimal PickedQuantity, bool ConfirmOverride = false) : IRequest<IResult>;

// ==========================================
// 2. Validadores
// ==========================================
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

// ==========================================
// 3. Handlers
// ==========================================
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

        // Traz as tarefas ordenadas pelo Endereço Físico (Roteirização básica em ordem alfabética de corredor)
        var tasks = await _db.OutboundAllocations
            .AsNoTracking()
            .Include(a => a.HandlingUnit)
                .ThenInclude(h => h.CurrentLocation)
            .Include(a => a.OutboundOrderItem)
                .ThenInclude(i => i.Product)
            .Where(a => a.OutboundOrder.CompanyId == companyId && a.OutboundOrderId == request.OrderId)
            .OrderBy(a => a.HandlingUnit.CurrentLocation != null ? a.HandlingUnit.CurrentLocation.FullPath : "ZZZ")
            .Select(a => new PickingTaskDto(
                a.Id,
                a.OutboundOrderItemId,
                a.OutboundOrderItem.SkuCode,
                a.OutboundOrderItem.Product.Description,
                a.HandlingUnit.CurrentLocation != null ? a.HandlingUnit.CurrentLocation.FullPath : "SEM ENDEREÇO",
                a.HandlingUnit.Lpn,
                a.HandlingUnit.Batch,
                a.HandlingUnit.ExpirationDate,
                a.Quantity,
                a.IsPicked
            ))
            .ToListAsync(ct);

        return Results.Ok(tasks);
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

        // ========================================================
        // REGRA DE BYPASS (BLOCADO E TROCA DE HU)
        // ========================================================
        if (allocation.HandlingUnit.Lpn.ToUpper() != request.ScannedLpn.ToUpper())
        {
            // Se o app não enviou a confirmação, devolvemos o alerta para o usuário decidir
            if (!request.ConfirmOverride)
            {
                return Results.BadRequest(new
                {
                    Code = "LPN_MISMATCH_WARNING",
                    Message = $"A etiqueta sugerida era a {allocation.HandlingUnit.Lpn}, mas você bipou a {request.ScannedLpn.ToUpper()}. Deseja forçar a troca?"
                });
            }

            // O usuário confirmou! Vamos validar se a nova HU serve para o picking
            var newHu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.CompanyId == companyId && h.Lpn == request.ScannedLpn.ToUpper(), ct);

            if (newHu == null)
                return Results.BadRequest(new { Message = "A etiqueta bipada não existe no sistema." });

            if (newHu.ProductId != allocation.OutboundOrderItem.ProductId)
                return Results.BadRequest(new { Message = "A etiqueta bipada pertence a outro produto!" });

            if (newHu.QualityStatus != CoreWMS.Api.Features.Inventory.Enums.QualityStatus.Available)
                return Results.BadRequest(new { Message = "A etiqueta bipada está bloqueada/quarentena e não pode ser expedida." });

            // Calcula se a nova HU tem saldo livre suficiente (Saldo Atual - Outras Alocações já pendentes nela)
            var allocatedAlready = await _db.OutboundAllocations
                .Where(a => a.HandlingUnitId == newHu.Id && !a.IsPicked)
                .SumAsync(a => (decimal?)a.Quantity, ct) ?? 0m;

            var availableQty = newHu.CurrentQuantity - allocatedAlready;

            if (availableQty < request.PickedQuantity)
                return Results.BadRequest(new { Message = $"A etiqueta bipada não possui saldo livre suficiente. Requer: {request.PickedQuantity}, Livre: {availableQty}." });

            // Tudo certo, faz o Swap físico na tarefa!
            allocation.SwapHandlingUnit(newHu);
        }

        // ========================================================
        // EFETIVAÇÃO DO PICKING
        // ========================================================
        if (request.PickedQuantity > allocation.Quantity)
            return Results.BadRequest(new { Message = $"Quantidade excede o limite. O sistema pediu apenas {allocation.Quantity} desta etiqueta." });

        // Ajusta a quantidade se o operador encontrou menos peças (furo físico)
        allocation.GetType().GetProperty("Quantity")?.SetValue(allocation, request.PickedQuantity);
        allocation.MarkAsPicked();

        allocation.OutboundOrderItem.AddPickedQuantity(request.PickedQuantity);

        if (allocation.OutboundOrder.Status == OutboundOrderStatus.Allocated)
            allocation.OutboundOrder.UpdateStatus(OutboundOrderStatus.Picking);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Erro de concorrência. Outro operador pode ter bipado este item." });
        }

        return Results.Ok(new { Message = "Item separado com sucesso." });
    }
}

// ==========================================
// 4. Endpoints
// ==========================================
public static class OutboundPickingEndpoints
{
    public static void MapOutboundPickingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbound/picking").WithTags("Outbound").RequireAuthorization();

        group.MapGet("/{orderId:guid}/tasks", async (Guid orderId, IMediator mediator) =>
            await mediator.Send(new ListPickingTasksQuery(orderId)))
            .RequirePermission(Permissions.Outbound.Manage);

        group.MapPost("/scan", async (PickItemCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .RequirePermission(Permissions.Outbound.Manage);
    }
}