using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Billing.Entities;

public enum BillingServiceType
{
    Automatic_SQL = 1, // Calculado sozinho pelo Motor
    Manual_Entry = 2   // Inserido manualmente na tela de fechamento
}

public class BillingService : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public string Name { get; private set; } = string.Empty; // Ex: Armazenagem Diária (Palete)
    public BillingServiceType Type { get; private set; }

    // A query dinâmica. Para serviços manuais, será null.
    public string? SqlTemplate { get; private set; }

    protected BillingService() { }

    public BillingService(Guid companyId, string name, BillingServiceType type, string? sqlTemplate)
    {
        CompanyId = companyId;
        Name = name;
        Type = type;
        SqlTemplate = sqlTemplate;
    }
}