using System.Globalization;
using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Legacy;

public record ImportLegacyInventoryCommand(byte[] FileBytes) : IRequest<IResult>;

public class ImportLegacyInventoryHandler : IRequestHandler<ImportLegacyInventoryCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public ImportLegacyInventoryHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(ImportLegacyInventoryCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var content = Encoding.UTF8.GetString(request.FileBytes);
        var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length <= 1) return Results.BadRequest(new { Message = "Planilha vazia." });

        var customers = await _db.Customers.Where(c => c.CompanyId == companyId).ToDictionaryAsync(c => c.Cnpj, c => c.Id, ct);

        // Carrega as localizações incluindo a relação StorageType para validar o StorageRole (Dock, Storage, Quality)
        var locations = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Where(l => l.Zone.Warehouse.Code != "")
            .ToDictionaryAsync(l => l.FullPath.ToUpper(), l => l, ct);

        var openOrders = await _db.InboundOrders
            .Include(o => o.Items)
            .Where(o => o.CompanyId == companyId && o.Status != InboundOrderStatus.Canceled && o.Status != InboundOrderStatus.Completed)
            .ToListAsync(ct);

        var balances = await _db.InventoryBalances.Where(b => b.CompanyId == companyId).ToListAsync(ct);
        var existingHus = await _db.HandlingUnits.Where(h => h.CompanyId == companyId).Select(h => h.Lpn).ToHashSetAsync(ct);

        // PRE-CARREGAMENTO DAS EMBALAGENS DOS PRODUTOS
        var allProductPackagings = await _db.ProductPackagings
            .AsNoTracking()
            .OrderBy(p => p.CreatedAt)
            .ToListAsync(ct);

        var packagingsByProduct = allProductPackagings
            .GroupBy(p => p.ProductId)
            .ToDictionary(g => g.Key, g => g.ToList());

        // MAPA DE MEMÓRIA PARA MANTER A MESMA EMBALAGEM EM HUS DO MESMO (PRODUCT_ID, LOTE)
        var existingHuBatches = await _db.HandlingUnits
            .AsNoTracking()
            .Where(h => h.CompanyId == companyId && h.Batch != null && h.Batch != "")
            .Select(h => new { h.ProductId, Batch = h.Batch!.ToUpper(), h.PackagingTypeId })
            .Distinct()
            .ToListAsync(ct);

        var assignedPackagingsByBatch = existingHuBatches
            .GroupBy(h => (h.ProductId, h.Batch))
            .ToDictionary(g => g.Key, g => g.First().PackagingTypeId);

        int insertedHus = 0;
        var errors = new List<string>();
        var husToInsert = new List<HandlingUnit>();

        for (int i = 1; i < lines.Length; i++)
        {
            var cols = lines[i].Split(';');
            if (cols.Length < 21) continue;

            var lpn = cols[0].Trim().ToUpper().Replace("\"", "");
            var sku = cols[1].Trim().ToUpper().Replace("\"", "");
            var loteRaw = cols[5].Trim().Replace("\"", "");
            var cleanLote = string.IsNullOrWhiteSpace(loteRaw) ? null : loteRaw.ToUpper();
            var quantity = ParseBrDecimal(cols[7]);
            var locationPath = cols[10].Trim().ToUpper().Replace("\"", "");
            var nfNumero = cols[11].Trim().Replace("\"", "");
            var nfSerie = cols[12].Trim().Replace("\"", "");
            var depositanteCnpj = cols[14].Trim().Replace("\"", "");
            var isBlocked = !string.IsNullOrWhiteSpace(cols[16].Replace("\"", ""));
            var qualityStatus = isBlocked ? QualityStatus.Quarantine : QualityStatus.Available;

            if (existingHus.Contains(lpn)) continue;

            if (!customers.TryGetValue(depositanteCnpj, out var customerId))
            {
                errors.Add($"Linha {i + 1}: Depositante CNPJ {depositanteCnpj} não encontrado no sistema.");
                continue;
            }

            if (!locations.TryGetValue(locationPath, out var locationObj))
            {
                errors.Add($"Linha {i + 1}: Endereço {locationPath} não cadastrado na Topologia.");
                continue;
            }

            var orderItem = FindOrderItem(openOrders, customerId, nfNumero, nfSerie, sku);
            if (orderItem == null)
            {
                errors.Add($"Linha {i + 1}: Item {sku} da NF {nfNumero} (Série {nfSerie}) não encontrado nas importações.");
                continue;
            }

            if (!orderItem.ProductId.HasValue)
            {
                errors.Add($"Linha {i + 1}: O produto {sku} da NF {nfNumero} precisa ser aprovado na tela de Inbound.");
                continue;
            }

            var productId = orderItem.ProductId.Value;

            if (!packagingsByProduct.TryGetValue(productId, out var productPacks) || !productPacks.Any())
            {
                errors.Add($"Linha {i + 1}: O produto {sku} não possui nenhuma embalagem cadastrada.");
                continue;
            }

            // REGRA DE SELEÇÃO INTELIGENTE DE EMBALAGEM
            Guid selectedPackagingTypeId;

            // 1. Tenta encontrar embalagem que corresponda exatamente à quantidade da HU
            var exactMatchPack = productPacks.FirstOrDefault(p => p.ConversionFactor == quantity);

            if (exactMatchPack != null)
            {
                selectedPackagingTypeId = exactMatchPack.PackagingTypeId;

                if (cleanLote != null)
                {
                    assignedPackagingsByBatch[(productId, cleanLote)] = selectedPackagingTypeId;
                }
            }
            else if (cleanLote != null)
            {
                // 2. Quantidade fracionada com Lote: reutiliza a embalagem já vinculada a este produto e lote
                if (assignedPackagingsByBatch.TryGetValue((productId, cleanLote), out var batchPackTypeId))
                {
                    selectedPackagingTypeId = batchPackTypeId;
                }
                else
                {
                    // Se é a primeira HU deste lote e é fracionada, usa a primeira embalagem cadastrada
                    selectedPackagingTypeId = productPacks.First().PackagingTypeId;
                    assignedPackagingsByBatch[(productId, cleanLote)] = selectedPackagingTypeId;
                }
            }
            else
            {
                // 3. Sem lote e sem correspondência exata de quantidade -> Usa a primeira embalagem do produto
                selectedPackagingTypeId = productPacks.First().PackagingTypeId;
            }

            var hu = new HandlingUnit(
                lpn, companyId, customerId, productId, selectedPackagingTypeId,
                orderItem.InboundOrderId, cleanLote, null, null, null,
                quantity, orderItem.ExpectedUnitValue);

            // Registra a HU na Doca
            hu.ReceiveAtDock(locationObj.Id);
            if (qualityStatus != QualityStatus.Available) hu.ChangeQuality(qualityStatus);

            var targetRole = locationObj.StorageType?.Role ?? StorageRole.Storage;

            // Se a posição for de Armazenamento ou Qualidade, transita o status da HU para Stored
            if (targetRole != StorageRole.Dock)
            {
                hu.MoveTo(locationObj.Id);
            }

            husToInsert.Add(hu);
            existingHus.Add(lpn);
            insertedHus++;

            var balance = balances.FirstOrDefault(b => b.ProductId == productId && b.CustomerId == customerId);
            if (balance == null)
            {
                balance = new InventoryBalance(companyId, customerId, productId);
                balances.Add(balance);
                _db.InventoryBalances.Add(balance);
            }

            // 1. Recebe na Doca
            balance.ReceiveToDock(quantity);

            // 2. Se for posição interna, aloca saindo da Doca
            if (targetRole != StorageRole.Dock)
            {
                balance.AllocateFromDock(quantity, targetRole, qualityStatus);
            }

            await _kardex.WriteAsync(new InventoryTransaction(
                companyId, customerId, productId, hu.Id, locationObj.Id,
                TransactionType.Inbound_Receipt, quantity, quantity,
                orderItem.InboundOrderId, $"MIGRAÇÃO NF {nfNumero}"), ct);

            orderItem.AddReceivedQuantity(quantity);
        }

        if (husToInsert.Any())
        {
            _db.HandlingUnits.AddRange(husToInsert);
            foreach (var order in openOrders)
            {
                if (order.Items.All(i => i.Status == InboundOrderItemStatus.Completed))
                {
                    order.UpdateStatus(InboundOrderStatus.Completed);
                }
            }
            await _db.SaveChangesAsync(ct);
        }

        return Results.Ok(new
        {
            Message = "Migração de inventário legada concluída com sucesso.",
            HusImported = insertedHus,
            Errors = errors.Take(50)
        });
    }

    private InboundOrderItem? FindOrderItem(List<InboundOrder> orders, Guid customerId, string nfNumero, string nfSerie, string sku)
    {
        foreach (var order in orders.Where(o => o.CustomerId == customerId))
        {
            if (order.AccessKey.Length != 44) continue;
            var serieKey = int.Parse(order.AccessKey.Substring(22, 3)).ToString();
            var nfKey = int.Parse(order.AccessKey.Substring(25, 9)).ToString();
            if (serieKey == nfSerie && nfKey == nfNumero)
            {
                var item = order.Items.FirstOrDefault(i => i.RawSkuCode.ToUpper() == sku.ToUpper() && i.Status != InboundOrderItemStatus.Completed);
                if (item != null) return item;
            }
        }
        return null;
    }

    private static decimal ParseBrDecimal(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return 0;
        var cleanValue = value.Replace("\"", "").Trim();
        return decimal.TryParse(cleanValue, NumberStyles.Number, new CultureInfo("pt-BR"), out var result) ? result : 0;
    }
}

public static class ImportLegacyInventoryEndpoints
{
    public static void MapImportLegacyInventoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/legacy-import", async (Microsoft.AspNetCore.Http.IFormFile file, IMediator mediator) =>
        {
            if (file == null || file.Length == 0) return Results.BadRequest(new { Message = "Arquivo obrigatório." });
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            return await mediator.Send(new ImportLegacyInventoryCommand(ms.ToArray()));
        })
        .WithTags("Inbound")
        .RequireAuthorization()
        .RequirePermission(Permissions.Inbound.Manage)
        .DisableAntiforgery();
    }
}