using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record UpdateOutboundOrderCommand(
    Guid Id,
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

public class UpdateOutboundOrderCommandValidator : AbstractValidator<UpdateOutboundOrderCommand>
{
    public UpdateOutboundOrderCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ExpectedShipDate).NotEmpty().WithMessage("A data prevista de envio é obrigatória.");
    }
}

public class UpdateOutboundOrderHandler : IRequestHandler<UpdateOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdateOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdateOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .FirstOrDefaultAsync(o => o.Id == request.Id && o.CompanyId == companyId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Ordem de saída não encontrada." });

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(order.CustomerId))
            return Results.Forbid();

        // Validação de regra de negócio: alterações só até o status Allocated (<= 3)
        if ((int)order.Status > (int)OutboundOrderStatus.Allocated)
        {
            return Results.BadRequest(new
            {
                Message = $"Não é possível alterar o pedido no status '{order.Status}'. Alterações do cabeçalho são permitidas apenas antes do início do picking."
            });
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

        if (request.IsReturnToCustomer)
        {
            var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == order.CustomerId && c.CompanyId == companyId, ct);
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

        // Executa mutação protegida usando o método de domínio
        order.UpdateHeaderDetails(
            request.ExpectedShipDate,
            request.OrderNumber,
            request.InvoiceNumber,
            request.InvoiceSerie,
            request.AccessKey,
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
            request.AdditionalNotes
        );

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Cabeçalho da ordem de saída atualizado com sucesso.", OrderId = order.Id });
    }
}

public static class UpdateOutboundOrderEndpoints
{
    public static void MapUpdateOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/outbound/orders/{id:guid}", async (Guid id, UpdateOutboundOrderCommand cmd, IMediator mediator) =>
        {
            var command = cmd with { Id = id };
            return await mediator.Send(command);
        })
        .WithTags("Outbound")
        .RequireAuthorization()
        .RequirePermission(Permissions.Outbound.Manage);
    }
}