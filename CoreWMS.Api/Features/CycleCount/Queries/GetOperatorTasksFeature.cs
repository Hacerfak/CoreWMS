using System.Security.Claims;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Queries;

// DTO 100% CEGO: Expõe apenas o Endereço, Plano, Rodada e Tipo de Armazenagem (Zero informação de SKU/Produto)
public record BlindOperatorLocationDto(
    Guid PlanId,
    string PlanName,
    Guid LocationId,
    string LocationPath,
    int CurrentRound,
    bool IsDynamicStorage,
    string Status,
    int PendingTasksCount
);

public record GetOperatorTasksQuery : IRequest<IResult>;

public class GetOperatorTasksHandler : IRequestHandler<GetOperatorTasksQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public GetOperatorTasksHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(GetOperatorTasksQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var userIdClaim = _http.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid.TryParse(userIdClaim, out var currentUserId);

        var query = _db.CycleCountTasks.AsNoTracking()
            .Include(t => t.CycleCountPlan)
            .Include(t => t.Location)
            .Where(t => t.CycleCountPlan.CompanyId == companyId &&
                        (t.CycleCountPlan.Status == CycleCountPlanStatus.ApprovedForCounting || t.CycleCountPlan.Status == CycleCountPlanStatus.InCounting) &&
                        (t.Status == CycleCountTaskStatus.Pending || t.Status == CycleCountTaskStatus.InCounting));

        query = query.Where(t => !t.AssignedUserId.HasValue || t.AssignedUserId == currentUserId || t.CycleCountPlan.AssignedUserId == currentUserId);

        var rawTasks = await query
            .OrderBy(t => t.Location.FullPath)
            .Select(t => new
            {
                t.Id,
                t.CycleCountPlanId,
                PlanName = t.CycleCountPlan.Name,
                t.LocationId,
                LocationPath = t.Location.FullPath,
                t.CurrentRound,
                t.IsDynamicStorage,
                Status = t.Status.ToString()
            })
            .ToListAsync(ct);

        var groupedLocations = rawTasks
            .GroupBy(t => new { t.CycleCountPlanId, t.PlanName, t.LocationId, t.LocationPath, t.IsDynamicStorage })
            .Select(g => new BlindOperatorLocationDto(
                g.Key.CycleCountPlanId,
                g.Key.PlanName,
                g.Key.LocationId,
                g.Key.LocationPath,
                g.Min(x => x.CurrentRound),
                g.Key.IsDynamicStorage,
                g.Any(x => x.Status == "InCounting") ? "InCounting" : "Pending",
                g.Count()
            ))
            .OrderBy(x => x.LocationPath)
            .ToList();

        return Results.Ok(groupedLocations);
    }
}

public static class GetOperatorTasksEndpoints
{
    public static void MapGetOperatorTasksEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/cycle-count/tasks/operator", async (IMediator mediator) =>
            await mediator.Send(new GetOperatorTasksQuery()))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}