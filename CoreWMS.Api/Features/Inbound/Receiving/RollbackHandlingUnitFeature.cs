using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Receiving;

public record RollbackHandlingUnitsCommand(List<Guid> HandlingUnitIds, string? Reason) : IRequest<IResult>;

public class RollbackHandlingUnitsCommandValidator : AbstractValidator<RollbackHandlingUnitsCommand>
{
    public RollbackHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Selecione ao menos uma HU para realizar o estorno.");
    }
}

public class RollbackHandlingUnitsHandler : IRequestHandler<RollbackHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;
    private readonly BillingEngineService _billingEngine;
    private readonly BillingChannel? _billingChannel;

    public RollbackHandlingUnitsHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        KardexChannel kardex,
        BillingEngineService billingEngine,
        BillingChannel? billingChannel = null)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
        _billingEngine = billingEngine;
        _billingChannel = billingChannel;
    }

    public async Task<IResult> Handle(RollbackHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var hus = await _db.HandlingUnits
            .Include(h => h.Product)
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id))
            .ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio (HU) encontrada." });

        var invalidStatusHus = hus.Where(h => h.Status == HuStatus.Shipped || h.Status == HuStatus.Staged || h.Status == HuStatus.Picking).ToList();
        if (invalidStatusHus.Any())
        {
            var lpns = string.Join(", ", invalidStatusHus.Select(h => h.Lpn));
            return Results.BadRequest(new
            {
                Message = $"As seguintes HUs não podem ser estornadas pois já estão em processo de saída/expedição: {lpns}."
            });
        }

        var huIds = hus.Select(h => h.Id).ToList();
        var allocatedHuIds = await _db.OutboundAllocations
            .Where(a => huIds.Contains(a.HandlingUnitId))
            .Select(a => a.HandlingUnitId)
            .Distinct()
            .ToListAsync(ct);

        if (allocatedHuIds.Any())
        {
            var allocatedLpns = string.Join(", ", hus.Where(h => allocatedHuIds.Contains(h.Id)).Select(h => h.Lpn));
            return Results.BadRequest(new
            {
                Message = $"As seguintes HUs não podem ser estornadas pois já possuem alocação em Notas de Saída/Retorno: {allocatedLpns}."
            });
        }

        var orderIds = hus.Where(h => h.ReceiptDocumentId.HasValue).Select(h => h.ReceiptDocumentId!.Value).Distinct().ToList();
        var inboundOrders = await _db.InboundOrders
            .Include(o => o.Items)
            .Where(o => orderIds.Contains(o.Id))
            .ToListAsync(ct);

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId))
            .ToListAsync(ct);

        foreach (var hu in hus)
        {
            if (hu.ReceiptDocumentId.HasValue)
            {
                var order = inboundOrders.FirstOrDefault(o => o.Id == hu.ReceiptDocumentId.Value);
                if (order != null)
                {
                    var item = order.Items.FirstOrDefault(i => i.ProductId == hu.ProductId);
                    if (item != null)
                    {
                        item.AddReceivedQuantity(-hu.CurrentQuantity);
                        if (item.Status == InboundOrderItemStatus.Completed)
                        {
                            item.UpdateStatus(InboundOrderItemStatus.Ready_To_Receive);
                        }
                    }
                    if (order.Status == InboundOrderStatus.Completed)
                    {
                        order.UpdateStatus(InboundOrderStatus.Receiving);
                    }
                }
            }

            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);
            if (balance != null)
            {
                balance.RollbackReceipt(hu.CurrentQuantity, hu.Status, hu.QualityStatus);
            }

            await _kardex.WriteAsync(new InventoryTransaction(
                companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId,
                TransactionType.Inventory_Adjustment_Out, -hu.CurrentQuantity, 0,
                hu.ReceiptDocumentId, $"ESTORNO HU {hu.Lpn}"), ct);
        }

        // 1. Remove fisicamente as HUs do banco
        _db.HandlingUnits.RemoveRange(hus);
        await _db.SaveChangesAsync(ct);

        // 2. TRATAMENTO DO FATURAMENTO (Handling In)
        foreach (var order in inboundOrders)
        {
            // Checa se ainda existem HUs ativas para esta ordem após a exclusão
            var hasRemainingHus = await _db.HandlingUnits
                .AnyAsync(h => h.ReceiptDocumentId == order.Id && h.CompanyId == companyId, ct);

            var billingItems = await _db.BillingItems
                .Where(b => (b.DocumentId == order.Id ||
                             (!string.IsNullOrWhiteSpace(order.InvoiceNumber) && b.DocumentNumber == order.InvoiceNumber) ||
                             (!string.IsNullOrWhiteSpace(order.InvoiceNumber) && b.Description.Contains(order.InvoiceNumber)) ||
                             b.Description.Contains(order.AccessKey))
                         && _db.BillingCycles.Any(c => c.Id == b.BillingCycleId && c.Status == BillingStatus.Draft))
                .ToListAsync(ct);

            if (!hasRemainingHus)
            {
                // Estorno Total: remove a cobrança do extrato aberto
                if (billingItems.Any())
                {
                    _db.BillingItems.RemoveRange(billingItems);
                }
            }
            else if (order.CustomerId.HasValue && billingItems.Any())
            {
                // Estorno Parcial: recalcula o Handling In considerando apenas as HUs restantes
                var customerId = order.CustomerId.Value;
                var currentMonth = DateTime.UtcNow.ToString("MM/yyyy");

                var cycle = await _db.BillingCycles
                    .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                              c.CustomerId == customerId &&
                                              c.ReferenceMonth == currentMonth &&
                                              c.Status == BillingStatus.Draft, ct);

                if (cycle != null)
                {
                    var tariffs = await _db.CustomerTariffs
                        .Include(t => t.BillingService)
                        .Where(t => t.CompanyId == companyId && t.CustomerId == customerId && t.BillingService.IsActive)
                        .ToListAsync(ct);

                    foreach (var item in billingItems)
                    {
                        var tariff = tariffs.FirstOrDefault(t => t.BillingServiceId == item.BillingServiceId);
                        if (tariff != null)
                        {
                            var recalculated = await _billingEngine.ExecuteOperationalEventAsync(
                                cycle,
                                tariff.BillingService,
                                tariff,
                                orderId: order.Id,
                                documentType: "NF-e Entrada",
                                documentNumber: order.InvoiceNumber ?? order.AccessKey[..8]
                            );

                            if (recalculated != null && recalculated.QuantityTotal > 0)
                            {
                                item.UpdateValues(
                                    recalculated.QuantityTotal,
                                    recalculated.ServiceTotal,
                                    recalculated.StatementDataJson,
                                    $"Atualizado após estorno parcial de HUs em {DateTime.UtcNow:dd/MM/yyyy HH:mm}"
                                );
                            }
                            else
                            {
                                _db.BillingItems.Remove(item);
                            }
                        }
                    }
                }
            }
        }

        await _db.SaveChangesAsync(ct);

        // 3. RECÁLCULO EM SEGUNDO PLANO DAS DIÁRIAS (Sem as HUs estornadas)
        if (_billingChannel != null)
        {
            var customerIds = hus.Select(h => h.CustomerId).Distinct();
            foreach (var custId in customerIds)
            {
                await _billingChannel.EnqueueRecalculationAsync(new BillingRecalculationTask(
                    CompanyId: companyId,
                    CustomerId: custId,
                    ReferenceDate: DateTime.UtcNow,
                    TriggerOrderId: orderIds.FirstOrDefault(),
                    TriggerType: "Inbound_HU_Rollback"
                ), ct);
            }
        }

        return Results.Ok(new { Message = $"{hus.Count} HU(s) estornada(s) com sucesso e faturamento atualizado." });
    }
}

public static class RollbackHandlingUnitEndpoints
{
    public static void MapRollbackHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/receive/hus/rollback", async ([FromBody] RollbackHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Receive);
    }
}