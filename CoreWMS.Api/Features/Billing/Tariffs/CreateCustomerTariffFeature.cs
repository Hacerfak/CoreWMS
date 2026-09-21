using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Billing.Tariffs;

public record CreateCustomerTariffCommand(Guid CustomerId, Guid BillingServiceId, decimal UnitValue, DateTime ValidFrom, DateTime? ValidTo) : IRequest<IResult>;

public class CreateCustomerTariffCommandValidator : AbstractValidator<CreateCustomerTariffCommand>
{
    public CreateCustomerTariffCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.BillingServiceId).NotEmpty();
        RuleFor(x => x.UnitValue).GreaterThanOrEqualTo(0);
        RuleFor(x => x.ValidFrom).NotEmpty();
    }
}

public class CreateCustomerTariffHandler : IRequestHandler<CreateCustomerTariffCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateCustomerTariffHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CreateCustomerTariffCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var tariff = new CustomerTariff(companyId, request.CustomerId, request.BillingServiceId, request.UnitValue, request.ValidFrom, request.ValidTo);

        _db.CustomerTariffs.Add(tariff);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { tariff.Id });
    }
}

public static class CreateCustomerTariffEndpoints
{
    public static void MapCreateCustomerTariffEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/tariffs", async (CreateCustomerTariffCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}