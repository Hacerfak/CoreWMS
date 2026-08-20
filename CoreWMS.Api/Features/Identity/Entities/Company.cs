using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Identity.Entities;

public class Company : AuditableEntity
{
    public string Cnpj { get; private set; }
    public string Name { get; private set; }

    // Construtor vazio exigido pelo Entity Framework
    protected Company() { }

    public Company(string cnpj, string name)
    {
        Cnpj = cnpj;
        Name = name;
    }
}