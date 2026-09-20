using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Identity.Entities;

public class RolePermission : AuditableEntity
{
    public Guid RoleId { get; private set; }
    public Role Role { get; private set; } = null!;
    public string Permission { get; private set; } = string.Empty;

    protected RolePermission() { }

    public RolePermission(Guid roleId, string permission)
    {
        RoleId = roleId;
        Permission = permission;
    }
}