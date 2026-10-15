using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Billing.Entities;

public enum BillingServiceType
{
    Automatic_SQL = 1,
    Manual_Entry = 2,
    Automatic_Daily = 1,
    Operational_Event = 2
}

public class BillingService : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public BillingServiceType Type { get; private set; }
    public string? SqlTemplate { get; private set; }
    public bool IsActive { get; private set; } = true;

    protected BillingService() { }

    public BillingService(Guid companyId, string name, BillingServiceType type, string? sqlTemplate, bool isActive = true)
    {
        CompanyId = companyId;
        Name = name.Trim();
        Type = type;
        SqlTemplate = sqlTemplate?.Trim();
        IsActive = isActive;
    }

    public void UpdateDetails(string name, BillingServiceType type, string? sqlTemplate, bool isActive)
    {
        Name = name.Trim();
        Type = type;
        SqlTemplate = sqlTemplate?.Trim();
        IsActive = isActive;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetActive(bool isActive)
    {
        IsActive = isActive;
        UpdatedAt = DateTime.UtcNow;
    }
}