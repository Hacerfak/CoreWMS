using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace CoreWMS.Api.Infrastructure.Audit;

public class AuditLog
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; } // O Mongo usa ObjectId como padrão

    public string EntityName { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty; // "Create", "Update", "Delete"
    public string? UserId { get; set; } // Quem fez a ação (ID do JWT)
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    // Guardaremos as mudanças num dicionário que o Mongo converte para um objeto aninhado lindo!
    public Dictionary<string, object?> Changes { get; set; } = new();
}