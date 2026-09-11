using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Infrastructure.Data;

namespace CoreWMS.Api.Infrastructure.Services.Inventory;

public class KardexWorker : BackgroundService
{
    private readonly KardexChannel _channel;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<KardexWorker> _logger;

    public KardexWorker(KardexChannel channel, IServiceProvider serviceProvider, ILogger<KardexWorker> logger)
    {
        _channel = channel;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var batch = new List<InventoryTransaction>();
            try
            {
                await foreach (var transaction in _channel.ReadAllAsync(stoppingToken))
                {
                    batch.Add(transaction);

                    if (batch.Count >= 500) break;
                }

                if (batch.Any())
                {
                    using var scope = _serviceProvider.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                    await db.InventoryTransactions.AddRangeAsync(batch, stoppingToken);
                    await db.SaveChangesAsync(stoppingToken);

                    batch.Clear();
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogCritical(ex, "[KardexWorker] Falha grave ao persistir transações de inventário. Retentando em 5s...");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }
}