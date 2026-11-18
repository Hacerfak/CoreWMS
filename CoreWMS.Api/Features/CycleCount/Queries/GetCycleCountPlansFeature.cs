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
        var isPartner = _tenant.IsPartnerUser();
        var allowedCustomerIds = isPartner ? _tenant.GetAllowedCustomerIds() : new List<Guid>();

        var query = _db.CycleCountPlans.AsNoTracking()
            .Include(p => p.Tasks)
                .ThenInclude(t => t.Product)
            .Where(p => p.CompanyId == companyId);

        if (isPartner)
        {
            query = query.Where(p =>
                p.CustomerIds.Any(id => allowedCustomerIds.Contains(id)) ||
                (p.CustomerIds.Count == 0 && p.Tasks.Any(t => allowedCustomerIds.Contains(t.Product.CustomerId))));
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
            var visibleCustomerIds = isPartner
                ? p.CustomerIds.Where(id => allowedCustomerIds.Contains(id)).ToList()
                : p.CustomerIds;

            var visibleTasks = isPartner
                ? p.Tasks.Where(t => allowedCustomerIds.Contains(t.Product.CustomerId)).ToList()
                : p.Tasks.ToList();

            string customerNameDisplay = visibleCustomerIds.Count switch
            {
                0 => isPartner ? "Meus Depositantes" : "Todos os Depositantes",
                1 => customerNames.TryGetValue(visibleCustomerIds[0], out var name) ? name : "Depositante",
                _ => string.Join(", ", visibleCustomerIds.Select(id => customerNames.TryGetValue(id, out var n) ? n : "Outro"))
            };

            return new CycleCountPlanSummaryDto(
                p.Id,
                p.Name,
                p.Status.ToString(),
                p.BlockMovements,
                p.MaxRounds,
                p.EnableAdjustments,
                p.AssignedUserId,
                visibleCustomerIds,
                customerNameDisplay,
                visibleTasks.Count(t => t.Status != CycleCountTaskStatus.Recounted),
                visibleTasks.Count(t => t.Status == CycleCountTaskStatus.Resolved),
                visibleTasks.Count(t => t.Status == CycleCountTaskStatus.CountedWithDivergence),
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
           .RequirePermission(Permissions.CycleCount.View);
    }
}