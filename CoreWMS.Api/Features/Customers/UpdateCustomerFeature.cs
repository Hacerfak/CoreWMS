using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

// 1. Request
public record UpdateCustomerCommand(
    Guid Id, string CorporateName, string? TradeName, string? StateRegistration, int IeIndicator, string? MunicipalRegistration, int Crt, string? Cnae,
    string? Street, string? Number, string? Complement, string? Neighborhood, int CityCode, string? CityName, string State, string? ZipCode, string? Email, string? Phone,
    bool TracksBatch, bool StrictBatch, bool TracksManufacture, bool StrictManufacture, bool TracksExpiration, bool StrictExpiration, bool TracksSerial, bool StrictSerial,
    int DefaultPickingStrategy, int DefaultPickingBaseDate,
    int? MaxDailyInboundOrders, int? MaxDailyOutboundOrders, int? MinStockVolume, int? MaxStockVolume,
    bool RequiresBlindInbound, bool RequiresBlindOutbound, bool ReturnInvoicePerReferencedInvoice) : IRequest<IResult>;

// 2. Validator
public class UpdateCustomerCommandValidator : AbstractValidator<UpdateCustomerCommand>
{
    public UpdateCustomerCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CorporateName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.State).NotEmpty().MaximumLength(2);
        RuleFor(x => x.IeIndicator).InclusiveBetween(1, 9).WithMessage("Indicador de IE inválido.");
        RuleFor(x => x.DefaultPickingStrategy).Must(x => Enum.IsDefined(typeof(PickingStrategy), x)).WithMessage("Estratégia inválida.");
        RuleFor(x => x.DefaultPickingBaseDate).Must(x => Enum.IsDefined(typeof(PickingBaseDate), x)).WithMessage("Data Base inválida.");
    }
}

// 3. Handler
public class UpdateCustomerHandler : IRequestHandler<UpdateCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdateCustomerHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdateCustomerCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct);
        if (customer == null) return Results.NotFound(new { Message = "Cliente não encontrado." });

        customer.Update(request.CorporateName, request.TradeName, request.StateRegistration, request.IeIndicator, request.MunicipalRegistration, request.Crt, request.Cnae,
            request.Street, request.Number, request.Complement, request.Neighborhood, request.CityCode, request.CityName, request.State, request.ZipCode, request.Email, request.Phone,
            request.TracksBatch, request.StrictBatch, request.TracksManufacture, request.StrictManufacture, request.TracksExpiration, request.StrictExpiration, request.TracksSerial, request.StrictSerial,
            (PickingStrategy)request.DefaultPickingStrategy, (PickingBaseDate)request.DefaultPickingBaseDate,
            request.MaxDailyInboundOrders, request.MaxDailyOutboundOrders, request.MinStockVolume, request.MaxStockVolume,
            request.RequiresBlindInbound, request.RequiresBlindOutbound, request.ReturnInvoicePerReferencedInvoice);

        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

// 4. Endpoint
public static class UpdateCustomerEndpoints
{
    public static void MapUpdateCustomerEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/customers/{id:guid}", async (Guid id, UpdateCustomerCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Customers")
           .RequireAuthorization()
           .RequirePermission(Permissions.Customers.Edit);
    }
}