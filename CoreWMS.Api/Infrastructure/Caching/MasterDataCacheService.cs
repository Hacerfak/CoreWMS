using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CoreWMS.Api.Infrastructure.Caching;

// DTOs de Cache (Leves e Imutáveis)
public record PackagingCacheModel(Guid Id, string Code, decimal ConversionFactor, bool AllowFractional);
public record CustomerSlaCacheModel(bool RequiresBlindInbound, bool RequiresBlindOutbound);
public record ProductMasterDataCacheModel(
    Guid ProductId, Guid CustomerId, string Sku, int MaxStacking,
    bool StrictBatch, bool StrictExpiration, bool StrictManufacture, bool StrictSerial,
    PickingStrategy PickingStrategy, CustomerSlaCacheModel CustomerSla,
    Dictionary<string, PackagingCacheModel> PackagingsByBarcode
);

public interface IMasterDataCacheService
{
    // Catálogo e Produtos
    Task<ProductMasterDataCacheModel?> GetProductRulesAsync(Guid companyId, Guid productId, CancellationToken ct = default);
    Task<ProductMasterDataCacheModel?> ResolveBarcodeAsync(Guid companyId, Guid customerId, string barcode, CancellationToken ct = default);
    void InvalidateProduct(Guid companyId, Guid productId);

    // Topologia e Endereços
    Task<Guid?> GetLocationIdAsync(Guid companyId, string fullPath, CancellationToken ct = default);
    void InvalidateLocation(Guid companyId, string fullPath);
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

    // ==========================================
    // CACHE DE PRODUTOS E CLIENTES
    // ==========================================
    public async Task<ProductMasterDataCacheModel?> GetProductRulesAsync(Guid companyId, Guid productId, CancellationToken ct = default)
    {
        var cacheKey = $"MasterData_Product_{companyId}_{productId}";

        return await _cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12);

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
                    p.MaxStacking,
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
                    Packagings = p.Packagings.Select(pack => new { pack.Id, pack.PackagingType.Code, pack.ConversionFactor, pack.AllowFractionalPicking, pack.Barcode }).ToList()
                })
                .FirstOrDefaultAsync(ct);

            if (data == null) return null;

            var packagingsDict = new Dictionary<string, PackagingCacheModel>(StringComparer.OrdinalIgnoreCase);
            foreach (var pack in data.Packagings.Where(p => !string.IsNullOrWhiteSpace(p.Barcode)))
            {
                packagingsDict[pack.Barcode!] = new PackagingCacheModel(pack.Id, pack.Code, pack.ConversionFactor, pack.AllowFractionalPicking);
            }

            return new ProductMasterDataCacheModel(
                data.Id, data.CustomerId, data.Sku, data.MaxStacking,
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
        var barcodeKey = $"BarcodeMap_{companyId}_{customerId}_{barcode.ToUpper()}";

        var productId = await _cache.GetOrCreateAsync(barcodeKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12);

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            return await db.ProductPackagings
                .Where(pp => pp.Product.CompanyId == companyId && pp.Product.CustomerId == customerId && pp.Barcode == barcode.ToUpper())
                .Select(pp => pp.ProductId)
                .FirstOrDefaultAsync(ct);
        });

        if (productId == Guid.Empty) return null;

        return await GetProductRulesAsync(companyId, productId, ct);
    }

    public void InvalidateProduct(Guid companyId, Guid productId)
    {
        _cache.Remove($"MasterData_Product_{companyId}_{productId}");
    }

    // ==========================================
    // CACHE DE TOPOLOGIA (LOCALIZAÇÕES)
    // ==========================================
    public async Task<Guid?> GetLocationIdAsync(Guid companyId, string fullPath, CancellationToken ct = default)
    {
        var cacheKey = $"Location_{companyId}_{fullPath.ToUpper()}";

        return await _cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(12);

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var locationId = await db.Locations
                .Where(l => l.FullPath == fullPath.ToUpper() && l.Zone.Warehouse.Code != "") // O Code do warehouse é garantido pela navegação
                .Select(l => l.Id)
                .FirstOrDefaultAsync(ct);

            return locationId == Guid.Empty ? (Guid?)null : locationId;
        });
    }

    public void InvalidateLocation(Guid companyId, string fullPath)
    {
        _cache.Remove($"Location_{companyId}_{fullPath.ToUpper()}");
    }
}