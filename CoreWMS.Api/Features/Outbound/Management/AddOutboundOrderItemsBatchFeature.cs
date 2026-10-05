using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record OutboundOrderItemBatchDto(
    Guid ProductId,
    int LineNumber,
    decimal Quantity,
    decimal UnitValue
);

public record AddOutboundOrderItemsBatchCommand(
    Guid OrderId,
    List<OutboundOrderItemBatchDto> Items
) : IRequest<IResult>;

public class AddOutboundOrderItemsBatchCommandValidator : AbstractValidator<AddOutboundOrderItemsBatchCommand>
{
    public AddOutboundOrderItemsBatchCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty().WithMessage("O pedido deve conter pelo menos um item.");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.ProductId).NotEmpty().WithMessage("O produto é obrigatório.");
            item.RuleFor(i => i.Quantity).GreaterThan(0).WithMessage("A quantidade deve ser maior que zero.");
        });
    }
}

public class AddOutboundOrderItemsBatchHandler : IRequestHandler<AddOutboundOrderItemsBatchCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public AddOutboundOrderItemsBatchHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(AddOutboundOrderItemsBatchCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Busca a ordem sem carregar o grafo de itens para não poluir o Change Tracker
        var order = await _db.OutboundOrders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Ordem de saída não encontrada." });

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(order.CustomerId))
            return Results.Forbid();

        if (order.Status != OutboundOrderStatus.Pending)
            return Results.BadRequest(new { Message = "Apenas pedidos em status Pendente podem ter seus itens alterados." });

        var productIds = request.Items.Select(i => i.ProductId).Distinct().ToList();
        var validProducts = await _db.Products
            .AsNoTracking()
            .Where(p => p.CompanyId == companyId && p.CustomerId == order.CustomerId && productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Sku, ct);

        if (validProducts.Count != productIds.Count)
            return Results.BadRequest(new { Message = "Um ou mais produtos selecionados são inválidos ou não pertencem a este depositante." });

        // 2. Remove fisicamente no banco qualquer item antigo da ordem (sem causar conflitos no EF Change Tracker)
        await _db.OutboundOrderItems
            .Where(i => i.OutboundOrderId == order.Id)
            .ExecuteDeleteAsync(ct);

        order.ClearItems();

        // 3. Consolida itens que pertencem ao mesmo produto (ex: Vol. Fechados + Fracionados)
        var groupedItems = request.Items
            .GroupBy(i => i.ProductId)
            .Select((g, index) => new
            {
                ProductId = g.Key,
                LineNumber = index + 1,
                Quantity = g.Sum(x => x.Quantity),
                UnitValue = g.FirstOrDefault()?.UnitValue ?? 0m
            }).ToList();

        // 4. Adiciona os novos itens consolidados à ordem
        foreach (var itemCmd in groupedItems)
        {
            var sku = validProducts[itemCmd.ProductId];
            var orderItem = new OutboundOrderItem(
                order.Id,
                itemCmd.ProductId,
                itemCmd.LineNumber,
                sku,
                itemCmd.Quantity,
                itemCmd.UnitValue
            );

            order.AddItem(orderItem);
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Sucesso! {groupedItems.Count} item(ns) gravado(s) na ordem de saída #{order.OrderNumber}.",
            OrderId = order.Id,
            ItemsCount = groupedItems.Count
        });
    }
}

public static class AddOutboundOrderItemsBatchEndpoints
{
    public static void MapAddOutboundOrderItemsBatchEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/{orderId:guid}/items/batch",
            async (Guid orderId, AddOutboundOrderItemsBatchCommand cmd, IMediator mediator) =>
            {
                var command = cmd with { OrderId = orderId };
                return await mediator.Send(command);
            })
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}