using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Queries;

public record CycleCountTaskDetailDto(
    Guid Id,
    Guid LocationId,
    string LocationPath,
    Guid ProductId,
    string ProductSku,
    string ProductDescription,
    decimal ExpectedQuantity,
    decimal? CountedQuantity,
    decimal DivergenceQuantity,
    int CurrentRound,
    bool IsDynamicStorage,
    string Status,
    string AdjustmentType,
    string? FiscalDocumentNumber,
    string? FiscalNotes,
    decimal? CountRound1,
    string? UserRound1Name,
    decimal? CountRound2,
    string? UserRound2Name,
    decimal? CountRound3,
    string? UserRound3Name
);

public record CycleCountPlanDetailDto(
    Guid Id,
    string Name,
    string Status,
    bool BlockMovements,
    int MaxRounds,
    bool EnableAdjustments,
    Guid? AssignedUserId,
    List<Guid> CustomerIds,
    string CustomerName,
    int TotalTasks,
    int ResolvedTasks,
    int DivergentTasks,
    List<CycleCountTaskDetailDto> Tasks
);

public record GetCycleCountPlanByIdQuery(Guid Id) : IRequest<IResult>;

public class GetCycleCountPlanByIdHandler : IRequestHandler<GetCycleCountPlanByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetCycleCountPlanByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetCycleCountPlanByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var plan = await _db.CycleCountPlans.AsNoTracking()
            .Include(p => p.Tasks)
                .ThenInclude(t => t.Location)
            .Include(p => p.Tasks)
                .ThenInclude(t => t.Product)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);

        if (plan == null) return Results.NotFound(new { Message = "Plano não encontrado." });

        var userIds = plan.Tasks
            .SelectMany(t => new[] { t.UserRound1, t.UserRound2, t.UserRound3 })
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();

        var userNames = await _db.Users.AsNoTracking()
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Name, ct);

        var customerNames = await _db.Customers.AsNoTracking()
            .Where(c => plan.CustomerIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.CorporateName, ct);

        string customerNameDisplay = plan.CustomerIds.Count switch
        {
            0 => "Todos os Depositantes",
            1 => customerNames.TryGetValue(plan.CustomerIds[0], out var name) ? name : "Depositante Desconhecido",
            _ => string.Join(", ", plan.CustomerIds.Select(id => customerNames.TryGetValue(id, out var n) ? n : "Outro"))
        };

        var tasksDto = plan.Tasks.Select(t => new CycleCountTaskDetailDto(
            t.Id,
            t.LocationId,
            t.Location.FullPath,
            t.ProductId,
            t.Product.Sku,
            t.Product.Description,
            t.ExpectedQuantity,
            t.CountedQuantity,
            t.DivergenceQuantity,
            t.CurrentRound,
            t.IsDynamicStorage,
            t.Status.ToString(),
            t.AdjustmentType.ToString(),
            t.FiscalDocumentNumber,
            t.FiscalNotes,
            t.CountRound1,
            t.UserRound1.HasValue && userNames.TryGetValue(t.UserRound1.Value, out var u1) ? u1 : null,
            t.CountRound2,
            t.UserRound2.HasValue && userNames.TryGetValue(t.UserRound2.Value, out var u2) ? u2 : null,
            t.CountRound3,
            t.UserRound3.HasValue && userNames.TryGetValue(t.UserRound3.Value, out var u3) ? u3 : null
        )).ToList();

        var result = new CycleCountPlanDetailDto(
            plan.Id,
            plan.Name,
            plan.Status.ToString(),
            plan.BlockMovements,
            plan.MaxRounds,
            plan.EnableAdjustments,
            plan.AssignedUserId,
            plan.CustomerIds,
            customerNameDisplay,
            plan.Tasks.Count(t => t.Status != CycleCountTaskStatus.Recounted),
            plan.Tasks.Count(t => t.Status == CycleCountTaskStatus.Resolved),
            plan.Tasks.Count(t => t.Status == CycleCountTaskStatus.CountedWithDivergence),
            tasksDto
        );

        return Results.Ok(result);
    }
}

public static class GetCycleCountPlanByIdEndpoints
{
    public static void MapGetCycleCountPlanByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/cycle-count/plans/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetCycleCountPlanByIdQuery(id)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}