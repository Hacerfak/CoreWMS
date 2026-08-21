using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Identity.Entities;

public class Role : AuditableEntity
{
    public string Name { get; private set; } = null!;
    public ICollection<RolePermission> Permissions { get; private set; } = new List<RolePermission>();

    protected Role() { }

    public Role(string name)
    {
        Name = name;
    }

    public void UpdateName(string name)
    {
        Name = name;
    }

    public void AddPermission(string permission)
    {
        if (!Permissions.Any(p => p.Permission == permission))
        {
            Permissions.Add(new RolePermission(Id, permission));
        }
    }
}