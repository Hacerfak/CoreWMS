using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Tariffs;

public record CreateCustomerTariffCommand(
    Guid CustomerId,
    Guid BillingServiceId,
    decimal UnitValue,
    DateTime ValidFrom,
    DateTime? ValidTo
) : IRequest<IResult>;

public class CreateCustomerTariffCommandValidator : AbstractValidator<CreateCustomerTariffCommand>
{
    public CreateCustomerTariffCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithMessage("O depositante é obrigatório.");
        RuleFor(x => x.BillingServiceId).NotEmpty().WithMessage("O serviço de faturamento é obrigatório.");
        RuleFor(x => x.UnitValue).GreaterThanOrEqualTo(0).WithMessage("O valor unitário não pode ser negativo.");
        RuleFor(x => x.ValidFrom).NotEmpty().WithMessage("A data inicial de vigência é obrigatória.");
        RuleFor(x => x.ValidTo)
            .GreaterThanOrEqualTo(x => x.ValidFrom)
            .When(x => x.ValidTo.HasValue)
            .WithMessage("A data final de vigência deve ser maior ou igual à data inicial.");
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
        if (_tenant.IsPartnerUser()) return Results.Forbid();

        var customerExists = await _db.Customers
            .AsNoTracking()
            .AnyAsync(c => c.Id == request.CustomerId && c.CompanyId == companyId, ct);

        if (!customerExists)
            return Results.BadRequest(new { Message = "Depositante não encontrado nesta empresa." });

        var serviceExists = await _db.BillingServices
            .AsNoTracking()
            .AnyAsync(s => s.Id == request.BillingServiceId && s.CompanyId == companyId, ct);

        if (!serviceExists)
            return Results.BadRequest(new { Message = "Serviço de faturamento não encontrado nesta empresa." });

        var tariff = new CustomerTariff(
            companyId,
            request.CustomerId,
            request.BillingServiceId,
            request.UnitValue,
            request.ValidFrom,
            request.ValidTo
        );

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