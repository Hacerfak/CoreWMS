using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Identity.Entities;

public class User : AuditableEntity
{
    public string Name { get; private set; } = string.Empty;
    public string Email { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public bool IsMaster { get; private set; }
    public string? RefreshToken { get; private set; }
    public DateTime? RefreshTokenExpiryTime { get; private set; }

    // Relação com as empresas e perfis
    private readonly List<UserCompanyRole> _userCompanyRoles = new();
    public IReadOnlyCollection<UserCompanyRole> UserCompanyRoles => _userCompanyRoles.AsReadOnly();

    protected User() { }

    public User(string name, string email, string passwordHash, bool isMaster = false)
    {
        Name = name;
        Email = email;
        PasswordHash = passwordHash;
        IsMaster = isMaster;
    }

    // Método para vincular o usuário a um CNPJ com um perfil específico
    public void AssignToCompany(Guid companyId, Guid roleId)
    {
        // Regra de negócio: evitar duplicidade de vínculo no mesmo CNPJ com a mesma Role
        if (!_userCompanyRoles.Any(x => x.CompanyId == companyId && x.RoleId == roleId))
        {
            _userCompanyRoles.Add(new UserCompanyRole(Id, companyId, roleId));
        }
    }

    // Método para atualizar os dados básicos do usuário
    public void UpdateDetails(string name, string email)
    {
        Name = name;
        Email = email;
    }

    public void UpdatePassword(string passwordHash)
    {
        PasswordHash = passwordHash;
    }

    public void SetRefreshToken(string token, DateTime expiryTime)
    {
        RefreshToken = token;
        RefreshTokenExpiryTime = expiryTime;
    }
}