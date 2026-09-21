using Microsoft.AspNetCore.Http;

namespace CoreWMS.Api.Infrastructure.Security;

public interface ITenantProvider
{
    Guid GetCompanyId();
    Guid? TryGetCompanyId();
    bool IsPartnerUser();
    List<Guid> GetAllowedCustomerIds();
}

public class TenantProvider : ITenantProvider
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public TenantProvider(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid GetCompanyId()
    {
        var companyId = TryGetCompanyId();
        if (!companyId.HasValue)
        {
            throw new UnauthorizedAccessException("O cabeçalho X-Company-Id é obrigatório e deve ser um GUID válido para acessar este recurso.");
        }

        return companyId.Value;
    }

    public Guid? TryGetCompanyId()
    {
        var context = _httpContextAccessor.HttpContext;
        if (context == null) return null;

        var header = context.Request.Headers["X-Company-Id"].ToString();
        if (string.IsNullOrWhiteSpace(header) || !Guid.TryParse(header, out var companyId))
        {
            return null;
        }

        return companyId;
    }

    public bool IsPartnerUser()
    {
        var claim = _httpContextAccessor.HttpContext?.User?.FindFirst("isPartner")?.Value;
        return claim == "True" || claim == "true";
    }

    public List<Guid> GetAllowedCustomerIds()
    {
        var claim = _httpContextAccessor.HttpContext?.User?.FindFirst("customers")?.Value;
        if (string.IsNullOrWhiteSpace(claim)) return new List<Guid>();

        return claim.Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(Guid.Parse)
                    .ToList();
    }
}