using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Features.Products;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Legacy;

public record ImportLegacyInventoryCommand(byte[] FileBytes) : IRequest<IResult>;

public class ImportLegacyInventoryHandler : IRequestHandler<ImportLegacyInventoryCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public ImportLegacyInventoryHandler(ApplicationDbContext db, ITenantProvider tenant, IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(ImportLegacyInventoryCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var content = Encoding.UTF8.GetString(request.FileBytes);
        var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length <= 1) return Results.BadRequest(new { Message = "Planilha vazia." });

        var customers = await _db.Customers
            .AsNoTracking()
            .Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Cnpj, c => c.Id, ct);

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

        var products = await _db.Products
            .AsNoTracking()
            .Where(p => p.CompanyId == companyId)
            .ToDictionaryAsync(p => p.Id, ct);

        var allProductPackagings = await _db.ProductPackagings
            .AsNoTracking()
            .OrderBy(p => p.CreatedAt)
            .ToListAsync(ct);

        var packagingsByProduct = allProductPackagings
            .GroupBy(p => p.ProductId)
            .ToDictionary(g => g.Key, g => g.ToList());

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
        var kardexMovements = new List<RecordKardexMovementItemDto>();
        var affectedOrders = new HashSet<InboundOrder>();
        var productsToSyncWeights = new Dictionary<Guid, ProductWeightSyncItemDto>();

        for (int i = 1; i < lines.Length; i++)
        {
            var cols = lines[i].Split(';');
            if (cols.Length < 18) continue;

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

            var pesoLiquidoTotal = cols.Length > 18 ? ParseBrDecimal(cols[18]) : 0m;
            var pesoBrutoTotal = cols.Length > 19 ? ParseBrDecimal(cols[19]) : 0m;
            var valorUnitarioCsv = cols.Length > 20 ? ParseBrDecimal(cols[20]) : 0m;

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

            var (order, orderItem) = FindOrderAndItem(openOrders, customerId, nfNumero, nfSerie, sku);
            if (order == null || orderItem == null)
            {
                errors.Add($"Linha {i + 1}: Item {sku} da NF {nfNumero} (Série {nfSerie}) não encontrado nas importações em aberto.");
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

            Guid selectedPackagingTypeId;
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
                if (assignedPackagingsByBatch.TryGetValue((productId, cleanLote), out var batchPackTypeId))
                {
                    selectedPackagingTypeId = batchPackTypeId;
                }
                else
                {
                    selectedPackagingTypeId = productPacks.First().PackagingTypeId;
                    assignedPackagingsByBatch[(productId, cleanLote)] = selectedPackagingTypeId;
                }
            }
            else
            {
                selectedPackagingTypeId = productPacks.First().PackagingTypeId;
            }

            // CÁLCULO E RESOLUÇÃO DOS PESOS UNITÁRIOS COM FALLBACK MULTICAMADAS
            decimal huUnitNet = (quantity > 0 && pesoLiquidoTotal > 0) ? Math.Round(pesoLiquidoTotal / quantity, 4) : 0m;
            decimal huUnitGross = (quantity > 0 && pesoBrutoTotal > 0) ? Math.Round(pesoBrutoTotal / quantity, 4) : 0m;

            // Se a planilha forneceu pesos válidos, armazena para sincronização no domínio Products
            if (huUnitNet > 0 || huUnitGross > 0)
            {
                decimal validNet = huUnitNet > 0 ? huUnitNet : huUnitGross;
                decimal validGross = huUnitGross > 0 ? huUnitGross : huUnitNet;
                productsToSyncWeights[productId] = new ProductWeightSyncItemDto(productId, validNet, validGross);
            }

            if (huUnitNet <= 0 && orderItem.UnitNetWeight > 0) huUnitNet = orderItem.UnitNetWeight;
            if (huUnitGross <= 0 && orderItem.UnitGrossWeight > 0) huUnitGross = orderItem.UnitGrossWeight;

            if (products.TryGetValue(productId, out var prodObj))
            {
                if (huUnitNet <= 0 && prodObj.NetWeight > 0) huUnitNet = prodObj.NetWeight;
                if (huUnitGross <= 0 && prodObj.GrossWeight > 0) huUnitGross = prodObj.GrossWeight;
            }

            var selectedPack = productPacks.FirstOrDefault(p => p.PackagingTypeId == selectedPackagingTypeId);
            if (selectedPack != null && selectedPack.ConversionFactor > 0)
            {
                if (huUnitGross <= 0 && selectedPack.GrossWeight > 0)
                    huUnitGross = Math.Round(selectedPack.GrossWeight / selectedPack.ConversionFactor, 4);

                if (huUnitNet <= 0 && selectedPack.NetWeight > 0)
                    huUnitNet = Math.Round(selectedPack.NetWeight / selectedPack.ConversionFactor, 4);
            }

            if (huUnitGross <= 0 && huUnitNet > 0) huUnitGross = huUnitNet;
            if (huUnitNet <= 0 && huUnitGross > 0) huUnitNet = huUnitGross;

            if (orderItem.UnitNetWeight <= 0 && huUnitNet > 0)
            {
                orderItem.SetUnitWeights(huUnitNet, huUnitGross);
            }

            var finalUnitValue = orderItem.ExpectedUnitValue > 0 ? orderItem.ExpectedUnitValue : valorUnitarioCsv;

            var hu = new HandlingUnit(
                lpn,
                companyId,
                customerId,
                productId,
                selectedPackagingTypeId,
                orderItem.InboundOrderId,
                cleanLote,
                null,
                null,
                null,
                quantity,
                finalUnitValue,
                huUnitNet,
                huUnitGross
            );

            hu.ReceiveAtDock(locationObj.Id);
            if (qualityStatus != QualityStatus.Available) hu.ChangeQuality(qualityStatus);

            var targetRole = locationObj.StorageType?.Role ?? StorageRole.Storage;

            if (targetRole != StorageRole.Dock)
            {
                hu.MoveTo(locationObj.Id);
            }

            husToInsert.Add(hu);
            existingHus.Add(lpn);
            insertedHus++;

            affectedOrders.Add(order);

            var balance = balances.FirstOrDefault(b => b.ProductId == productId && b.CustomerId == customerId);
            if (balance == null)
            {
                balance = new InventoryBalance(companyId, customerId, productId);
                balances.Add(balance);
                _db.InventoryBalances.Add(balance);
            }

            balance.ReceiveToDock(quantity);

            if (targetRole != StorageRole.Dock)
            {
                balance.AllocateFromDock(quantity, targetRole, qualityStatus);
            }

            kardexMovements.Add(new RecordKardexMovementItemDto(
                CustomerId: customerId,
                ProductId: productId,
                HandlingUnitId: hu.Id,
                LocationId: locationObj.Id,
                Type: TransactionType.Inbound_Receipt,
                QuantityChange: quantity,
                BalanceAfter: quantity,
                SourceDocumentId: orderItem.InboundOrderId,
                SourceDocumentNumber: $"MIGRAÇÃO NF {nfNumero}",
                CompanyId: companyId
            ));

            orderItem.AddReceivedQuantity(quantity);
        }

        if (husToInsert.Any())
        {
            _db.HandlingUnits.AddRange(husToInsert);

            // FECHAMENTO COMPULSÓRIO DAS ORDENS & LIMPEZA DE EXPECTATIVAS RESIDUAIS
            foreach (var order in affectedOrders)
            {
                foreach (var item in order.Items)
                {
                    if (item.ProductId.HasValue && order.CustomerId.HasValue)
                    {
                        decimal remainingExpected = Math.Max(0m, item.ExpectedQuantity - item.ReceivedQuantity);

                        if (remainingExpected > 0)
                        {
                            var bal = balances.FirstOrDefault(b => b.ProductId == item.ProductId.Value && b.CustomerId == order.CustomerId.Value);
                            bal?.RemoveExpected(remainingExpected);
                        }
                    }

                    if (item.Status != InboundOrderItemStatus.Completed)
                    {
                        item.UpdateStatus(InboundOrderItemStatus.Completed);
                    }
                }

                order.UpdateStatus(InboundOrderStatus.Completed);
            }

            await _db.SaveChangesAsync(ct);

            // 1. Gravação desacoplada e em lote no Kardex
            if (kardexMovements.Any())
            {
                await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
            }

            // 2. DELEGAÇÃO VIA MEDIATR: Atualiza pesos do produto e recalcula embalagens no domínio Products
            if (productsToSyncWeights.Any())
            {
                await _mediator.Send(new SyncProductWeightsCommand(productsToSyncWeights.Values.ToList()), ct);
            }
        }

        return Results.Ok(new
        {
            Message = $"Migração concluída com sucesso. {affectedOrders.Count} ordem(ns) finalizada(s), saldos esperados conciliados e {productsToSyncWeights.Count} produto(s) com pesos e embalagens sincronizados.",
            HusImported = insertedHus,
            OrdersCompleted = affectedOrders.Count,
            ProductsUpdated = productsToSyncWeights.Count,
            Errors = errors.Take(50)
        });
    }

    private (InboundOrder? Order, InboundOrderItem? Item) FindOrderAndItem(
        List<InboundOrder> orders, Guid customerId, string nfNumero, string nfSerie, string sku)
    {
        foreach (var order in orders.Where(o => o.CustomerId == customerId))
        {
            if (order.AccessKey.Length != 44) continue;
            var serieKey = int.Parse(order.AccessKey.Substring(22, 3)).ToString();
            var nfKey = int.Parse(order.AccessKey.Substring(25, 9)).ToString();

            if (serieKey == nfSerie && nfKey == nfNumero)
            {
                var item = order.Items.FirstOrDefault(i => i.RawSkuCode.ToUpper() == sku.ToUpper());
                if (item != null) return (order, item);
            }
        }
        return (null, null);
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