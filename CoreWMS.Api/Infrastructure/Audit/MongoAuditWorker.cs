using MongoDB.Driver;

namespace CoreWMS.Api.Infrastructure.Audit;

public class MongoAuditWorker : BackgroundService
{
    private readonly AuditChannel _auditChannel;
    private readonly IMongoCollection<AuditLog> _collection;
    private readonly ILogger<MongoAuditWorker> _logger;

    public MongoAuditWorker(AuditChannel auditChannel, IConfiguration config, ILogger<MongoAuditWorker> logger)
    {
        _auditChannel = auditChannel;
        _logger = logger;

        var connectionString = config.GetConnectionString("MongoDb");
        var client = new MongoClient(connectionString);
        var database = client.GetDatabase("corewms_audit");
        _collection = database.GetCollection<AuditLog>("audit_logs");

        var indexKeys = Builders<AuditLog>.IndexKeys.Ascending(x => x.Timestamp);
        var indexOptions = new CreateIndexOptions { ExpireAfter = TimeSpan.FromDays(90) };
        _collection.Indexes.CreateOne(new CreateIndexModel<AuditLog>(indexKeys, indexOptions));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var batch = new List<AuditLog>();

        await foreach (var log in _auditChannel.ReadAllAsync(stoppingToken))
        {
            batch.Add(log);

            // Grava em lotes de 50 itens para otimizar I/O (mudei para 2 para testar)
            if (batch.Count >= 2)
            {
                await FlushBatchAsync(batch, stoppingToken);
            }
        }

        if (batch.Count > 0)
        {
            await FlushBatchAsync(batch, CancellationToken.None);
        }
    }

    private async Task FlushBatchAsync(List<AuditLog> batch, CancellationToken ct)
    {
        try
        {
            await _collection.InsertManyAsync(batch, cancellationToken: ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro ao gravar lote de auditoria no MongoDB em segundo plano.");
        }
        finally
        {
            batch.Clear();
        }
    }
}