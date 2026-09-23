using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Cycles;

public record ListBillingCyclesQuery(Guid? CustomerId) : IRequest<IResult>;

public class ListBillingCyclesHandler : IRequestHandler<ListBillingCyclesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListBillingCyclesHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListBillingCyclesQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.BillingCycles
            .AsNoTracking()
            .Include(c => c.Customer)
            .Include(c => c.Items)
            .Where(c => c.CompanyId == companyId);

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(c => allowedCustomerIds.Contains(c.CustomerId));
        }

        if (request.CustomerId.HasValue)
        {
            query = query.Where(c => c.CustomerId == request.CustomerId.Value);
        }

        var cycles = await query
            .OrderByDescending(c => c.StartDate)
            .Select(c => new BillingCycleDto(
                c.Id,
                c.ReferenceMonth,
                c.StartDate,
                c.EndDate,
                c.Status.ToString(),
                c.Items.Sum(i => i.ServiceTotal)
            ))
            .ToListAsync(ct);

        return Results.Ok(cycles);
    }
}

public static class ListBillingCyclesEndpoints
{
    public static void MapListBillingCyclesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/billing/cycles", async ([AsParameters] ListBillingCyclesQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.View);
    }
}