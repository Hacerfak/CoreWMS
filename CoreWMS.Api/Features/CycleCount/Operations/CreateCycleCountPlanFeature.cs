using CoreWMS.Api.Features.CycleCount.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record CreateCycleCountPlanCommand(string Name, Guid? CustomerId, Guid? ProductId, string? Batch, Guid? ZoneId, Guid? LocationId) : IRequest<IResult>;

public class CreateCycleCountPlanCommandValidator : AbstractValidator<CreateCycleCountPlanCommand>
{
    public CreateCycleCountPlanCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
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

        var plan = new CycleCountPlan(companyId, request.Name, request.CustomerId, request.ProductId, request.Batch, request.ZoneId, request.LocationId);
        _db.CycleCountPlans.Add(plan);

        var query = _db.HandlingUnits.AsNoTracking().Where(h => h.CompanyId == companyId && h.CurrentLocationId.HasValue);

        if (request.CustomerId.HasValue) query = query.Where(h => h.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) query = query.Where(h => h.ProductId == request.ProductId);
        if (!string.IsNullOrWhiteSpace(request.Batch)) query = query.Where(h => h.Batch == request.Batch);
        if (request.LocationId.HasValue) query = query.Where(h => h.CurrentLocationId == request.LocationId);
        if (request.ZoneId.HasValue)
            query = query.Where(h => h.CurrentLocation != null && h.CurrentLocation.ZoneId == request.ZoneId);

        var snapshot = await query
            .GroupBy(h => new { h.CurrentLocationId, h.ProductId })
            .Select(g => new { g.Key.CurrentLocationId, g.Key.ProductId, ExpectedQty = g.Count() })
            .ToListAsync(ct);

        if (!snapshot.Any()) return Results.BadRequest(new { Message = "Nenhum saldo encontrado para os filtros informados." });

        foreach (var item in snapshot)
        {
            var task = new CycleCountTask(plan.Id, item.CurrentLocationId!.Value, item.ProductId, item.ExpectedQty);
            _db.CycleCountTasks.Add(task);
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { plan.Id, TasksGenerated = snapshot.Count });
    }
}

public static class CreateCycleCountPlanEndpoints
{
    public static void MapCreateCycleCountPlanEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/plans", async (CreateCycleCountPlanCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}