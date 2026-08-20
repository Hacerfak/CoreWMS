using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Identity.Entities;

public class Role : AuditableEntity
{
    public string Name { get; private set; }

    protected Role() { }

    public Role(string name)
    {
        Name = name;
    }
    // Método para atualizar o nome do perfil
    public void UpdateName(string name)
    {
        Name = name;
    }
}