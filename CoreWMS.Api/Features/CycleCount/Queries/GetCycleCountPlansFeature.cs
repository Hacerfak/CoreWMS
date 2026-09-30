using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Queries;

public record CycleCountPlanSummaryDto(
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
    DateTime CreatedAt
);

public record GetCycleCountPlansQuery(Guid? CustomerId, string? Status) : IRequest<IResult>;

public class GetCycleCountPlansHandler : IRequestHandler<GetCycleCountPlansQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetCycleCountPlansHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetCycleCountPlansQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.CycleCountPlans.AsNoTracking()
            .Include(p => p.Tasks)
            .Where(p => p.CompanyId == companyId);

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(p => p.CustomerIds.Count == 0 || p.CustomerIds.Any(id => allowedCustomerIds.Contains(id)));
        }

        if (request.CustomerId.HasValue)
            query = query.Where(p => p.CustomerIds.Count == 0 || p.CustomerIds.Contains(request.CustomerId.Value));

        if (!string.IsNullOrWhiteSpace(request.Status) && Enum.TryParse<CycleCountPlanStatus>(request.Status, true, out var statusEnum))
            query = query.Where(p => p.Status == statusEnum);

        var rawPlans = await query
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync(ct);

        var allCustomerIds = rawPlans.SelectMany(p => p.CustomerIds).Distinct().ToList();
        var customerNames = await _db.Customers.AsNoTracking()
            .Where(c => allCustomerIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.CorporateName, ct);

        var result = rawPlans.Select(p =>
        {
            string customerNameDisplay = p.CustomerIds.Count switch
            {
                0 => "Todos os Depositantes",
                1 => customerNames.TryGetValue(p.CustomerIds[0], out var name) ? name : "Depositante Desconhecido",
                _ => string.Join(", ", p.CustomerIds.Select(id => customerNames.TryGetValue(id, out var n) ? n : "Outro"))
            };

            return new CycleCountPlanSummaryDto(
                p.Id,
                p.Name,
                p.Status.ToString(),
                p.BlockMovements,
                p.MaxRounds,
                p.EnableAdjustments,
                p.AssignedUserId,
                p.CustomerIds,
                customerNameDisplay,
                p.Tasks.Count(t => t.Status != CycleCountTaskStatus.Recounted),
                p.Tasks.Count(t => t.Status == CycleCountTaskStatus.Resolved),
                p.Tasks.Count(t => t.Status == CycleCountTaskStatus.CountedWithDivergence),
                p.CreatedAt
            );
        }).ToList();

        return Results.Ok(result);
    }
}

public static class GetCycleCountPlansEndpoints
{
    public static void MapGetCycleCountPlansEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/cycle-count/plans", async ([AsParameters] GetCycleCountPlansQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}