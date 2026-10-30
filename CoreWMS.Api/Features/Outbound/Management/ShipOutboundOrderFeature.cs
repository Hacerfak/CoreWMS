using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record ShipOutboundOrderCommand(Guid OrderId) : IRequest<IResult>;

public class ShipOutboundOrderHandler : IRequestHandler<ShipOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public ShipOutboundOrderHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(ShipOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "O pedido já foi expedido anteriormente." });

        // Valida se o documento fiscal foi emitido e autorizado
        var authorizedDoc = await _db.CompanyFiscalDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.OutboundOrderId == order.Id && d.Status == FiscalDocumentStatus.Authorized, ct);

        if (authorizedDoc == null)
            return Results.BadRequest(new { Message = "Não é possível expedir o pedido sem uma NF-e autorizada pela SEFAZ." });

        // A) Consumo das HUs separadas
        var allocations = await _db.OutboundAllocations
            .Include(a => a.HandlingUnit)
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .ToListAsync(ct);

        var kardexMovements = new List<RecordKardexMovementItemDto>();

        foreach (var alloc in allocations)
        {
            var hu = alloc.HandlingUnit;
            hu.Consume(alloc.Quantity);

            // B) Atualiza saldo no InventoryBalance
            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == hu.ProductId && b.CustomerId == order.CustomerId, ct);

            if (balance != null)
            {
                balance.ShipAllocated(alloc.Quantity);
            }

            // Classificação direta: Fechada ou Fracionada
            var transType = alloc.IsFractional
                ? TransactionType.Outbound_Fractional
                : TransactionType.Outbound_Closed;

            // C) Prepara movimento desacoplado do Kardex
            kardexMovements.Add(new RecordKardexMovementItemDto(
                CustomerId: order.CustomerId,
                ProductId: hu.ProductId,
                HandlingUnitId: hu.Id,
                LocationId: order.DockLocationId,
                Type: transType,
                QuantityChange: -alloc.Quantity,
                BalanceAfter: hu.CurrentQuantity,
                SourceDocumentId: order.Id,
                SourceDocumentNumber: $"EXPEDIÇÃO NF-E {order.InvoiceNumber} (CHAVE: {order.OrderNumber?[..10]}...)",
                CompanyId: companyId
            ));
        }

        // D) Atualiza o status da Ordem para Expedido
        order.UpdateStatus(OutboundOrderStatus.Shipped);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao expedir o pedido." });
        }

        // DELEGAÇÃO VIA MEDIATR: Gravação em lote no Kardex após o commit no banco
        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        return Results.Ok(new
        {
            Message = $"Pedido #{order.OrderNumber} expedido com sucesso e estoque atualizado!",
            OrderStatus = order.Status.ToString()
        });
    }
}

public static class ShipOutboundOrderEndpoints
{
    public static void MapShipOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/{orderId:guid}/ship",
            async (Guid orderId, IMediator mediator) =>
                await mediator.Send(new ShipOutboundOrderCommand(orderId)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}