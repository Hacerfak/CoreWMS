using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

public record CustomerDetailDto(
    Guid Id,
    string Cnpj,
    string CorporateName,
    string? TradeName,
    string? StateRegistration,
    int IeIndicator,
    string? MunicipalRegistration,
    int Crt,
    string? Cnae,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    int CityCode,
    string? CityName,
    string State,
    string? ZipCode,
    string? Email,
    string? Phone,
    bool TracksBatch,
    bool StrictBatch,
    bool TracksManufacture,
    bool StrictManufacture,
    bool TracksExpiration,
    bool StrictExpiration,
    bool TracksSerial,
    bool StrictSerial,
    int DefaultPickingStrategy,
    int DefaultPickingBaseDate,
    int? MaxDailyInboundOrders,
    int? MaxDailyOutboundOrders,
    int? MinStockVolume,
    int? MaxStockVolume,
    bool RequiresBlindInbound,
    bool RequiresBlindOutbound,
    bool ReturnInvoicePerReferencedInvoice,
    bool IsActive
);

public record GetCustomerByIdQuery(Guid Id) : IRequest<IResult>;

public class GetCustomerByIdHandler : IRequestHandler<GetCustomerByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetCustomerByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetCustomerByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.Customers
            .AsNoTracking()
            .Where(c => c.Id == request.Id && c.CompanyId == companyId);

        // Trava Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(c => allowedCustomerIds.Contains(c.Id));
        }

        var customer = await query
            .Select(c => new CustomerDetailDto(
                c.Id,
                c.Cnpj,
                c.CorporateName,
                c.TradeName,
                c.StateRegistration,
                c.IeIndicator,
                c.MunicipalRegistration,
                c.Crt,
                c.Cnae,
                c.Street,
                c.Number,
                c.Complement,
                c.Neighborhood,
                c.CityCode,
                c.CityName,
                c.State,
                c.ZipCode,
                c.Email,
                c.Phone,
                c.TracksBatch,
                c.StrictBatch,
                c.TracksManufacture,
                c.StrictManufacture,
                c.TracksExpiration,
                c.StrictExpiration,
                c.TracksSerial,
                c.StrictSerial,
                (int)c.DefaultPickingStrategy,
                (int)c.DefaultPickingBaseDate,
                c.MaxDailyInboundOrders,
                c.MaxDailyOutboundOrders,
                c.MinStockVolume,
                c.MaxStockVolume,
                c.RequiresBlindInbound,
                c.RequiresBlindOutbound,
                c.ReturnInvoicePerReferencedInvoice,
                c.IsActive
            ))
            .FirstOrDefaultAsync(ct);

        if (customer == null)
            return Results.NotFound(new { Message = "Cliente depositante não encontrado." });

        return Results.Ok(customer);
    }
}

public static class GetCustomerByIdEndpoints
{
    public static void MapGetCustomerByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/customers/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetCustomerByIdQuery(id)))
           .WithTags("Customers")
           .RequireAuthorization()
           .RequirePermission(Permissions.Customers.View);
    }
}