namespace CoreWMS.Api.Features.Quality.Entities;

using CoreWMS.Api.Core.Entities;

public class QualityReason : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public string Code { get; private set; } = string.Empty; // Ex: AVARIA
    public string Description { get; private set; } = string.Empty;
    public bool IsActive { get; private set; } = true;

    protected QualityReason() { }

    public QualityReason(Guid companyId, string code, string description)
    {
        CompanyId = companyId;
        Code = code.ToUpper().Trim();
        Description = description;
    }
}