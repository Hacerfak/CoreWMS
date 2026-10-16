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
        _logger.LogInformation("Billing Background Worker iniciado para processamento de apurações em segundo plano.");

        await foreach (var task in _channel.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var engine = scope.ServiceProvider.GetRequiredService<BillingEngineService>();

                _logger.LogInformation(
                    "[BILLING BACKGROUND] Recalculando apurações para Empresa: {CompanyId}, Cliente: {CustomerId}, Data: {Date:dd/MM/yyyy}",
                    task.CompanyId, task.CustomerId, task.ReferenceDate);

                await engine.UpsertDailyChargesAsync(task.CompanyId, task.CustomerId, task.ReferenceDate, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[BILLING BACKGROUND] Erro ao recalcular faturamento para Cliente: {CustomerId}", task.CustomerId);
            }
        }
    }
}