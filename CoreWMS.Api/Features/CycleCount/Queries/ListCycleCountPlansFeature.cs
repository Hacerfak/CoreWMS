using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Queries;

public record TaskSummaryDto(
    Guid Id, Guid LocationId, string LocationPath, Guid ProductId, string ProductSku,
    int ExpectedQuantity, int CurrentRound, bool IsStrictLpnMode, string Status);

public record CycleCountPlanDto(
    Guid Id, string Name, string Status, Guid? CustomerId, string? CustomerName,
    Guid? ProductId, string? ProductSku, string? Batch, int TotalTasks, int ResolvedTasks,
    List<TaskSummaryDto> Tasks);

public record ListCycleCountPlansQuery(Guid? CustomerId) : IRequest<IResult>;

public class ListCycleCountPlansHandler : IRequestHandler<ListCycleCountPlansQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListCycleCountPlansHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListCycleCountPlansQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.CycleCountPlans.AsNoTracking()
            .Include(p => p.Customer)
            .Include(p => p.Product)
            .Include(p => p.Tasks)
                .ThenInclude(t => t.Location)
            .Include(p => p.Tasks)
                .ThenInclude(t => t.Product)
            .Where(p => p.CompanyId == companyId);

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(p => !p.CustomerId.HasValue || allowedCustomerIds.Contains(p.CustomerId.Value));
        }

        if (request.CustomerId.HasValue)
        {
            query = query.Where(p => p.CustomerId == request.CustomerId.Value);
        }

        var plans = await query
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new CycleCountPlanDto(
                p.Id, p.Name, p.Status.ToString(), p.CustomerId,
                p.Customer != null ? p.Customer.CorporateName : null,
                p.ProductId, p.Product != null ? p.Product.Sku : null,
                p.Batch, p.Tasks.Count,
                p.Tasks.Count(t => t.Status == CycleCountTaskStatus.Resolved),
                p.Tasks.Select(t => new TaskSummaryDto(
                    t.Id, t.LocationId, t.Location.FullPath, t.ProductId, t.Product.Sku,
                    t.ExpectedQuantity, t.CurrentRound, t.IsStrictLpnMode, t.Status.ToString()
                )).ToList()
            ))
            .ToListAsync(ct);

        return Results.Ok(plans);
    }
}

public static class ListCycleCountPlansEndpoints
{
    public static void MapListCycleCountPlansEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/cycle-count/plans", async ([AsParameters] ListCycleCountPlansQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}