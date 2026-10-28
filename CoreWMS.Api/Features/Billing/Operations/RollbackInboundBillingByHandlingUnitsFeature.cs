using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Operations;

public record RollbackInboundBillingByHandlingUnitsCommand(
    List<Guid> InboundOrderIds,
    List<Guid> CustomerIds
) : IRequest<IResult>;

public class RollbackInboundBillingByHandlingUnitsCommandValidator : AbstractValidator<RollbackInboundBillingByHandlingUnitsCommand>
{
    public RollbackInboundBillingByHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.InboundOrderIds).NotEmpty().WithMessage("Informe ao menos uma Ordem de Entrada.");
    }
}

public class RollbackInboundBillingByHandlingUnitsHandler : IRequestHandler<RollbackInboundBillingByHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly BillingEngineService _billingEngine;
    private readonly BillingChannel? _billingChannel;

    public RollbackInboundBillingByHandlingUnitsHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        BillingEngineService billingEngine,
        BillingChannel? billingChannel = null)
    {
        _db = db;
        _tenant = tenant;
        _billingEngine = billingEngine;
        _billingChannel = billingChannel;
    }

    public async Task<IResult> Handle(RollbackInboundBillingByHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var inboundOrders = await _db.InboundOrders
            .AsNoTracking()
            .Where(o => o.CompanyId == companyId && request.InboundOrderIds.Contains(o.Id))
            .ToListAsync(ct);

        if (!inboundOrders.Any())
            return Results.Ok(new { Message = "Nenhuma ordem de entrada localizada para ajuste de faturamento." });

        foreach (var order in inboundOrders)
        {
            // Verifica se a ordem ainda possui HUs restantes após o estorno
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
                // Estorno Total: remove as cobranças do extrato aberto
                if (billingItems.Any())
                {
                    _db.BillingItems.RemoveRange(billingItems);
                }
            }
            else if (order.CustomerId.HasValue && billingItems.Any())
            {
                // Estorno Parcial: recalcula o valor do Handling In considerando apenas o saldo físico restante
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
                                    $"Atualizado após estorno de HUs em {DateTime.UtcNow:dd/MM/yyyy HH:mm}"
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

        // Recalcula as diárias de armazenagem em background desconsiderando as HUs expurgadas
        if (_billingChannel != null && request.CustomerIds != null)
        {
            foreach (var custId in request.CustomerIds.Distinct())
            {
                await _billingChannel.EnqueueRecalculationAsync(new BillingRecalculationTask(
                    CompanyId: companyId,
                    CustomerId: custId,
                    ReferenceDate: DateTime.UtcNow,
                    TriggerOrderId: request.InboundOrderIds.FirstOrDefault(),
                    TriggerType: "Inbound_HU_Rollback"
                ), ct);
            }
        }

        return Results.Ok(new { Message = "Faturamento operacional e armazenagem recalculados com sucesso." });
    }
}

public static class RollbackInboundBillingByHandlingUnitsEndpoints
{
    public static void MapRollbackInboundBillingByHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/inbound/rollback-by-hus", async (RollbackInboundBillingByHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}