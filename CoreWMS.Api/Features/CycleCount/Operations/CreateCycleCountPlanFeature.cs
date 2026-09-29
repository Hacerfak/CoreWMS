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
    Guid? CustomerId,
    Guid? ProductId,
    string? Batch,
    Guid? ZoneId,
    Guid? LocationId
) : IRequest<IResult>;

public class CreateCycleCountPlanCommandValidator : AbstractValidator<CreateCycleCountPlanCommand>
{
    public CreateCycleCountPlanCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Informe o nome do plano de inventário.").MaximumLength(150);
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
            request.CustomerId,
            request.ProductId,
            request.Batch?.Trim(),
            request.ZoneId,
            request.LocationId
        );

        _db.CycleCountPlans.Add(plan);

        // Snapshot de Saldos por Posição
        var huQuery = _db.HandlingUnits.AsNoTracking()
            .Include(h => h.CurrentLocation)
                .ThenInclude(l => l!.StorageType)
            .Where(h => h.CompanyId == companyId && h.CurrentLocationId.HasValue);

        if (request.CustomerId.HasValue) huQuery = huQuery.Where(h => h.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) huQuery = huQuery.Where(h => h.ProductId == request.ProductId);
        if (!string.IsNullOrWhiteSpace(request.Batch)) huQuery = huQuery.Where(h => h.Batch == request.Batch.Trim());
        if (request.LocationId.HasValue) huQuery = huQuery.Where(h => h.CurrentLocationId == request.LocationId);
        if (request.ZoneId.HasValue) huQuery = huQuery.Where(h => h.CurrentLocation != null && h.CurrentLocation.ZoneId == request.ZoneId);

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
            return Results.BadRequest(new { Message = "Nenhum saldo encontrado no estoque para os filtros informados." });

        foreach (var item in snapshot)
        {
            // Identifica se a armazenagem é Blocada/Dinâmica
            bool isDynamic = item.StorageRole == StorageRole.Storage &&
                             (item.CapacityStrategy == StorageCapacityStrategy.DynamicStacking || item.StorageTypeName.Contains("Blocado", StringComparison.OrdinalIgnoreCase));

            var task = new CycleCountTask(
                plan.Id,
                item.LocationId,
                item.ProductId,
                item.ExpectedQty,
                isDynamic
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
            Message = $"Plano criado em modo Rascunho com {snapshot.Count} posições mapeadas."
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