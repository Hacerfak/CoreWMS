using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Identity.Constants;
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
    string? DestinationCity,
    string? DestinationState,
    string? DestinationZipCode,
    string? CarrierCnpjCpf,
    string? CarrierName,
    string? VehiclePlate,
    string? VehiclePlateState,
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

        // Se o utilizador informou um número de pedido, valida duplicidade
        if (!string.IsNullOrWhiteSpace(request.OrderNumber) &&
            await _db.OutboundOrders.AnyAsync(o => o.CompanyId == companyId && o.OrderNumber == request.OrderNumber.Trim(), ct))
        {
            return Results.BadRequest(new { Message = "Já existe um pedido de saída cadastrado com este número." });
        }

        // Se for retorno para o próprio depositante, preenche os dados do destinatário com os dados do depositante
        string? destCnpj = request.DestinationCnpjCpf;
        string? destName = request.DestinationName;
        string? destCity = request.DestinationCity;
        string? destState = request.DestinationState;
        string? destZip = request.DestinationZipCode;

        if (request.IsReturnToCustomer)
        {
            var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == request.CustomerId && c.CompanyId == companyId, ct);
            if (customer != null)
            {
                destCnpj = customer.Cnpj;
                destName = customer.CorporateName;
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
            destCity,
            destState,
            destZip,
            request.CarrierCnpjCpf,
            request.CarrierName,
            request.VehiclePlate,
            request.VehiclePlateState,
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