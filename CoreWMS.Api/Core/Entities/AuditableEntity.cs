namespace CoreWMS.Api.Core.Entities;

public abstract class AuditableEntity
{
    // Usando Guid como ID padrão para evitar previsibilidade (segurança) e facilitar integrações
    public Guid Id { get; protected set; } = Guid.CreateVersion7();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}