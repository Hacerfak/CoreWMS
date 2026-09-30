using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

public record CustomerSummaryDto(Guid Id, string CorporateName, string Cnpj);

public record GetCustomersSummaryQuery : IRequest<IResult>;

public class GetCustomersSummaryHandler : IRequestHandler<GetCustomersSummaryQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetCustomersSummaryHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetCustomersSummaryQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var q = _db.Customers.AsNoTracking().Where(c => c.CompanyId == companyId && c.IsActive);

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(c => allowedCustomerIds.Contains(c.Id));
        }

        var customers = await q
            .OrderBy(c => c.CorporateName)
            .Select(c => new CustomerSummaryDto(c.Id, c.CorporateName, c.Cnpj))
            .ToListAsync(ct);

        return Results.Ok(customers);
    }
}

public static class GetCustomersSummaryEndpoints
{
    public static void MapGetCustomersSummaryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/customers/summary", async (IMediator mediator) =>
            await mediator.Send(new GetCustomersSummaryQuery()))
           .WithTags("Customers")
           .RequireAuthorization()
           .RequirePermission(Permissions.Customers.View);
    }
}