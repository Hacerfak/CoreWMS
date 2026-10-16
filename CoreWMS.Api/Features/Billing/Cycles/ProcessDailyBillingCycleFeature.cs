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
    private readonly BillingChannel _channel;

    public ProcessDailyBillingCycleHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        BillingChannel channel)
    {
        _db = db;
        _tenant = tenant;
        _channel = channel;
    }

    public async Task<IResult> Handle(ProcessDailyBillingCycleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var dateToProcess = request.ExecutionDate ?? DateTime.UtcNow.Date;
        var refMonth = dateToProcess.ToString("MM/yyyy");

        // 1. Obtém todos os ciclos abertos (Draft) para a competência em processamento
        var openCycles = await _db.BillingCycles
            .AsNoTracking()
            .Where(c => c.CompanyId == companyId && c.ReferenceMonth == refMonth && c.Status == BillingStatus.Draft)
            .Select(c => new { c.Id, c.CustomerId })
            .ToListAsync(ct);

        // 2. Enfileira a tarefa de apuração cumulativa para cada depositante no canal em segundo plano
        foreach (var cycle in openCycles)
        {
            await _channel.EnqueueRecalculationAsync(new BillingRecalculationTask(
                CompanyId: companyId,
                CustomerId: cycle.CustomerId,
                ReferenceDate: dateToProcess,
                TriggerOrderId: null,
                TriggerType: "Process_Daily_Cron"
            ), ct);
        }

        return Results.Ok(new
        {
            Message = $"Rotina de faturação diária para {dateToProcess:dd/MM/yyyy} enviada para processamento em segundo plano com sucesso.",
            QueuedCyclesCount = openCycles.Count,
            ExecutionDate = dateToProcess.ToString("dd/MM/yyyy")
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