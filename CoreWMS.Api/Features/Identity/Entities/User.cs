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
    // Controle de bloqueio contra força bruta
    public int FailedLoginAttempts { get; private set; }
    public DateTime? LockoutEnd { get; private set; }
    private readonly List<UserCompanyRole> _userCompanyRoles = new();
    public IReadOnlyCollection<UserCompanyRole> UserCompanyRoles => _userCompanyRoles.AsReadOnly();
    public ICollection<UserCustomer> UserCustomers { get; private set; } = new List<UserCustomer>();

    protected User() { }

    public User(string name, string email, string passwordHash, bool isMaster = false)
    {
        Name = name;
        Email = email;
        PasswordHash = passwordHash;
        IsMaster = isMaster;
    }

    public bool IsLockedOut() => LockoutEnd.HasValue && LockoutEnd.Value > DateTime.UtcNow;

    public void RegisterFailedLogin(int maxAttempts = 5, int lockoutMinutes = 15)
    {
        FailedLoginAttempts++;
        if (FailedLoginAttempts >= maxAttempts)
        {
            LockoutEnd = DateTime.UtcNow.AddMinutes(lockoutMinutes);
        }
    }

    public void ResetLoginFailures()
    {
        FailedLoginAttempts = 0;
        LockoutEnd = null;
    }

    public void AssignToCompany(Guid companyId, Guid roleId)
    {
        if (!_userCompanyRoles.Any(x => x.CompanyId == companyId && x.RoleId == roleId))
        {
            _userCompanyRoles.Add(new UserCompanyRole(Id, companyId, roleId));
        }
    }

    public void UpdateDetails(string name, string email)
    {
        Name = name;
        Email = email;
    }

    public void UpdatePassword(string passwordHash)
    {
        PasswordHash = passwordHash;
        ResetLoginFailures();
    }

    public void SetRefreshToken(string token, DateTime expiryTime)
    {
        RefreshToken = token;
        RefreshTokenExpiryTime = expiryTime;
    }
}