using System;
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
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Operations;

public record BillOutboundHandlingCommand(
    Guid OutboundOrderId,
    string OrderNumber,
    Guid CustomerId,
    Guid? HandlingServiceId,
    bool UsedStretchFilm,
    string TriggerType = "Outbound_Packing"
) : IRequest<IResult>;

public class BillOutboundHandlingCommandValidator : AbstractValidator<BillOutboundHandlingCommand>
{
    public BillOutboundHandlingCommandValidator()
    {
        RuleFor(x => x.OutboundOrderId).NotEmpty().WithMessage("O pedido de saída é obrigatório.");
        RuleFor(x => x.OrderNumber).NotEmpty().WithMessage("O número do pedido é obrigatório.");
        RuleFor(x => x.CustomerId).NotEmpty().WithMessage("O depositante é obrigatório.");
    }
}

public class BillOutboundHandlingHandler : IRequestHandler<BillOutboundHandlingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly BillingEngineService _billingEngine;
    private readonly BillingChannel? _billingChannel;

    public BillOutboundHandlingHandler(
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

    public async Task<IResult> Handle(BillOutboundHandlingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var currentMonth = DateTime.UtcNow.ToString("MM/yyyy");

        var cycle = await _db.BillingCycles
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                      c.CustomerId == request.CustomerId &&
                                      c.ReferenceMonth == currentMonth &&
                                      c.Status == BillingStatus.Draft, ct);

        if (cycle == null)
        {
            cycle = new BillingCycle(companyId, request.CustomerId, DateTime.UtcNow);
            _db.BillingCycles.Add(cycle);
            await _db.SaveChangesAsync(ct);
        }

        var customerTariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId &&
                        t.CustomerId == request.CustomerId &&
                        t.BillingService.IsActive &&
                        t.ValidFrom <= DateTime.UtcNow &&
                        (!t.ValidTo.HasValue || t.ValidTo >= DateTime.UtcNow))
            .ToListAsync(ct);

        // 1. Apuração de Separação / Handling Out
        CustomerTariff? handlingTariff = null;
        if (request.HandlingServiceId.HasValue)
        {
            handlingTariff = customerTariffs.FirstOrDefault(t => t.BillingServiceId == request.HandlingServiceId.Value);
        }

        handlingTariff ??= customerTariffs.FirstOrDefault(t =>
            !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate) &&
            (t.BillingService.Name.Contains("Expedição", StringComparison.OrdinalIgnoreCase) ||
             t.BillingService.Name.Contains("Handling Out", StringComparison.OrdinalIgnoreCase) ||
             t.BillingService.Name.Contains("Saída", StringComparison.OrdinalIgnoreCase) ||
             t.BillingService.Name.Contains("Separação", StringComparison.OrdinalIgnoreCase)));

        if (handlingTariff != null)
        {
            var calculatedItem = await _billingEngine.ExecuteOperationalEventAsync(
                cycle,
                handlingTariff.BillingService,
                handlingTariff,
                orderId: request.OutboundOrderId,
                documentType: "Ordem de Saída",
                documentNumber: request.OrderNumber,
                orderItemId: null
            );

            if (calculatedItem != null && (calculatedItem.QuantityTotal > 0 || calculatedItem.ServiceTotal > 0))
            {
                var existingItem = cycle.Items.FirstOrDefault(i =>
                    i.BillingServiceId == handlingTariff.BillingServiceId &&
                    i.DocumentId == request.OutboundOrderId &&
                    i.DocumentType == "Ordem de Saída");

                if (existingItem != null)
                {
                    existingItem.UpdateValues(
                        calculatedItem.QuantityTotal,
                        calculatedItem.ServiceTotal,
                        calculatedItem.StatementDataJson,
                        $"Atualizado em {DateTime.UtcNow:dd/MM/yyyy HH:mm} ({request.TriggerType})"
                    );
                }
                else
                {
                    _db.BillingItems.Add(calculatedItem);
                }
            }
        }

        // 2. Apuração de Insumo Stretch Film
        if (request.UsedStretchFilm)
        {
            var stretchTariff = customerTariffs.FirstOrDefault(t =>
                !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate) &&
                (t.BillingService.Name.Contains("Stretch", StringComparison.OrdinalIgnoreCase) ||
                 t.BillingService.Name.Contains("Filme", StringComparison.OrdinalIgnoreCase)));

            if (stretchTariff != null)
            {
                var calculatedStretchItem = await _billingEngine.ExecuteOperationalEventAsync(
                    cycle,
                    stretchTariff.BillingService,
                    stretchTariff,
                    orderId: request.OutboundOrderId,
                    documentType: "Ordem de Saída",
                    documentNumber: request.OrderNumber,
                    orderItemId: null
                );

                if (calculatedStretchItem != null && (calculatedStretchItem.QuantityTotal > 0 || calculatedStretchItem.ServiceTotal > 0))
                {
                    var existingStretch = cycle.Items.FirstOrDefault(i =>
                        i.BillingServiceId == stretchTariff.BillingServiceId &&
                        i.DocumentId == request.OutboundOrderId &&
                        i.DocumentType == "Ordem de Saída");

                    if (existingStretch != null)
                    {
                        existingStretch.UpdateValues(
                            calculatedStretchItem.QuantityTotal,
                            calculatedStretchItem.ServiceTotal,
                            calculatedStretchItem.StatementDataJson,
                            $"Atualizado em {DateTime.UtcNow:dd/MM/yyyy HH:mm} (Aplicação Stretch)"
                        );
                    }
                    else
                    {
                        _db.BillingItems.Add(calculatedStretchItem);
                    }
                }
            }
        }

        await _db.SaveChangesAsync(ct);

        // Enfileira recálculo de diárias
        if (_billingChannel != null)
        {
            await _billingChannel.EnqueueRecalculationAsync(new BillingRecalculationTask(
                CompanyId: companyId,
                CustomerId: request.CustomerId,
                ReferenceDate: DateTime.UtcNow,
                TriggerOrderId: request.OutboundOrderId,
                TriggerType: request.TriggerType
            ), ct);
        }

        return Results.Ok(new { Message = "Faturamento de expedição apurado com sucesso." });
    }
}

public static class BillOutboundHandlingEndpoints
{
    public static void MapBillOutboundHandlingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/outbound/bill-handling", async ([FromBody] BillOutboundHandlingCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}