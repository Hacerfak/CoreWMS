using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

// 1. Request
public record CreateCustomerCommand(
    string Cnpj, string CorporateName, string? TradeName, string? StateRegistration, int IeIndicator, string? MunicipalRegistration, int Crt, string? Cnae,
    string? Street, string? Number, string? Complement, string? Neighborhood, int CityCode, string? CityName, string State, string? ZipCode, string? Email, string? Phone,
    bool TracksBatch, bool StrictBatch, bool TracksManufacture, bool StrictManufacture, bool TracksExpiration, bool StrictExpiration, bool TracksSerial, bool StrictSerial,
    int DefaultPickingStrategy, int DefaultPickingBaseDate,
    int? MaxDailyInboundOrders, int? MaxDailyOutboundOrders, int? MinStockVolume, int? MaxStockVolume,
    bool RequiresBlindInbound, bool RequiresBlindOutbound, bool ReturnInvoicePerReferencedInvoice) : IRequest<IResult>;

// 2. Validator
public class CreateCustomerCommandValidator : AbstractValidator<CreateCustomerCommand>
{
    public CreateCustomerCommandValidator()
    {
        RuleFor(x => x.Cnpj).NotEmpty().Length(14).WithMessage("O CNPJ deve conter exatamente 14 caracteres numéricos.");
        RuleFor(x => x.CorporateName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.State).NotEmpty().MaximumLength(2);
        RuleFor(x => x.IeIndicator).InclusiveBetween(1, 9).WithMessage("Indicador de IE inválido.");
        RuleFor(x => x.DefaultPickingStrategy).Must(x => Enum.IsDefined(typeof(PickingStrategy), x)).WithMessage("Estratégia inválida.");
        RuleFor(x => x.DefaultPickingBaseDate).Must(x => Enum.IsDefined(typeof(PickingBaseDate), x)).WithMessage("Data Base inválida.");
    }
}

// 3. Handler
public class CreateCustomerHandler : IRequestHandler<CreateCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateCustomerHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CreateCustomerCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (await _db.Customers.AnyAsync(c => c.CompanyId == companyId && c.Cnpj == request.Cnpj, ct))
            return Results.BadRequest(new { Message = "Já existe um cliente com este CNPJ nesta empresa." });

        var customer = new Customer(
            companyId, request.Cnpj, request.CorporateName, request.TradeName,
            request.StateRegistration, request.IeIndicator, request.MunicipalRegistration, request.Crt, request.Cnae,
            request.Street, request.Number, request.Complement, request.Neighborhood, request.CityCode, request.CityName, request.State, request.ZipCode, request.Email, request.Phone,
            request.TracksBatch, request.StrictBatch, request.TracksManufacture, request.StrictManufacture, request.TracksExpiration, request.StrictExpiration, request.TracksSerial, request.StrictSerial,
            (PickingStrategy)request.DefaultPickingStrategy, (PickingBaseDate)request.DefaultPickingBaseDate,
            request.MaxDailyInboundOrders, request.MaxDailyOutboundOrders, request.MinStockVolume, request.MaxStockVolume,
            request.RequiresBlindInbound, request.RequiresBlindOutbound, request.ReturnInvoicePerReferencedInvoice);

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/customers/{customer.Id}", customer.Adapt<CustomerDto>());
    }
}

// 4. Endpoint
public static class CreateCustomerEndpoints
{
    public static void MapCreateCustomerEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/customers", async (CreateCustomerCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Customers")
           .RequireAuthorization()
           .RequirePermission(Permissions.Customers.Create);
    }
}