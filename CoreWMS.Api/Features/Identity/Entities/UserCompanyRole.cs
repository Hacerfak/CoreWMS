using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Identity.Entities;

public class UserCompanyRole : AuditableEntity
{
    public Guid UserId { get; private set; }
    public User User { get; private set; } = null!;

    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public Guid RoleId { get; private set; }
    public Role Role { get; private set; } = null!;

    protected UserCompanyRole() { }

    public UserCompanyRole(Guid userId, Guid companyId, Guid roleId)
    {
        UserId = userId;
        CompanyId = companyId;
        RoleId = roleId;
    }
}