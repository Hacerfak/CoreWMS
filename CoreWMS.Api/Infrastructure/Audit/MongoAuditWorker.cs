using MongoDB.Driver;

namespace CoreWMS.Api.Infrastructure.Audit;

public class MongoAuditWorker : BackgroundService
{
    private readonly AuditChannel _auditChannel;
    private readonly IMongoCollection<AuditLog> _collection;
    private readonly ILogger<MongoAuditWorker> _logger;

    // Subimos o lote de 50 para 500 para aproveitar o desempenho do InsertManyAsync
    private const int MaxBatchSize = 500;

    public MongoAuditWorker(AuditChannel auditChannel, IMongoClient mongoClient, ILogger<MongoAuditWorker> logger)
    {
        _auditChannel = auditChannel;
        _logger = logger;

        var database = mongoClient.GetDatabase("corewms_audit");
        _collection = database.GetCollection<AuditLog>("audit_logs");

        // Cria o índice de expiração automática (TTL de 90 dias)
        var indexKeys = Builders<AuditLog>.IndexKeys.Ascending(x => x.Timestamp);
        var indexOptions = new CreateIndexOptions { ExpireAfter = TimeSpan.FromDays(90) };
        _collection.Indexes.CreateOne(new CreateIndexModel<AuditLog>(indexKeys, indexOptions));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var batch = new List<AuditLog>();

            try
            {
                // Espera de forma passiva sem consumir CPU e reage instantaneamente ao primeiro log
                if (await _auditChannel.Reader.WaitToReadAsync(stoppingToken))
                {
                    // Consome o primeiro
                    if (_auditChannel.Reader.TryRead(out var firstItem))
                    {
                        batch.Add(firstItem);
                    }

                    // Tenta recolher rapidamente os logs que vieram logo atrás (até 500)
                    while (batch.Count < MaxBatchSize && _auditChannel.Reader.TryRead(out var item))
                    {
                        batch.Add(item);
                    }
                }

                // Grava no Mongo independentemente de ter 1 ou 500 registos no lote
                if (batch.Any())
                {
                    await FlushBatchWithRetryAsync(batch, stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                // O serviço está a ser encerrado graciosamente
                break;
            }
            catch (Exception ex)
            {
                _logger.LogCritical(ex, "[MongoAuditWorker] Falha catastrófica no loop principal de auditoria.");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }

    private async Task FlushBatchWithRetryAsync(List<AuditLog> batch, CancellationToken ct)
    {
        bool success = false;
        int attempts = 0;

        // Fica retendo os dados em memória até conseguir acesso ao MongoDB
        while (!success && !ct.IsCancellationRequested)
        {
            try
            {
                attempts++;

                // IsOrdered = false otimiza o driver do Mongo para inserção paralela em disco
                await _collection.InsertManyAsync(batch, new InsertManyOptions { IsOrdered = false }, cancellationToken: ct);
                success = true;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                var delayMs = Math.Min(2000 * attempts, 30000); // Backoff de até 30 segundos
                _logger.LogError(ex, "[MongoAuditWorker] Erro ao gravar lote de auditoria no MongoDB. Tentativa {Attempt}. Retentando em {Delay}ms...", attempts, delayMs);

                await Task.Delay(delayMs, ct);
            }
        }
    }
}