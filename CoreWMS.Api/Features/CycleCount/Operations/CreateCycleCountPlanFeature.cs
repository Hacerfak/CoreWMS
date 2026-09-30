using CoreWMS.Api.Features.CycleCount.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record CreateCycleCountPlanCommand(
    string Name,
    bool BlockMovements,
    int MaxRounds,
    bool EnableAdjustments,
    Guid? AssignedUserId,
    List<Guid>? CustomerIds,
    List<Guid>? ProductIds,
    List<Guid>? LocationIds,
    string? Batch
) : IRequest<IResult>;

public class CreateCycleCountPlanCommandValidator : AbstractValidator<CreateCycleCountPlanCommand>
{
    public CreateCycleCountPlanCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Informe o nome do plano de inventário.").MaximumLength(150);
        RuleFor(x => x.MaxRounds).InclusiveBetween(1, 3).WithMessage("O número máximo de rodadas deve ser entre 1 e 3.");
    }
}

public class CreateCycleCountPlanHandler : IRequestHandler<CreateCycleCountPlanCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateCycleCountPlanHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CreateCycleCountPlanCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var plan = new CycleCountPlan(
            companyId,
            request.Name.Trim(),
            request.BlockMovements,
            request.MaxRounds,
            request.EnableAdjustments,
            request.AssignedUserId,
            request.CustomerIds,
            request.ProductIds,
            request.LocationIds,
            request.Batch?.Trim()
        );

        _db.CycleCountPlans.Add(plan);

        // Snapshot de Saldos por Posição cruzando as listas selecionadas
        var huQuery = _db.HandlingUnits.AsNoTracking()
            .Include(h => h.CurrentLocation)
                .ThenInclude(l => l!.StorageType)
            .Where(h => h.CompanyId == companyId && h.CurrentLocationId.HasValue);

        if (request.CustomerIds != null && request.CustomerIds.Count > 0)
            huQuery = huQuery.Where(h => request.CustomerIds.Contains(h.CustomerId));

        if (request.ProductIds != null && request.ProductIds.Count > 0)
            huQuery = huQuery.Where(h => request.ProductIds.Contains(h.ProductId));

        if (request.LocationIds != null && request.LocationIds.Count > 0)
            huQuery = huQuery.Where(h => request.LocationIds.Contains(h.CurrentLocationId!.Value));

        if (!string.IsNullOrWhiteSpace(request.Batch))
            huQuery = huQuery.Where(h => h.Batch == request.Batch.Trim());

        var snapshot = await huQuery
            .GroupBy(h => new
            {
                LocationId = h.CurrentLocationId!.Value,
                h.ProductId,
                StorageRole = h.CurrentLocation!.StorageType != null ? h.CurrentLocation.StorageType.Role : StorageRole.Storage,
                CapacityStrategy = h.CurrentLocation!.StorageType != null ? h.CurrentLocation.StorageType.CapacityStrategy : StorageCapacityStrategy.DynamicStacking,
                StorageTypeName = h.CurrentLocation!.StorageType != null ? h.CurrentLocation.StorageType.Name : ""
            })
            .Select(g => new
            {
                g.Key.LocationId,
                g.Key.ProductId,
                g.Key.StorageRole,
                g.Key.CapacityStrategy,
                g.Key.StorageTypeName,
                ExpectedQty = g.Sum(x => x.CurrentQuantity)
            })
            .ToListAsync(ct);

        if (!snapshot.Any())
            return Results.BadRequest(new { Message = "Nenhum saldo encontrado no estoque para os filtros selecionados." });

        foreach (var item in snapshot)
        {
            bool isDynamic = item.StorageRole == StorageRole.Storage &&
                             (item.CapacityStrategy == StorageCapacityStrategy.DynamicStacking || item.StorageTypeName.Contains("Blocado", StringComparison.OrdinalIgnoreCase));

            var task = new CycleCountTask(
                plan.Id,
                item.LocationId,
                item.ProductId,
                item.ExpectedQty,
                isDynamic,
                request.AssignedUserId
            );

            _db.CycleCountTasks.Add(task);
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            plan.Id,
            PlanName = plan.Name,
            Status = plan.Status.ToString(),
            TasksGenerated = snapshot.Count,
            Message = $"Plano criado em Rascunho com {snapshot.Count} posições mapeadas."
        });
    }
}

public static class CreateCycleCountPlanEndpoints
{
    public static void MapCreateCycleCountPlanEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/plans", async (CreateCycleCountPlanCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}