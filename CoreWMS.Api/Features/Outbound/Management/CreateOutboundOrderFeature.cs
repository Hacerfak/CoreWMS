using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record CreateOutboundOrderCommand(
    Guid CustomerId, string OrderNumber, string DestinationCnpjCpf, string DestinationName,
    string DestinationCity, string DestinationState, string? DestinationZipCode,
    DateTime? ExpectedShipDate, List<CreateOutboundOrderItemCommand> Items) : IRequest<IResult>;

public class CreateOutboundOrderCommandValidator : AbstractValidator<CreateOutboundOrderCommand>
{
    public CreateOutboundOrderCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.OrderNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.DestinationCnpjCpf).NotEmpty().MaximumLength(14);
        RuleFor(x => x.DestinationName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.DestinationCity).NotEmpty();
        RuleFor(x => x.DestinationState).NotEmpty().MaximumLength(2);
        RuleFor(x => x.Items).NotEmpty().WithMessage("O pedido deve conter pelo menos um item.");
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

        if (await _db.OutboundOrders.AnyAsync(o => o.CompanyId == companyId && o.OrderNumber == request.OrderNumber, ct))
            return Results.BadRequest(new { Message = "Já existe um pedido de saída com este número." });

        var order = new OutboundOrder(
            companyId, request.CustomerId, request.OrderNumber, null, null,
            request.DestinationCnpjCpf, request.DestinationName, request.DestinationCity, request.DestinationState, request.DestinationZipCode,
            DateTime.UtcNow, request.ExpectedShipDate
        );

        var productIds = request.Items.Select(i => i.ProductId).ToList();
        var validProducts = await _db.Products
            .AsNoTracking()
            .Where(p => p.CompanyId == companyId && p.CustomerId == request.CustomerId && productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Sku, ct);

        foreach (var itemCmd in request.Items)
        {
            if (!validProducts.TryGetValue(itemCmd.ProductId, out var sku))
                return Results.BadRequest(new { Message = $"Produto com ID {itemCmd.ProductId} é inválido ou não pertence a este depositante." });

            var item = new OutboundOrderItem(order.Id, itemCmd.ProductId, itemCmd.LineNumber, sku, itemCmd.Quantity, itemCmd.UnitValue);
            order.AddItem(item);
        }

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