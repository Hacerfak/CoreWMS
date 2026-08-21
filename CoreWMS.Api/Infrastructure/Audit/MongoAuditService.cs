using MongoDB.Driver;

namespace CoreWMS.Api.Infrastructure.Audit;

public interface IAuditService
{
    Task LogAsync(AuditLog log, CancellationToken ct = default);
}

public class MongoAuditService : IAuditService
{
    private readonly IMongoCollection<AuditLog> _auditCollection;

    public MongoAuditService(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("MongoDb");
        var client = new MongoClient(connectionString);
        var database = client.GetDatabase("corewms_audit");
        _auditCollection = database.GetCollection<AuditLog>("audit_logs");

        // Criação nativa do Índice TTL para autolimpeza em 90 dias
        var indexKeys = Builders<AuditLog>.IndexKeys.Ascending(x => x.Timestamp);
        var indexOptions = new CreateIndexOptions { ExpireAfter = TimeSpan.FromDays(90) };
        _auditCollection.Indexes.CreateOne(new CreateIndexModel<AuditLog>(indexKeys, indexOptions));
    }

    public async Task LogAsync(AuditLog log, CancellationToken ct = default)
    {
        await _auditCollection.InsertOneAsync(log, cancellationToken: ct);
    }
}