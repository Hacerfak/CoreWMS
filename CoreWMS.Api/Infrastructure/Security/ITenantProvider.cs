using System.Security.Claims;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

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
    private readonly ApplicationDbContext _db;
    private readonly IMemoryCache _cache;

    public TenantProvider(IHttpContextAccessor httpContextAccessor, ApplicationDbContext db, IMemoryCache cache)
    {
        _httpContextAccessor = httpContextAccessor;
        _db = db;
        _cache = cache;
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
        return GetAllowedCustomerIds().Count > 0;
    }

    public List<Guid> GetAllowedCustomerIds()
    {
        var user = _httpContextAccessor.HttpContext?.User;
        var userIdClaim = user?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return new List<Guid>();
        }

        var companyId = TryGetCompanyId();
        // 1. Chave de cache isolada por Usuário + Empresa
        var cacheKey = $"user_customers:{userId}:{companyId}";

        return _cache.GetOrCreate(cacheKey, entry =>
        {
            entry.SetSlidingExpiration(TimeSpan.FromMinutes(15));

            var query = _db.UserCustomers
                .AsNoTracking()
                .Where(uc => uc.UserId == userId);

            // 2. Garante que só retorna depositantes pertencentes à Empresa ativa
            if (companyId.HasValue)
            {
                query = query.Where(uc => uc.Customer.CompanyId == companyId.Value);
            }

            return query.Select(uc => uc.CustomerId).ToList();
        }) ?? new List<Guid>();
    }
}