using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record RevertOutboundShipmentCommand(Guid OrderId) : IRequest<IResult>;

public class RevertOutboundShipmentHandler : IRequestHandler<RevertOutboundShipmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;
    private readonly BillingChannel? _billingChannel;

    public RevertOutboundShipmentHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        KardexChannel kardex,
        BillingChannel? billingChannel = null)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
        _billingChannel = billingChannel;
    }

    public async Task<IResult> Handle(RevertOutboundShipmentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Localiza o pedido com itens e doca
        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.DockLocation)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status != OutboundOrderStatus.Shipped)
        {
            return Results.BadRequest(new { Message = "Apenas pedidos com status 'Expedido' (Shipped) podem ter a expedição estornada." });
        }

        // 2. Trava de Segurança Fiscal: Não permite estornar se houver NF-e autorizada
        var hasActiveNfe = await _db.CompanyFiscalDocuments
            .AnyAsync(d => d.OutboundOrderId == order.Id
                        && (int)d.Type >= 1 && (int)d.Type <= 6
                        && d.Status == FiscalDocumentStatus.Authorized, ct);

        if (hasActiveNfe)
        {
            return Results.BadRequest(new
            {
                Message = "Não é possível estornar a expedição enquanto houver documento fiscal autorizado vinculado à ordem. Cancele a NF-e na SEFAZ primeiro."
            });
        }

        // 3. Localiza as alocações bipadas que foram consumidas na expedição
        var allocations = await _db.OutboundAllocations
            .Include(a => a.HandlingUnit)
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .ToListAsync(ct);

        if (!allocations.Any())
        {
            return Results.BadRequest(new { Message = "Nenhuma alocação confirmada encontrada para estorno neste pedido." });
        }

        var targetLocationId = order.DockLocationId;
        if (!targetLocationId.HasValue)
        {
            targetLocationId = await _db.Set<Location>()
                .Where(l => l.IsActive)
                .Select(l => (Guid?)l.Id)
                .FirstOrDefaultAsync(ct);
        }

        foreach (var alloc in allocations)
        {
            var hu = alloc.HandlingUnit;
            if (hu == null) continue;

            // A) Restaura saldo, endereço e status via método de domínio
            hu.RestoreConsumed(alloc.Quantity, targetLocationId);

            // B) Devolve o saldo ao estoque consolidado como Alocado via método de domínio
            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == hu.ProductId && b.CustomerId == order.CustomerId, ct);

            if (balance != null)
            {
                balance.RestoreShipped(alloc.Quantity);
            }

            // C) Lançamento de compensação no Kardex
            await _kardex.WriteAsync(new InventoryTransaction(
                companyId,
                order.CustomerId,
                hu.ProductId,
                hu.Id,
                targetLocationId ?? order.DockLocationId,
                TransactionType.Outbound_FullPallet,
                alloc.Quantity,
                hu.CurrentQuantity,
                order.Id,
                $"ESTORNO EXPEDIÇÃO - PEDIDO #{order.OrderNumber} (NF-E CANCELADA)"
            ), ct);
        }

        // 4. Retorna a ordem para 'ReadyToShip'
        order.UpdateStatus(OutboundOrderStatus.ReadyToShip);

        // 5. Exclusão dos itens operacionais de saída em ciclos abertos
        var billingItems = await _db.BillingItems
            .Where(b => (b.DocumentId == order.Id || b.Description.Contains(order.OrderNumber))
                     && _db.BillingCycles.Any(c => c.Id == b.BillingCycleId && c.Status == BillingStatus.Draft))
            .ToListAsync(ct);

        if (billingItems.Any())
        {
            _db.BillingItems.RemoveRange(billingItems);
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao estornar a expedição." });
        }

        // 6. Recálculo das diárias de armazenagem
        if (_billingChannel != null)
        {
            await _billingChannel.EnqueueRecalculationAsync(new BillingRecalculationTask(
                CompanyId: companyId,
                CustomerId: order.CustomerId,
                ReferenceDate: DateTime.UtcNow,
                TriggerOrderId: order.Id,
                TriggerType: "Outbound_Shipment_Revert"
            ), ct);
        }

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