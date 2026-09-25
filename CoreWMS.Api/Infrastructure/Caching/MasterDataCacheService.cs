using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CoreWMS.Api.Infrastructure.Caching;

public record PackagingCacheModel(Guid Id, string Code, decimal ConversionFactor, bool AllowFractional, int MaxStacking);
public record CustomerSlaCacheModel(bool RequiresBlindInbound, bool RequiresBlindOutbound);

public record ProductMasterDataCacheModel(
    Guid ProductId, Guid CustomerId, string Sku,
    bool StrictBatch, bool StrictExpiration, bool StrictManufacture, bool StrictSerial,
    PickingStrategy PickingStrategy, CustomerSlaCacheModel CustomerSla,
    Dictionary<string, PackagingCacheModel> PackagingsByBarcode
);

public interface IMasterDataCacheService
{
    Task<ProductMasterDataCacheModel?> GetProductRulesAsync(Guid companyId, Guid productId, CancellationToken ct = default);
    Task<ProductMasterDataCacheModel?> ResolveBarcodeAsync(Guid companyId, Guid customerId, string barcode, CancellationToken ct = default);
    void InvalidateProduct(Guid companyId, Guid productId);

    Task<Guid?> GetLocationIdAsync(string fullPath, CancellationToken ct = default);
    void InvalidateLocation(string fullPath);
}

public class MasterDataCacheService : IMasterDataCacheService
{
    private readonly IMemoryCache _cache;
    private readonly IServiceScopeFactory _scopeFactory;

    public MasterDataCacheService(IMemoryCache cache, IServiceScopeFactory scopeFactory)
    {
        _cache = cache;
        _scopeFactory = scopeFactory;
    }

    public async Task<ProductMasterDataCacheModel?> GetProductRulesAsync(Guid companyId, Guid productId, CancellationToken ct = default)
    {
        var cacheKey = $"MasterData_Product_{companyId}_{productId}";

        return await _cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var data = await db.Products
                .AsNoTracking()
                .Where(p => p.Id == productId && p.CompanyId == companyId)
                .Select(p => new
                {
                    p.Id,
                    p.CustomerId,
                    p.Sku,
                    p.StrictBatch,
                    p.StrictExpiration,
                    p.StrictManufacture,
                    p.StrictSerial,
                    p.PickingStrategy,
                    CustomerStrictBatch = p.Customer.StrictBatch,
                    CustomerStrictExp = p.Customer.StrictExpiration,
                    CustomerStrictMfg = p.Customer.StrictManufacture,
                    CustomerStrictSerial = p.Customer.StrictSerial,
                    p.Customer.RequiresBlindInbound,
                    p.Customer.RequiresBlindOutbound,
                    Packagings = p.Packagings.Select(pack => new
                    {
                        pack.Id,
                        pack.PackagingType.Code,
                        pack.ConversionFactor,
                        pack.AllowFractionalPicking,
                        pack.Barcode,
                        pack.MaxStacking
                    }).ToList()
                })
                .FirstOrDefaultAsync(ct);

            if (data == null)
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
                return null;
            }

            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12);

            var packagingsDict = new Dictionary<string, PackagingCacheModel>(StringComparer.OrdinalIgnoreCase);
            foreach (var pack in data.Packagings.Where(p => !string.IsNullOrWhiteSpace(p.Barcode)))
            {
                packagingsDict[pack.Barcode!] = new PackagingCacheModel(
                    pack.Id,
                    pack.Code,
                    pack.ConversionFactor,
                    pack.AllowFractionalPicking,
                    pack.MaxStacking
                );
            }

            return new ProductMasterDataCacheModel(
                data.Id, data.CustomerId, data.Sku,
                data.StrictBatch || data.CustomerStrictBatch,
                data.StrictExpiration || data.CustomerStrictExp,
                data.StrictManufacture || data.CustomerStrictMfg,
                data.StrictSerial || data.CustomerStrictSerial,
                data.PickingStrategy,
                new CustomerSlaCacheModel(data.RequiresBlindInbound, data.RequiresBlindOutbound),
                packagingsDict
            );
        });
    }

    public async Task<ProductMasterDataCacheModel?> ResolveBarcodeAsync(Guid companyId, Guid customerId, string barcode, CancellationToken ct = default)
    {
        var safeBarcode = barcode.Trim().ToUpper();
        var barcodeKey = $"BarcodeMap_{companyId}_{customerId}_{safeBarcode}";

        var productId = await _cache.GetOrCreateAsync(barcodeKey, async entry =>
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var id = await db.ProductPackagings
                .Where(pp => pp.Product.CompanyId == companyId && pp.Product.CustomerId == customerId && pp.Barcode == safeBarcode)
                .Select(pp => pp.ProductId)
                .FirstOrDefaultAsync(ct);

            if (id == Guid.Empty)
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
                return Guid.Empty;
            }

            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12);
            return id;
        });

        if (productId == Guid.Empty) return null;

        return await GetProductRulesAsync(companyId, productId, ct);
    }

    public void InvalidateProduct(Guid companyId, Guid productId)
    {
        _cache.Remove($"MasterData_Product_{companyId}_{productId}");
    }

    public async Task<Guid?> GetLocationIdAsync(string fullPath, CancellationToken ct = default)
    {
        var safePath = fullPath.Trim().ToUpper();
        var cacheKey = $"Location_Global_{safePath}";

        return await _cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var locationId = await db.Locations
                .Where(l => l.FullPath == safePath && l.Zone.Warehouse.Code != "")
                .Select(l => l.Id)
                .FirstOrDefaultAsync(ct);

            if (locationId == Guid.Empty)
            {
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(1);
                return (Guid?)null;
            }

            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12);
            return locationId;
        });
    }

    public void InvalidateLocation(string fullPath)
    {
        _cache.Remove($"Location_Global_{fullPath.Trim().ToUpper()}");
    }
}