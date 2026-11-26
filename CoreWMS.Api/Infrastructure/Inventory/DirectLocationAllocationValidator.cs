using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Infrastructure.Inventory;

public record DirectAllocationCandidate(
    Guid TargetLocationId,
    Guid ProductId,
    Guid PackagingTypeId,
    string? Batch,
    int VolumeCount,
    QualityStatus QualityStatus
);

public interface IDirectLocationAllocationValidator
{
    Task<Dictionary<Guid, Location>> ValidateAndLoadLocationsAsync(
        Guid companyId,
        IReadOnlyCollection<DirectAllocationCandidate> candidates,
        CancellationToken ct);
}

public class DirectLocationAllocationValidator : IDirectLocationAllocationValidator
{
    private readonly ApplicationDbContext _db;

    public DirectLocationAllocationValidator(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<Dictionary<Guid, Location>> ValidateAndLoadLocationsAsync(
        Guid companyId,
        IReadOnlyCollection<DirectAllocationCandidate> candidates,
        CancellationToken ct)
    {
        var distinctLocationIds = candidates
            .Select(c => c.TargetLocationId)
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();

        var locations = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Include(l => l.Zone)
                .ThenInclude(z => z.Warehouse)
            .Where(l => distinctLocationIds.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, ct);

        foreach (var locId in distinctLocationIds)
        {
            if (!locations.TryGetValue(locId, out var loc) || !loc.IsActive)
                throw new InvalidOperationException("Endereço de alocação inválido ou inativo.");

            if (loc.StorageType == null)
                throw new InvalidOperationException($"Endereço {loc.FullPath} não possui tipo de armazenamento configurado.");

            if (loc.StorageType.Role == StorageRole.Dock)
                throw new InvalidOperationException($"Endereço {loc.FullPath} é uma doca e não pode ser usado como posição de estoque.");
        }

        var existingStoredHus = await _db.HandlingUnits
            .AsNoTracking()
            .Where(h => h.CompanyId == companyId &&
                        h.CurrentLocationId.HasValue &&
                        distinctLocationIds.Contains(h.CurrentLocationId.Value) &&
                        h.Status == HuStatus.Stored &&
                        h.CurrentQuantity > 0)
            .Select(h => new
            {
                LocationId = h.CurrentLocationId!.Value,
                h.ProductId,
                h.Batch
            })
            .ToListAsync(ct);

        var productIds = candidates.Select(c => c.ProductId).Distinct().ToList();
        var packagings = await _db.ProductPackagings
            .AsNoTracking()
            .Where(p => productIds.Contains(p.ProductId))
            .ToListAsync(ct);

        var occupancyByLocation = existingStoredHus
            .GroupBy(h => h.LocationId)
            .ToDictionary(g => g.Key, g => g.Count());

        var productsInLocation = existingStoredHus
            .GroupBy(h => h.LocationId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.ProductId).ToHashSet());

        var batchesByProductInLocation = existingStoredHus
            .GroupBy(h => h.LocationId)
            .ToDictionary(
                g => g.Key,
                g => g
                    .GroupBy(x => x.ProductId)
                    .ToDictionary(
                        pg => pg.Key,
                        pg => pg.Select(x => (x.Batch ?? string.Empty).Trim().ToUpper())
                                .Where(b => !string.IsNullOrEmpty(b))
                                .ToHashSet()
                    )
            );

        foreach (var group in candidates.GroupBy(c => c.TargetLocationId))
        {
            var loc = locations[group.Key];
            var storageType = loc.StorageType;

            var allowedProducts = productsInLocation.TryGetValue(loc.Id, out var existingProds)
                ? new HashSet<Guid>(existingProds)
                : new HashSet<Guid>();

            var allowedBatchesByProd = batchesByProductInLocation.TryGetValue(loc.Id, out var existingBatches)
                ? existingBatches.ToDictionary(k => k.Key, v => new HashSet<string>(v.Value))
                : new Dictionary<Guid, HashSet<string>>();

            int currentCount = occupancyByLocation.GetValueOrDefault(loc.Id, 0);

            foreach (var item in group)
            {
                bool isQualityRestricted = item.QualityStatus != QualityStatus.Available;
                if (isQualityRestricted && storageType.Role != StorageRole.Quality)
                {
                    throw new InvalidOperationException(
                        $"A posição {loc.FullPath} não permite lotes com restrição de qualidade ({item.QualityStatus}). Utilize uma posição de Qualidade."
                    );
                }

                if (!isQualityRestricted && storageType.Role == StorageRole.Quality)
                {
                    throw new InvalidOperationException(
                        $"A posição {loc.FullPath} é exclusiva para Qualidade e não aceita lotes liberados."
                    );
                }

                if (!storageType.AllowMixedProducts)
                {
                    if (allowedProducts.Any(pId => pId != item.ProductId))
                    {
                        throw new InvalidOperationException(
                            $"A posição {loc.FullPath} ({storageType.Name}) não permite mistura de produtos diferentes."
                        );
                    }
                }
                allowedProducts.Add(item.ProductId);

                var normalizedBatch = (item.Batch ?? string.Empty).Trim().ToUpper();
                if (!storageType.AllowMixedBatches && !string.IsNullOrEmpty(normalizedBatch))
                {
                    if (!allowedBatchesByProd.TryGetValue(item.ProductId, out var batchSet))
                    {
                        batchSet = new HashSet<string>();
                        allowedBatchesByProd[item.ProductId] = batchSet;
                    }

                    if (batchSet.Any(b => !string.Equals(b, normalizedBatch, StringComparison.OrdinalIgnoreCase)))
                    {
                        throw new InvalidOperationException(
                            $"A posição {loc.FullPath} ({storageType.Name}) não permite mistura de lotes diferentes para o mesmo produto."
                        );
                    }

                    batchSet.Add(normalizedBatch);
                }

                var pack = packagings.FirstOrDefault(p =>
                    p.ProductId == item.ProductId && p.PackagingTypeId == item.PackagingTypeId);

                int maxCapacity = CalculateCapacityForItem(loc, pack);
                currentCount += item.VolumeCount;

                if (currentCount > maxCapacity)
                {
                    throw new InvalidOperationException(
                        $"Capacidade excedida na posição {loc.FullPath}: {currentCount} posição(ões) necessárias para limite de {maxCapacity}."
                    );
                }
            }
        }

        return locations;
    }

    private static int CalculateCapacityForItem(Location loc, ProductPackaging? pack)
    {
        if (loc.StorageType.CapacityStrategy != StorageCapacityStrategy.DynamicStacking)
            return loc.BaseCapacity;

        var clearance = loc.Zone?.Warehouse?.ClearanceHeight ?? 0m;
        decimal palletHeightMeters = 1.5m;
        if (pack != null && pack.HeightMm > 0)
        {
            palletHeightMeters = pack.HeightMm > 50 ? pack.HeightMm / 1000m : pack.HeightMm;
        }

        int clearanceStacking = clearance > 0
            ? (int)Math.Max(1, Math.Floor(clearance / palletHeightMeters))
            : 1;

        int packagingMaxStacking = pack?.MaxStacking > 0 ? pack.MaxStacking : clearanceStacking;
        int effectiveStacking = Math.Min(clearanceStacking, packagingMaxStacking);

        return loc.BaseCapacity * effectiveStacking;
    }
}