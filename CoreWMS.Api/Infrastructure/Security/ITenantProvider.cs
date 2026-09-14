namespace CoreWMS.Api.Infrastructure.Security;

public interface ITenantProvider
{
    Guid GetCompanyId();
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
        var header = _httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString();

        if (string.IsNullOrWhiteSpace(header) || !Guid.TryParse(header, out var companyId))
        {
            throw new UnauthorizedAccessException("O cabeçalho X-Company-Id é obrigatório e deve ser um GUID válido para acessar este recurso.");
        }

        return companyId;
    }
}