using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Cycles;

public record ProcessDailyBillingCycleCommand(DateTime? ExecutionDate = null) : IRequest<IResult>;

public class ProcessDailyBillingCycleHandler : IRequestHandler<ProcessDailyBillingCycleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly BillingEngineService _engine;

    public ProcessDailyBillingCycleHandler(ApplicationDbContext db, ITenantProvider tenant, BillingEngineService engine)
    {
        _db = db;
        _tenant = tenant;
        _engine = engine;
    }

    public async Task<IResult> Handle(ProcessDailyBillingCycleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var dateToProcess = request.ExecutionDate ?? DateTime.UtcNow.Date;
        var refMonth = dateToProcess.ToString("MM/yyyy");

        // 1. Busca todos os depositantes que possuem ciclo aberto no mês corrente
        var openCycles = await _db.BillingCycles
            .Include(c => c.Items)
            .Where(c => c.CompanyId == companyId && c.ReferenceMonth == refMonth && c.Status == BillingStatus.Draft)
            .ToListAsync(ct);

        int itemsGeneratedCount = 0;

        foreach (var cycle in openCycles)
        {
            // Busca serviços automáticos diários com tarifa ativa para este cliente
            var activeTariffs = await _db.CustomerTariffs
                .AsNoTracking()
                .Include(t => t.BillingService)
                .Where(t => t.CompanyId == companyId &&
                            t.CustomerId == cycle.CustomerId &&
                            t.BillingService.IsActive &&
                            t.BillingService.Type == BillingServiceType.Automatic_Daily &&
                            t.ValidFrom <= dateToProcess &&
                            (t.ValidTo == null || t.ValidTo >= dateToProcess))
                .ToListAsync(ct);

            foreach (var tariff in activeTariffs)
            {
                // Idempotência: Evita duplicar a mesma diária se o job rodar mais de uma vez no mesmo dia
                var dailyDescription = $"{tariff.BillingService.Name} - {dateToProcess:dd/MM/yyyy}";
                bool alreadyProcessed = cycle.Items.Any(i => i.BillingServiceId == tariff.BillingServiceId && i.Description == dailyDescription);

                if (alreadyProcessed) continue;

                var billingItem = await _engine.ExecuteDailyServiceAsync(cycle, tariff.BillingService, tariff, dateToProcess);
                if (billingItem != null)
                {
                    _db.BillingItems.Add(billingItem);
                    itemsGeneratedCount++;
                }
            }
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Rotina de faturamento diário concluída para {dateToProcess:dd/MM/yyyy}.",
            CyclesProcessed = openCycles.Count,
            DailyEntriesGenerated = itemsGeneratedCount
        });
    }
}

public static class ProcessDailyBillingCycleEndpoints
{
    public static void MapProcessDailyBillingCycleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/cycles/process-daily", async (ProcessDailyBillingCycleCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .WithTags("Billing")
            .RequireAuthorization()
            .RequirePermission(Permissions.Billing.Manage);
    }
}