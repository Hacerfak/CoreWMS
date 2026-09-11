using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CoreWMS.Api.Infrastructure.Services.Inventory;

public class MasterDataCacheService
{
    private readonly IMemoryCache _cache;
    private readonly IServiceScopeFactory _scopeFactory;

    public MasterDataCacheService(IMemoryCache cache, IServiceScopeFactory scopeFactory)
    {
        _cache = cache;
        _scopeFactory = scopeFactory;
    }

    public async Task<Product?> GetProductWithRulesAsync(Guid productId, CancellationToken ct = default)
    {
        var cacheKey = $"Product_{productId}";

        if (!_cache.TryGetValue(cacheKey, out Product? product))
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            product = await db.Products
                .AsNoTracking()
                .Include(p => p.Customer)
                .Include(p => p.Packagings)
                .FirstOrDefaultAsync(p => p.Id == productId, ct);

            if (product != null)
            {
                var options = new MemoryCacheEntryOptions()
                    .SetSlidingExpiration(TimeSpan.FromMinutes(15));

                _cache.Set(cacheKey, product, options);
            }
        }

        return product;
    }

    public void InvalidateProduct(Guid productId)
    {
        _cache.Remove($"Product_{productId}");
    }
}