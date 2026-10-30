using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Management;

public record RollbackInboundOrderCommand(Guid OrderId) : IRequest<IResult>;

public class RollbackInboundOrderCommandValidator : AbstractValidator<RollbackInboundOrderCommand>
{
    public RollbackInboundOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
    }
}

public class RollbackInboundOrderHandler : IRequestHandler<RollbackInboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;
    private readonly BillingChannel? _billingChannel;

    public RollbackInboundOrderHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IMediator mediator,
        BillingChannel? billingChannel = null)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
        _billingChannel = billingChannel;
    }

    public async Task<IResult> Handle(RollbackInboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.InboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound();

        var generatedHus = await _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && h.ReceiptDocumentId == order.Id)
            .ToListAsync(ct);

        if (generatedHus.Any(h => h.Status == HuStatus.Shipped))
            return Results.BadRequest(new { Message = "Estorno bloqueado. Uma ou mais HUs desta ordem já foram expedidas." });

        var kardexMovements = new List<RecordKardexMovementItemDto>();

        // 1. Estorno de saldo
        foreach (var hu in generatedHus)
        {
            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId, ct);

            if (balance != null)
            {
                balance.RollbackReceipt(hu.CurrentQuantity, hu.Status, hu.QualityStatus);
            }

            // Prepara estorno contábil no Kardex
            kardexMovements.Add(new RecordKardexMovementItemDto(
                CustomerId: hu.CustomerId,
                ProductId: hu.ProductId,
                HandlingUnitId: hu.Id,
                LocationId: hu.CurrentLocationId,
                Type: TransactionType.Inbound_Receipt_Rollback,
                QuantityChange: -hu.CurrentQuantity,
                BalanceAfter: 0m,
                SourceDocumentId: order.Id,
                SourceDocumentNumber: $"NF #{order.InvoiceNumber}",
                CompanyId: companyId
            ));
        }

        // 2. Remove as HUs físicas geradas
        _db.HandlingUnits.RemoveRange(generatedHus);

        foreach (var item in order.Items)
        {
            item.ResetForRollback();
            item.Unlock();
        }

        order.UpdateStatus(InboundOrderStatus.Pending);

        // 3. EXCLUSÃO DOS ITENS DE COBRANÇA DA ORDEM (Apenas em ciclos abertos)
        var billingItems = await _db.BillingItems
            .Where(b => (b.DocumentId == order.Id ||
                         b.Description.Contains(order.AccessKey) ||
                         (!string.IsNullOrWhiteSpace(order.InvoiceNumber) && b.DocumentNumber == order.InvoiceNumber))
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
            return Results.Conflict(new { Message = "Conflito ao processar o estorno. Tente novamente." });
        }

        // DELEGAÇÃO VIA MEDIATR: Gravação segura em lote no Kardex
        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        // 4. RECÁLCULO EM SEGUNDO PLANO DAS DIÁRIAS (Sem as HUs que acabaram de ser excluídas)
        if (_billingChannel != null && order.CustomerId.HasValue)
        {
            await _billingChannel.EnqueueRecalculationAsync(new BillingRecalculationTask(
                CompanyId: companyId,
                CustomerId: order.CustomerId.Value,
                ReferenceDate: DateTime.UtcNow,
                TriggerOrderId: order.Id,
                TriggerType: "Inbound_Rollback"
            ), ct);
        }

        return Results.Ok(new { Message = "Estorno realizado com sucesso. A ordem retornou para pendente e o faturamento foi atualizado." });
    }
}

public static class RollbackInboundOrderEndpoints
{
    public static void MapRollbackInboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/{orderId:guid}/rollback", async (Guid orderId, IMediator mediator) =>
            await mediator.Send(new RollbackInboundOrderCommand(orderId)))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Manage);
    }
}