using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Tariffs;

public record ListCustomerTariffsQuery(Guid? CustomerId) : IRequest<IResult>;

public class ListCustomerTariffsHandler : IRequestHandler<ListCustomerTariffsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListCustomerTariffsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListCustomerTariffsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.CustomerTariffs
            .AsNoTracking()
            .Include(t => t.Customer)
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId);

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(t => allowedCustomerIds.Contains(t.CustomerId));
        }

        if (request.CustomerId.HasValue)
        {
            query = query.Where(t => t.CustomerId == request.CustomerId.Value);
        }

        var tariffs = await query
            .OrderBy(t => t.Customer.CorporateName)
            .ThenBy(t => t.BillingService.Name)
            .Select(t => new CustomerTariffDto(
                t.Id, t.CustomerId, t.Customer.CorporateName,
                t.BillingServiceId, t.BillingService.Name,
                t.UnitValue, t.ValidFrom, t.ValidTo))
            .ToListAsync(ct);

        return Results.Ok(tariffs);
    }
}

public static class ListCustomerTariffsEndpoints
{
    public static void MapListCustomerTariffsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/billing/tariffs", async ([AsParameters] ListCustomerTariffsQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.View);
    }
}