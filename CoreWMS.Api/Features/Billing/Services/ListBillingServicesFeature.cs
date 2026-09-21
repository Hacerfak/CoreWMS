using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Services;

public record ListBillingServicesQuery() : IRequest<IResult>;

public class ListBillingServicesHandler : IRequestHandler<ListBillingServicesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListBillingServicesHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListBillingServicesQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var services = await _db.BillingServices
            .AsNoTracking()
            .Where(s => s.CompanyId == companyId)
            .Select(s => new BillingServiceDto(s.Id, s.Name, s.Type.ToString(), s.SqlTemplate))
            .ToListAsync(ct);

        return Results.Ok(services);
    }
}

public static class ListBillingServicesEndpoints
{
    public static void MapListBillingServicesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/billing/services", async (IMediator mediator) => await mediator.Send(new ListBillingServicesQuery()))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}