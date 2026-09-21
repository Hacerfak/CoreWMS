using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Tariffs;

public record ListCustomerTariffsQuery(Guid CustomerId) : IRequest<IResult>;

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

        var tariffs = await _db.CustomerTariffs
            .AsNoTracking()
            .Include(t => t.Customer)
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId && t.CustomerId == request.CustomerId)
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
        app.MapGet("/api/billing/tariffs/{customerId:guid}", async (Guid customerId, IMediator mediator) => await mediator.Send(new ListCustomerTariffsQuery(customerId)))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}