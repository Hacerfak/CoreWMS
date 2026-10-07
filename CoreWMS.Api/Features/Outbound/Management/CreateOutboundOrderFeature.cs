using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record CreateOutboundOrderCommand(
    Guid CustomerId,
    DateTime ExpectedShipDate,
    string? OrderNumber,
    string? InvoiceNumber,
    string? InvoiceSerie,
    string? AccessKey,
    bool IsReturnToCustomer,
    string? DestinationCnpjCpf,
    string? DestinationName,
    string? DestinationStateRegistration,
    int DestinationIeIndicator,
    string? DestinationStreet,
    string? DestinationNumber,
    string? DestinationComplement,
    string? DestinationNeighborhood,
    int DestinationCityCode,
    string? DestinationCity,
    string? DestinationState,
    string? DestinationZipCode,
    string? CarrierCnpjCpf,
    string? CarrierName,
    string? CarrierStateRegistration,
    string? VehiclePlate,
    string? VehiclePlateState,
    int FreightModality,
    string? AdditionalNotes
) : IRequest<IResult>;

public class CreateOutboundOrderCommandValidator : AbstractValidator<CreateOutboundOrderCommand>
{
    public CreateOutboundOrderCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithMessage("O depositante é obrigatório.");
        RuleFor(x => x.ExpectedShipDate).NotEmpty().WithMessage("A data prevista de envio é obrigatória.");
    }
}

public class CreateOutboundOrderHandler : IRequestHandler<CreateOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CreateOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(request.CustomerId))
            return Results.Forbid();

        if (!string.IsNullOrWhiteSpace(request.OrderNumber) &&
            await _db.OutboundOrders.AnyAsync(o => o.CompanyId == companyId && o.OrderNumber == request.OrderNumber.Trim(), ct))
        {
            return Results.BadRequest(new { Message = "Já existe um pedido de saída cadastrado com este número." });
        }

        string? destCnpj = request.DestinationCnpjCpf;
        string? destName = request.DestinationName;
        string? destIe = request.DestinationStateRegistration;
        int destIeIndicator = request.DestinationIeIndicator;
        string? destStreet = request.DestinationStreet;
        string? destNumber = request.DestinationNumber;
        string? destComplement = request.DestinationComplement;
        string? destNeighborhood = request.DestinationNeighborhood;
        int destCityCode = request.DestinationCityCode;
        string? destCity = request.DestinationCity;
        string? destState = request.DestinationState;
        string? destZip = request.DestinationZipCode;

        // Retorno Simbólico / Devolução para o Próprio Depositante
        if (request.IsReturnToCustomer)
        {
            var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == request.CustomerId && c.CompanyId == companyId, ct);
            if (customer != null)
            {
                destCnpj = customer.Cnpj;
                destName = customer.CorporateName;
                destIe = customer.StateRegistration;
                destIeIndicator = customer.IeIndicator;
                destStreet = customer.Street;
                destNumber = customer.Number;
                destComplement = customer.Complement;
                destNeighborhood = customer.Neighborhood;
                destCityCode = customer.CityCode;
                destCity = customer.CityName;
                destState = customer.State;
                destZip = customer.ZipCode;
            }
        }

        var order = new OutboundOrder(
            companyId,
            request.CustomerId,
            request.OrderNumber,
            request.InvoiceNumber,
            request.InvoiceSerie,
            request.AccessKey,
            rawXml: null,
            request.IsReturnToCustomer,
            destCnpj,
            destName,
            destIe,
            destIeIndicator,
            destStreet,
            destNumber,
            destComplement,
            destNeighborhood,
            destCityCode,
            destCity,
            destState,
            destZip,
            request.CarrierCnpjCpf,
            request.CarrierName,
            request.CarrierStateRegistration,
            request.VehiclePlate,
            request.VehiclePlateState,
            request.FreightModality,
            request.AdditionalNotes,
            issueDate: DateTime.UtcNow,
            request.ExpectedShipDate
        );

        _db.OutboundOrders.Add(order);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/outbound/orders/{order.Id}", new { order.Id, order.OrderNumber });
    }
}

public static class CreateOutboundOrderEndpoints
{
    public static void MapCreateOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders", async (CreateOutboundOrderCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}