using MongoDB.Driver;

namespace CoreWMS.Api.Infrastructure.Audit;

public class MongoAuditWorker : BackgroundService
{
    private readonly AuditChannel _auditChannel;
    private readonly IMongoCollection<AuditLog> _collection;
    private readonly ILogger<MongoAuditWorker> _logger;

    // Regras de negócio da fila
    private const int MaxBatchSize = 50;
    private static readonly TimeSpan MaxIdleTime = TimeSpan.FromMinutes(1);

    // MODIFICADO: Agora injetamos o IMongoClient Singleton!
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
        var batch = new List<AuditLog>(MaxBatchSize);

        while (!stoppingToken.IsCancellationRequested)
        {
            // Cria um cronômetro que vai "estourar" em 1 minuto
            using var timerCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            timerCts.CancelAfter(MaxIdleTime);

            try
            {
                // Espera por novos itens na fila OU até passar 1 minuto
                while (await _auditChannel.Reader.WaitToReadAsync(timerCts.Token))
                {
                    while (_auditChannel.Reader.TryRead(out var log))
                    {
                        batch.Add(log);

                        // REGRA 1: Bateu 50 registros, manda para o banco
                        if (batch.Count >= MaxBatchSize)
                        {
                            await FlushBatchAsync(batch, stoppingToken);
                            // Otimização: Se já enviamos o lote, renovamos o tempo de espera
                            timerCts.CancelAfter(MaxIdleTime);
                        }
                    }
                }
            }
            catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
            {
                // Cai aqui suavemente quando o 1 minuto estourar (Timeout normal)
            }

            // REGRA 2: Passou 1 minuto. Se tiver qualquer coisa na fila, manda pro banco.
            if (batch.Any())
            {
                await FlushBatchAsync(batch, stoppingToken);
            }
        }
    }

    private async Task FlushBatchAsync(List<AuditLog> batch, CancellationToken ct)
    {
        if (batch.Count == 0) return;

        try
        {
            await _collection.InsertManyAsync(batch, cancellationToken: ct);
            _logger.LogInformation("Auditoria: Lote de {Count} registros gravados no MongoDB.", batch.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro ao gravar lote de auditoria no MongoDB em segundo plano.");
        }
        finally
        {
            batch.Clear(); // Limpa o lote atual para começar a acumular novamente
        }
    }
}