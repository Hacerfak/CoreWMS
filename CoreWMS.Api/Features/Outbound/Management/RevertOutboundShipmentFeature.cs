using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Operations;
using CoreWMS.Api.Features.Fiscal.Queries;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record RevertOutboundShipmentCommand(Guid OrderId) : IRequest<IResult>;

public class RevertOutboundShipmentCommandValidator : AbstractValidator<RevertOutboundShipmentCommand>
{
    public RevertOutboundShipmentCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("ID do pedido de saída obrigatório.");
    }
}

public class RevertOutboundShipmentHandler : IRequestHandler<RevertOutboundShipmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public RevertOutboundShipmentHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(RevertOutboundShipmentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Localiza a ordem de saída
        var order = await _db.OutboundOrders
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status != OutboundOrderStatus.Shipped)
        {
            return Results.BadRequest(new { Message = "Apenas pedidos com status 'Expedido' (Shipped) podem ter a expedição estornada." });
        }

        // 2. DELEGAÇÃO FISCAL: Verifica via módulo Fiscal se existe NF-e autorizada ativa
        var hasActiveNfe = await _mediator.Send(new HasActiveFiscalDocumentByOutboundOrderQuery(order.Id), ct);

        if (hasActiveNfe)
        {
            return Results.BadRequest(new
            {
                Message = "Não é possível estornar a expedição enquanto houver documento fiscal autorizado vinculado à ordem. Cancele a NF-e na SEFAZ primeiro."
            });
        }

        // 3. Localiza as alocações da ordem que foram consumidas na expedição
        var allocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .Select(a => new RevertOutboundShipmentItemDto(a.HandlingUnitId, a.Quantity))
            .ToListAsync(ct);

        if (!allocations.Any())
        {
            return Results.BadRequest(new { Message = "Nenhuma alocação confirmada encontrada para estorno neste pedido." });
        }

        // 4. DELEGAÇÃO AO INVENTORY: Restaura HUs, saldos (InventoryBalances) e lança no Kardex
        var inventoryResult = await _mediator.Send(new RevertOutboundInventoryShipmentCommand(
            order.Id,
            order.OrderNumber,
            order.CustomerId,
            order.DockLocationId,
            allocations
        ), ct);

        // 5. DELEGAÇÃO AO BILLING: Expurga itens de faturamento abertos e enfileira recálculo de diárias
        await _mediator.Send(new RollbackOutboundBillingCommand(
            order.Id,
            order.OrderNumber,
            order.CustomerId
        ), ct);

        // 6. Atualiza o status do pedido de volta para 'ReadyToShip'
        order.UpdateStatus(OutboundOrderStatus.ReadyToShip);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Expedição do Pedido #{order.OrderNumber} estornada com sucesso! O estoque físico das HUs e os saldos foram restaurados.",
            OrderStatus = order.Status.ToString()
        });
    }
}

public static class RevertOutboundShipmentEndpoints
{
    public static void MapRevertOutboundShipmentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/{orderId:guid}/revert-shipment",
            async (Guid orderId, IMediator mediator) =>
                await mediator.Send(new RevertOutboundShipmentCommand(orderId)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}