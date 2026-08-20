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
        // Pega a string de conexão das variáveis de ambiente (docker-compose)
        var connectionString = configuration.GetConnectionString("MongoDb");
        var client = new MongoClient(connectionString);
        var database = client.GetDatabase("corewms_audit");

        _auditCollection = database.GetCollection<AuditLog>("audit_logs");
    }

    public async Task LogAsync(AuditLog log, CancellationToken ct = default)
    {
        await _auditCollection.InsertOneAsync(log, cancellationToken: ct);
    }
}