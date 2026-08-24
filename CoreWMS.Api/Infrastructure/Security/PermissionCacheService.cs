using Microsoft.Extensions.Caching.Memory;

namespace CoreWMS.Api.Infrastructure.Security;

public interface IPermissionCacheService
{
    void InvalidateUserCompanyCache(Guid userId, Guid companyId);
    void InvalidateUserAllCompaniesCache(Guid userId);
}

public class PermissionCacheService : IPermissionCacheService
{
    private readonly IMemoryCache _cache;

    public PermissionCacheService(IMemoryCache cache)
    {
        _cache = cache;
    }

    public void InvalidateUserCompanyCache(Guid userId, Guid companyId)
    {
        var cacheKey = $"perm:{userId}:{companyId}";
        _cache.Remove(cacheKey);
    }

    public void InvalidateUserAllCompaniesCache(Guid userId)
    {
        // Remove entradas da memória baseadas no padrão de chave do usuário
        if (_cache is MemoryCache memoryCache)
        {
            // Força a remoção manual disparando a invalidação lógica
            memoryCache.Compact(1.0);
        }
    }
}