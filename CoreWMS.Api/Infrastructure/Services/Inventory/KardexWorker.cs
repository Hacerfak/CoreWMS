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
                // Espera passivamente até que a primeira transação chegue ao canal
                if (await _channel.Reader.WaitToReadAsync(stoppingToken))
                {
                    // Lê a primeira transação
                    if (_channel.Reader.TryRead(out var firstItem))
                    {
                        batch.Add(firstItem);
                    }

                    // Tenta esvaziar o resto do canal instantaneamente (até ao limite de 500)
                    while (batch.Count < 500 && _channel.Reader.TryRead(out var item))
                    {
                        batch.Add(item);
                    }
                }

                if (batch.Any())
                {
                    await PersistBatchWithRetryAsync(batch, stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                // O servidor está a ser desligado de forma graciosa, encerra o loop.
                break;
            }
            catch (Exception ex)
            {
                _logger.LogCritical(ex, "[KardexWorker] Falha catastrófica no loop principal.");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }

    private async Task PersistBatchWithRetryAsync(List<InventoryTransaction> batch, CancellationToken ct)
    {
        bool success = false;
        int attempts = 0;

        // Mantém as transações em memória e tenta gravar até conseguir (evita perda de dados do Kardex)
        while (!success && !ct.IsCancellationRequested)
        {
            try
            {
                attempts++;
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                await db.InventoryTransactions.AddRangeAsync(batch, ct);
                await db.SaveChangesAsync(ct);

                success = true;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                var delayMs = Math.Min(2000 * attempts, 30000); // Backoff progressivo até um máximo de 30s
                _logger.LogError(ex, "[KardexWorker] Erro ao persistir lote de {Count} transações. Tentativa {Attempt}. Retentando em {Delay}ms...", batch.Count, attempts, delayMs);

                await Task.Delay(delayMs, ct);
            }
        }
    }
}