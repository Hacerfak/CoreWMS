using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;

namespace CoreWMS.Api.Features.Products.Entities;

public class PackagingType : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public string Code { get; private set; } = string.Empty; // Ex: CX, PAL, SAC
    public string Description { get; private set; } = string.Empty; // Ex: Caixa Papelão, Saco 50kg
    public bool IsActive { get; private set; } = true;

    protected PackagingType() { }

    public PackagingType(Guid companyId, string code, string description)
    {
        CompanyId = companyId;
        Code = code.ToUpper().Trim();
        Description = description;
    }

    public void Update(string description, bool isActive)
    {
        Description = description;
        IsActive = isActive;
        UpdatedAt = DateTime.UtcNow;
    }
}