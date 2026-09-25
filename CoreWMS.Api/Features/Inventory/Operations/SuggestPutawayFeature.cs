using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
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

        // 1. Busca todas as HUs da Ordem que estão descarregadas na Doca (HuStatus.Received)
        var husInDock = await _db.HandlingUnits
            .AsNoTracking()
            .Include(h => h.Product)
            .Where(h => h.CompanyId == companyId &&
                        h.ReceiptDocumentId == request.OrderId &&
                        h.Status == HuStatus.Received)
            .OrderBy(h => h.Product.Sku)
            .ThenBy(h => h.Batch)
            .ToListAsync(ct);

        if (!husInDock.Any())
            return Results.Ok(new List<PutawaySuggestionDto>());

        // 2. Carrega as embalagens dos produtos para obter a altura (HeightMm) e o empilhamento máximo (MaxStacking)
        var productIds = husInDock.Select(h => h.ProductId).Distinct().ToList();
        var productPackagings = await _db.ProductPackagings
            .AsNoTracking()
            .Where(p => productIds.Contains(p.ProductId))
            .ToListAsync(ct);

        // 3. Carrega as posições ativas da topologia com hierarquia de pavilhão e papel (Armazenamento / Qualidade)
        var availableLocations = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Include(l => l.Zone)
                .ThenInclude(z => z.Warehouse)
            .Where(l => l.IsActive &&
                        (l.StorageType.Role == StorageRole.Storage || l.StorageType.Role == StorageRole.Quality))
            .OrderBy(l => l.FullPath)
            .ToListAsync(ct);

        // 4. Mapeia as HUs atualmente armazenadas no estoque para cálculo de ocupação e segregação de lotes
        var storedHus = await _db.HandlingUnits
            .AsNoTracking()
            .Where(h => h.CompanyId == companyId && h.CurrentLocationId.HasValue && h.Status == HuStatus.Stored)
            .Select(h => new { h.CurrentLocationId, h.ProductId, h.Batch })
            .ToListAsync(ct);

        var simulatedOccupancy = storedHus
            .GroupBy(h => h.CurrentLocationId!.Value)
            .ToDictionary(g => g.Key, g => g.Count());

        var locationContents = storedHus
            .GroupBy(h => h.CurrentLocationId!.Value)
            .ToDictionary(
                g => g.Key,
                g => g.Select(x => new ProductBatchPair(x.ProductId, x.Batch ?? "")).ToList()
            );

        var suggestions = new List<PutawaySuggestionDto>();

        foreach (var hu in husInDock)
        {
            var isQualityRestricted = hu.QualityStatus != QualityStatus.Available;
            var targetRole = isQualityRestricted ? StorageRole.Quality : StorageRole.Storage;

            // Busca a embalagem do produto atrelada a esta HU
            var pack = productPackagings.FirstOrDefault(p => p.ProductId == hu.ProductId && p.PackagingTypeId == hu.PackagingTypeId);

            // CONVERSÃO DE UNIDADE: Se a altura vier em mm (ex: 1650mm), converte para metros (1.65m)
            decimal palletHeightMeters = 1.5m;
            if (pack != null && pack.HeightMm > 0)
            {
                palletHeightMeters = pack.HeightMm > 50 ? pack.HeightMm / 1000m : pack.HeightMm;
            }

            // EMPILHAMENTO MÁXIMO OBTIDO DIRETO DA EMBALAGEM
            int packagingMaxStacking = pack?.MaxStacking > 0 ? pack.MaxStacking : 1;

            var candidateLocations = availableLocations
                .Where(l => l.StorageType.Role == targetRole)
                .ToList();

            Topology.Entities.Location? chosenLocation = null;
            string reason = "Posição com capacidade de empilhamento livre";

            // Regra 1: Consolidação na MESMA posição se já existir o mesmo SKU + MESMO Lote armazenado
            var existingSameBatchLocationId = storedHus
                .Where(h => h.ProductId == hu.ProductId &&
                            !string.IsNullOrWhiteSpace(hu.Batch) &&
                            string.Equals(h.Batch, hu.Batch, StringComparison.OrdinalIgnoreCase))
                .Select(h => h.CurrentLocationId!.Value)
                .FirstOrDefault();

            if (existingSameBatchLocationId != Guid.Empty)
            {
                var candidate = candidateLocations.FirstOrDefault(l => l.Id == existingSameBatchLocationId);
                if (candidate != null)
                {
                    int maxCap = CalculateEffectiveCapacity(candidate, palletHeightMeters, packagingMaxStacking);
                    simulatedOccupancy.TryGetValue(candidate.Id, out int currentCount);

                    if (currentCount < maxCap)
                    {
                        chosenLocation = candidate;
                        reason = $"Consolidação com mesmo SKU/Lote ({currentCount + 1}/{maxCap} pos.)";
                    }
                }
            }

            // Regra 2: Busca posição livre que NÃO TENHA conflito de LOTE DIFERENTE do mesmo SKU em boxes adjacentes
            if (chosenLocation == null)
            {
                foreach (var (loc, index) in candidateLocations.Select((l, idx) => (l, idx)))
                {
                    int maxCap = CalculateEffectiveCapacity(loc, palletHeightMeters, packagingMaxStacking);
                    simulatedOccupancy.TryGetValue(loc.Id, out int currentCount);

                    if (currentCount < maxCap)
                    {
                        bool isAdjacentConflict = HasAdjacentBatchConflict(index, candidateLocations, locationContents, hu.ProductId, hu.Batch);

                        if (!isAdjacentConflict)
                        {
                            chosenLocation = loc;
                            reason = isQualityRestricted
                                ? "Área de Qualidade/Retenção"
                                : $"Empilhamento em bloco ({currentCount + 1}/{maxCap} pos. - {loc.Zone.Warehouse.Name})";
                            break;
                        }
                    }
                }
            }

            // Regra 3 (Fallback): Posição disponível ignorando a regra de adjacência de lotes
            if (chosenLocation == null)
            {
                foreach (var loc in candidateLocations)
                {
                    int maxCap = CalculateEffectiveCapacity(loc, palletHeightMeters, packagingMaxStacking);
                    simulatedOccupancy.TryGetValue(loc.Id, out int currentCount);

                    if (currentCount < maxCap)
                    {
                        chosenLocation = loc;
                        reason = $"Empilhamento em bloco ({currentCount + 1}/{maxCap} pos. - {loc.Zone.Warehouse.Name})";
                        break;
                    }
                }
            }

            // Regra 4 (Fallback Extremo): Armazém 100% cheio
            if (chosenLocation == null && candidateLocations.Any())
            {
                chosenLocation = candidateLocations.First();
                reason = "Capacidade estourada - Posição com menor impacto";
            }

            if (chosenLocation != null)
            {
                // Atualiza a ocupação no simulador em memória
                simulatedOccupancy[chosenLocation.Id] = simulatedOccupancy.GetValueOrDefault(chosenLocation.Id, 0) + 1;

                if (!locationContents.ContainsKey(chosenLocation.Id))
                    locationContents[chosenLocation.Id] = new List<ProductBatchPair>();

                locationContents[chosenLocation.Id].Add(new ProductBatchPair(hu.ProductId, hu.Batch ?? ""));

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

    // Verifica se existe o MESMO produto com LOTE DIFERENTE no box imediatamente anterior ou posterior no mesmo corredor
    private static bool HasAdjacentBatchConflict(
        int currentIndex,
        List<Topology.Entities.Location> locations,
        Dictionary<Guid, List<ProductBatchPair>> locationContents,
        Guid productId,
        string? currentBatch)
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

    // CÁLCULO DE CAPACIDADE EFETIVA EMPILHADA: BaseCapacity × Min(CamadasPéDireito, MaxStackingEmbalagem)
    private static int CalculateEffectiveCapacity(Topology.Entities.Location loc, decimal palletHeightMeters, int packagingMaxStacking)
    {
        if (loc.StorageType.CapacityStrategy == StorageCapacityStrategy.DynamicStacking)
        {
            var clearance = loc.Zone?.Warehouse?.ClearanceHeight ?? 0m;
            var safeHeight = palletHeightMeters <= 0 ? 1.5m : palletHeightMeters;

            // Camadas permitidas pelo teto/pé-direito do prédio
            int clearanceStacking = clearance > 0 ? (int)Math.Max(1, Math.Floor(clearance / safeHeight)) : 1;

            // Trava de segurança: usa o menor valor entre a altura do prédio e o limite da embalagem
            int effectiveStacking = Math.Min(clearanceStacking, packagingMaxStacking > 0 ? packagingMaxStacking : clearanceStacking);

            return loc.BaseCapacity * effectiveStacking; // Ex: 12 posições chão × 3 camadas = 36 posições totais
        }

        return loc.BaseCapacity; // Porta-Paletes / Armazenamento Unitário
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