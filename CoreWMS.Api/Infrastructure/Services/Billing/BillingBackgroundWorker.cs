using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CoreWMS.Api.Infrastructure.Services.Billing;

public class BillingBackgroundWorker : BackgroundService
{
    private readonly BillingChannel _channel;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<BillingBackgroundWorker> _logger;

    public BillingBackgroundWorker(
        BillingChannel channel,
        IServiceScopeFactory scopeFactory,
        ILogger<BillingBackgroundWorker> logger)
    {
        _channel = channel;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Billing Background Worker iniciado (Consumo de Eventos + Cron Diário Autônomo).");

        // Executa em paralelo: Fila do Channel + Agendador Matutino às 04:00
        var channelTask = ProcessChannelQueueAsync(stoppingToken);
        var dailyCronTask = ScheduleAutonomousDailyBillingAsync(stoppingToken);

        await Task.WhenAll(channelTask, dailyCronTask);
    }

    // 1. Processa eventos operacionais em tempo real (Recebimento, Packing e Estornos)
    private async Task ProcessChannelQueueAsync(CancellationToken ct)
    {
        await foreach (var task in _channel.ReadAllAsync(ct))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var engine = scope.ServiceProvider.GetRequiredService<BillingEngineService>();

                _logger.LogInformation(
                    "[BILLING] Recalculando apuração para Cliente {CustomerId} referente a {Date:dd/MM/yyyy} (Gatilho: {Trigger})",
                    task.CustomerId, task.ReferenceDate, task.TriggerType ?? "Operacional");

                await engine.UpsertDailyChargesAsync(task.CompanyId, task.CustomerId, task.ReferenceDate, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[BILLING] Erro ao recalcular faturamento para Cliente {CustomerId}", task.CustomerId);
            }
        }
    }

    // 2. Cron autônomo matutino: roda todos os dias às 04:00 (Horário de Brasília)
    private async Task ScheduleAutonomousDailyBillingAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var tz = GetBrasiliaTimeZone();
                var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);

                // Próxima execução programada para as 04:00
                var nextRun = now.Date.AddHours(4);
                if (now >= nextRun)
                {
                    nextRun = nextRun.AddDays(1);
                }

                var delay = nextRun - now;

                _logger.LogInformation(
                    "[BILLING CRON] Próxima apuração matutina agendada para {DataHora} (em {Horas}h {Minutos}min).",
                    nextRun.ToString("dd/MM/yyyy HH:mm:ss"), (int)delay.TotalHours, delay.Minutes);

                await Task.Delay(delay, ct);

                _logger.LogInformation("[BILLING CRON] Iniciando rotina matutina autônoma de faturamento diário...");

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var engine = scope.ServiceProvider.GetRequiredService<BillingEngineService>();

                // Apura as diárias de "ontem" (o dia operacional que acabou de se encerrar)
                var yesterday = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz).Date.AddDays(-1);
                var refMonth = yesterday.ToString("MM/yyyy");

                var openCycles = await db.BillingCycles
                    .AsNoTracking()
                    .Where(c => c.ReferenceMonth == refMonth && c.Status == BillingStatus.Draft)
                    .Select(c => new { c.CompanyId, c.CustomerId })
                    .Distinct()
                    .ToListAsync(ct);

                _logger.LogInformation(
                    "[BILLING CRON] Processando diárias de {DataRef} para {Count} depositante(s) com ciclo aberto.",
                    yesterday.ToString("dd/MM/yyyy"), openCycles.Count);

                foreach (var cycle in openCycles)
                {
                    try
                    {
                        await engine.UpsertDailyChargesAsync(cycle.CompanyId, cycle.CustomerId, yesterday, ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "[BILLING CRON] Falha na diária do cliente {CustomerId}", cycle.CustomerId);
                    }
                }

                _logger.LogInformation("[BILLING CRON] Apuração matutina finalizada com sucesso.");
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[BILLING CRON] Erro no agendador matutino. Tentando novamente em 30 minutos.");
                await Task.Delay(TimeSpan.FromMinutes(30), ct);
            }
        }
    }

    // Suporte multiplataforma (Linux/Docker e Windows) para o fuso horário de Brasília
    private static TimeZoneInfo GetBrasiliaTimeZone()
    {
        string[] tzIds = ["America/Sao_Paulo", "E. South America Standard Time", "Central Brazilian Standard Time"];
        foreach (var id in tzIds)
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("Brasilia", TimeSpan.FromHours(-3), "Brasilia", "Brasilia");
    }
}