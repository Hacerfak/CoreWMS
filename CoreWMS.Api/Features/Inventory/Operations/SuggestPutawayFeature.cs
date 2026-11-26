using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record PutawaySuggestionDto(
    Guid HandlingUnitId,
    string Lpn,
    Guid ProductId,
    string ProductSku,
    string ProductDescription,
    string Unit,
    string? Batch,
    decimal Quantity,
    string QualityStatus,
    Guid SuggestedLocationId,
    string SuggestedLocationFullPath,
    string SuggestionReason
);

public record SuggestPutawayQuery(Guid OrderId) : IRequest<IResult>;

public class SuggestPutawayHandler : IRequestHandler<SuggestPutawayQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public SuggestPutawayHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(SuggestPutawayQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var husQuery = _db.HandlingUnits
            .AsNoTracking()
            .Include(h => h.Product)
            .Where(h => h.CompanyId == companyId &&
                        h.ReceiptDocumentId == request.OrderId &&
                        h.Status == HuStatus.Received);

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            husQuery = husQuery.Where(h => allowedIds.Contains(h.CustomerId));
        }

        var husInDock = await husQuery
            .OrderBy(h => h.Product.Sku)
            .ThenBy(h => h.Batch)
            .ToListAsync(ct);

        if (!husInDock.Any())
            return Results.Ok(new List<PutawaySuggestionDto>());

        var productIds = husInDock.Select(h => h.ProductId).Distinct().ToList();
        var productPackagings = await _db.ProductPackagings
            .AsNoTracking()
            .Where(p => productIds.Contains(p.ProductId))
            .ToListAsync(ct);

        var availableLocations = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Include(l => l.Zone)
                .ThenInclude(z => z.Warehouse)
            .Where(l => l.IsActive &&
                        (l.StorageType.Role == StorageRole.Storage || l.StorageType.Role == StorageRole.Quality))
            .OrderBy(l => l.FullPath)
            .ToListAsync(ct);

        var storedHus = await _db.HandlingUnits
            .AsNoTracking()
            .Where(h => h.CompanyId == companyId &&
                        h.CurrentLocationId.HasValue &&
                        h.Status == HuStatus.Stored &&
                        h.CurrentQuantity > 0)
            .Select(h => new { h.CurrentLocationId, h.ProductId, h.Batch })
            .ToListAsync(ct);

        var simulatedOccupancy = storedHus
            .GroupBy(h => h.CurrentLocationId!.Value)
            .ToDictionary(g => g.Key, g => g.Count());

        var locationContents = storedHus
            .GroupBy(h => h.CurrentLocationId!.Value)
            .ToDictionary(
                g => g.Key,
                g => g.Select(x => new ProductBatchPair(x.ProductId, NormalizeBatch(x.Batch))).ToList()
            );

        var suggestions = new List<PutawaySuggestionDto>();

        foreach (var hu in husInDock)
        {
            var isQualityRestricted = hu.QualityStatus != QualityStatus.Available;
            var targetRole = isQualityRestricted ? StorageRole.Quality : StorageRole.Storage;
            var normalizedBatch = NormalizeBatch(hu.Batch);

            var pack = productPackagings.FirstOrDefault(p =>
                p.ProductId == hu.ProductId && p.PackagingTypeId == hu.PackagingTypeId);

            decimal palletHeightMeters = 1.5m;
            if (pack != null && pack.HeightMm > 0)
            {
                palletHeightMeters = pack.HeightMm > 50 ? pack.HeightMm / 1000m : pack.HeightMm;
            }

            int packagingMaxStacking = pack?.MaxStacking > 0 ? pack.MaxStacking : 1;

            var candidateLocations = availableLocations
                .Where(l => l.StorageType.Role == targetRole)
                .ToList();

            Topology.Entities.Location? chosenLocation = null;
            string reason = "Posição com capacidade de empilhamento livre";

            // Regra 1: Consolidação se já houver o mesmo SKU (e mesmo lote, quando informado) no endereço compatível
            var consolidationCandidates = candidateLocations.Where(loc =>
            {
                if (!locationContents.TryGetValue(loc.Id, out var contents) || contents.Count == 0)
                    return false;

                bool hasSameProduct = contents.Any(c => c.ProductId == hu.ProductId);
                if (!hasSameProduct)
                    return false;

                if (string.IsNullOrWhiteSpace(normalizedBatch))
                    return true;

                return contents.Any(c => c.ProductId == hu.ProductId &&
                                         string.Equals(c.Batch, normalizedBatch, StringComparison.OrdinalIgnoreCase));
            });

            foreach (var candidate in consolidationCandidates)
            {
                if (!CanFitAndMixInLocation(candidate, pack, palletHeightMeters, packagingMaxStacking, simulatedOccupancy, locationContents, hu.ProductId, normalizedBatch))
                    continue;

                simulatedOccupancy.TryGetValue(candidate.Id, out int currentCount);
                chosenLocation = candidate;
                reason = $"Consolidação com mesmo SKU/Lote ({currentCount + 1}/{CalculateEffectiveCapacity(candidate, palletHeightMeters, packagingMaxStacking)} pos.)";
                break;
            }

            // Regra 2: Posição compatível sem conflito de lote em boxes adjacentes
            if (chosenLocation == null)
            {
                foreach (var (loc, index) in candidateLocations.Select((l, idx) => (l, idx)))
                {
                    if (!CanFitAndMixInLocation(loc, pack, palletHeightMeters, packagingMaxStacking, simulatedOccupancy, locationContents, hu.ProductId, normalizedBatch))
                        continue;

                    bool isAdjacentConflict = HasAdjacentBatchConflict(index, candidateLocations, locationContents, hu.ProductId, normalizedBatch);
                    if (!isAdjacentConflict)
                    {
                        simulatedOccupancy.TryGetValue(loc.Id, out int currentCount);
                        int maxCap = CalculateEffectiveCapacity(loc, palletHeightMeters, packagingMaxStacking);
                        chosenLocation = loc;
                        reason = isQualityRestricted
                            ? "Área de Qualidade/Retenção"
                            : $"Empilhamento em bloco ({currentCount + 1}/{maxCap} pos. - {loc.Zone.Warehouse.Name})";
                        break;
                    }
                }
            }

            // Regra 3: Posição compatível ignorando adjacência de lotes
            if (chosenLocation == null)
            {
                foreach (var loc in candidateLocations)
                {
                    if (!CanFitAndMixInLocation(loc, pack, palletHeightMeters, packagingMaxStacking, simulatedOccupancy, locationContents, hu.ProductId, normalizedBatch))
                        continue;

                    simulatedOccupancy.TryGetValue(loc.Id, out int currentCount);
                    int maxCap = CalculateEffectiveCapacity(loc, palletHeightMeters, packagingMaxStacking);
                    chosenLocation = loc;
                    reason = $"Empilhamento em bloco ({currentCount + 1}/{maxCap} pos. - {loc.Zone.Warehouse.Name})";
                    break;
                }
            }

            // Regra 4 (Fallback): Primeira posição do papel esperado caso todas estejam no limite
            if (chosenLocation == null && candidateLocations.Any())
            {
                chosenLocation = candidateLocations.First();
                reason = "Capacidade estourada - Posição com menor impacto";
            }

            if (chosenLocation != null)
            {
                simulatedOccupancy[chosenLocation.Id] = simulatedOccupancy.GetValueOrDefault(chosenLocation.Id, 0) + 1;

                if (!locationContents.ContainsKey(chosenLocation.Id))
                    locationContents[chosenLocation.Id] = new List<ProductBatchPair>();

                locationContents[chosenLocation.Id].Add(new ProductBatchPair(hu.ProductId, normalizedBatch));

                suggestions.Add(new PutawaySuggestionDto(
                    hu.Id,
                    hu.Lpn,
                    hu.ProductId,
                    hu.Product.Sku,
                    hu.Product.Description,
                    hu.Product.BaseUnit,
                    hu.Batch,
                    hu.CurrentQuantity,
                    hu.QualityStatus.ToString(),
                    chosenLocation.Id,
                    chosenLocation.FullPath,
                    reason
                ));
            }
        }

        return Results.Ok(suggestions);
    }

    private static bool CanFitAndMixInLocation(
        Topology.Entities.Location loc,
        ProductPackaging? pack,
        decimal palletHeightMeters,
        int packagingMaxStacking,
        Dictionary<Guid, int> simulatedOccupancy,
        Dictionary<Guid, List<ProductBatchPair>> locationContents,
        Guid productId,
        string normalizedBatch)
    {
        int maxCap = CalculateEffectiveCapacity(loc, palletHeightMeters, packagingMaxStacking);
        int currentCount = simulatedOccupancy.GetValueOrDefault(loc.Id, 0);
        if (currentCount >= maxCap)
            return false;

        if (!locationContents.TryGetValue(loc.Id, out var contents) || contents.Count == 0)
            return true;

        var storageType = loc.StorageType;

        if (!storageType.AllowMixedProducts && contents.Any(c => c.ProductId != productId))
            return false;

        if (!storageType.AllowMixedBatches && !string.IsNullOrWhiteSpace(normalizedBatch))
        {
            bool hasDifferentBatch = contents.Any(c =>
                c.ProductId == productId &&
                !string.IsNullOrWhiteSpace(c.Batch) &&
                !string.Equals(c.Batch, normalizedBatch, StringComparison.OrdinalIgnoreCase));

            if (hasDifferentBatch)
                return false;
        }

        return true;
    }

    private static string NormalizeBatch(string? batch) => (batch ?? string.Empty).Trim().ToUpper();

    private static bool HasAdjacentBatchConflict(
        int currentIndex,
        List<Topology.Entities.Location> locations,
        Dictionary<Guid, List<ProductBatchPair>> locationContents,
        Guid productId,
        string currentBatch)
    {
        if (string.IsNullOrWhiteSpace(currentBatch)) return false;

        var currentLoc = locations[currentIndex];
        int[] neighborIndices = { currentIndex - 1, currentIndex + 1 };

        foreach (var idx in neighborIndices)
        {
            if (idx >= 0 && idx < locations.Count)
            {
                var neighborLoc = locations[idx];
                if (neighborLoc.ZoneId == currentLoc.ZoneId)
                {
                    if (locationContents.TryGetValue(neighborLoc.Id, out var contents))
                    {
                        bool hasDifferentBatch = contents.Any(c =>
                            c.ProductId == productId &&
                            !string.IsNullOrWhiteSpace(c.Batch) &&
                            !string.Equals(c.Batch, currentBatch, StringComparison.OrdinalIgnoreCase)
                        );

                        if (hasDifferentBatch) return true;
                    }
                }
            }
        }

        return false;
    }

    private static int CalculateEffectiveCapacity(Topology.Entities.Location loc, decimal palletHeightMeters, int packagingMaxStacking)
    {
        if (loc.StorageType.CapacityStrategy == StorageCapacityStrategy.DynamicStacking)
        {
            var clearance = loc.Zone?.Warehouse?.ClearanceHeight ?? 0m;
            var safeHeight = palletHeightMeters <= 0 ? 1.5m : palletHeightMeters;

            int clearanceStacking = clearance > 0 ? (int)Math.Max(1, Math.Floor(clearance / safeHeight)) : 1;

            int effectiveStacking = Math.Min(clearanceStacking, packagingMaxStacking > 0 ? packagingMaxStacking : clearanceStacking);

            return loc.BaseCapacity * effectiveStacking;
        }

        return loc.BaseCapacity;
    }

    private record ProductBatchPair(Guid ProductId, string Batch);
}

public static class SuggestPutawayEndpoints
{
    public static void MapSuggestPutawayEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inventory/putaway/suggestions/{orderId:guid}", async (Guid orderId, IMediator mediator) =>
            await mediator.Send(new SuggestPutawayQuery(orderId)))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}