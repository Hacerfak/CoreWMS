using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Tariffs;

public record DeleteCustomerTariffCommand(Guid Id) : IRequest<IResult>;

public class DeleteCustomerTariffHandler : IRequestHandler<DeleteCustomerTariffCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteCustomerTariffHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteCustomerTariffCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var tariff = await _db.CustomerTariffs
            .FirstOrDefaultAsync(t => t.Id == request.Id && t.CompanyId == companyId, ct);

        if (tariff == null) return Results.NotFound();

        _db.CustomerTariffs.Remove(tariff);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public static class DeleteCustomerTariffEndpoints
{
    public static void MapDeleteCustomerTariffEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/billing/tariffs/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteCustomerTariffCommand(id)))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}