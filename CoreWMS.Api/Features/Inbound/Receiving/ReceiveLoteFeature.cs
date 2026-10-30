using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Operations;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Features.Quality.Entities;
using CoreWMS.Api.Infrastructure.Caching;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Storage;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Receiving;

public record ReceiveLoteCommand(Guid OrderItemId, Guid? BillingServiceId, List<ReceiveVolumeDto> Volumes) : IRequest<IResult>;

public class ReceiveLoteCommandValidator : AbstractValidator<ReceiveLoteCommand>
{
    public ReceiveLoteCommandValidator()
    {
        RuleFor(x => x.OrderItemId).NotEmpty();
        RuleFor(x => x.Volumes).NotEmpty();
        RuleForEach(x => x.Volumes).ChildRules(v =>
        {
            v.RuleFor(x => x.PackagingTypeId).NotEmpty();
            v.RuleFor(x => x.VolumeCount).GreaterThan(0);
            v.RuleFor(x => x.QuantityPerVolume).GreaterThan(0);
            v.RuleFor(x => x.TargetLocationId).NotEmpty();
            v.RuleFor(x => x.QualityStatus).IsInEnum();
        });
    }
}

public class ReceiveLoteHandler : IRequestHandler<ReceiveLoteCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMasterDataCacheService _masterDataCache;
    private readonly IHttpContextAccessor _http;
    private readonly ILocalImageStorageService _imageStorage;
    private readonly IMediator _mediator;

    public ReceiveLoteHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IMasterDataCacheService masterDataCache,
        IHttpContextAccessor http,
        ILocalImageStorageService imageStorage,
        IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _masterDataCache = masterDataCache;
        _http = http;
        _imageStorage = imageStorage;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(ReceiveLoteCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var userId = Guid.Parse(_http.HttpContext!.User.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value);

        var orderItem = await _db.InboundOrderItems
            .Include(i => i.InboundOrder)
            .Include(i => i.Product)
                .ThenInclude(p => p!.Packagings)
            .FirstOrDefaultAsync(i => i.Id == request.OrderItemId && i.InboundOrder.CompanyId == companyId, ct);

        if (orderItem == null || !orderItem.ProductId.HasValue)
            return Results.BadRequest(new { Message = "Item inválido ou pendente de revisão." });

        if (orderItem.LockedByUserId.HasValue && orderItem.LockedByUserId != userId)
            return Results.BadRequest(new { Message = "Este item está sendo recebido por outro operador." });

        var rules = await _masterDataCache.GetProductRulesAsync(companyId, orderItem.ProductId.Value, ct);
        if (rules == null)
            return Results.BadRequest(new { Message = "Regras do produto não encontradas no Master Data." });

        decimal baseUnitNet = orderItem.UnitNetWeight;
        decimal baseUnitGross = orderItem.UnitGrossWeight;

        if (baseUnitNet <= 0 && orderItem.Product != null)
            baseUnitNet = orderItem.Product.NetWeight;
        if (baseUnitGross <= 0 && orderItem.Product != null)
            baseUnitGross = orderItem.Product.GrossWeight > 0 ? orderItem.Product.GrossWeight : orderItem.Product.NetWeight;
        if (baseUnitGross <= 0 && baseUnitNet > 0)
            baseUnitGross = baseUnitNet;

        if (orderItem.UnitNetWeight <= 0 && baseUnitNet > 0)
            orderItem.SetUnitWeights(baseUnitNet, baseUnitGross);

        decimal totalToReceive = 0;
        var husToInsert = new List<HandlingUnit>();
        var kardexMovements = new List<RecordKardexMovementItemDto>();
        var balance = await GetOrCreateBalanceAsync(companyId, orderItem.InboundOrder.CustomerId!.Value, orderItem.ProductId.Value, ct);

        foreach (var vol in request.Volumes)
        {
            string? effectiveBatch = null;
            if (rules.TracksBatch)
            {
                effectiveBatch = !string.IsNullOrWhiteSpace(vol.Batch)
                    ? vol.Batch.Trim().ToUpper()
                    : (!string.IsNullOrWhiteSpace(orderItem.ExpectedBatch) ? orderItem.ExpectedBatch.Trim().ToUpper() : null);
            }

            DateTime? effectiveMfgDate = null;
            if (rules.TracksManufacture)
            {
                var rawMfg = vol.ManufactureDate ?? orderItem.ExpectedManufactureDate;
                if (rawMfg.HasValue)
                {
                    effectiveMfgDate = DateTime.SpecifyKind(rawMfg.Value.Date, DateTimeKind.Utc);
                }
            }

            DateTime? effectiveExpDate = null;
            if (rules.TracksExpiration)
            {
                var rawExp = vol.ExpirationDate ?? orderItem.ExpectedExpirationDate;
                if (rawExp.HasValue)
                {
                    effectiveExpDate = DateTime.SpecifyKind(rawExp.Value.Date, DateTimeKind.Utc);
                }
            }

            if (rules.StrictBatch && string.IsNullOrWhiteSpace(effectiveBatch))
                throw new InvalidOperationException($"O produto {rules.Sku} exige lote.");

            if (rules.StrictManufacture && !effectiveMfgDate.HasValue)
                throw new InvalidOperationException($"O produto {rules.Sku} exige data de fabricação.");

            if (rules.StrictExpiration && !effectiveExpDate.HasValue)
                throw new InvalidOperationException($"O produto {rules.Sku} exige data de validade.");

            if (effectiveMfgDate.HasValue && effectiveExpDate.HasValue && effectiveExpDate.Value < effectiveMfgDate.Value)
                throw new InvalidOperationException($"A data de validade ({effectiveExpDate:dd/MM/yyyy}) não pode ser anterior à data de fabricação ({effectiveMfgDate:dd/MM/yyyy}).");

            if (rules.TracksBatch &&
                !string.IsNullOrWhiteSpace(orderItem.ExpectedBatch) &&
                !string.IsNullOrWhiteSpace(effectiveBatch) &&
                effectiveBatch != orderItem.ExpectedBatch &&
                vol.QualityStatus == QualityStatus.Available)
            {
                throw new InvalidOperationException($"Divergência Fiscal: Lote ({effectiveBatch}) difere do lote informado na nota fiscal ({orderItem.ExpectedBatch}).");
            }

            var packaging = orderItem.Product?.Packagings?.FirstOrDefault(p => p.PackagingTypeId == vol.PackagingTypeId);
            decimal huUnitNet = baseUnitNet;
            decimal huUnitGross = baseUnitGross;

            if (packaging != null && packaging.GrossWeight > 0 && packaging.ConversionFactor > 0)
            {
                huUnitGross = Math.Round(packaging.GrossWeight / packaging.ConversionFactor, 4);
                if (packaging.NetWeight > 0)
                    huUnitNet = Math.Round(packaging.NetWeight / packaging.ConversionFactor, 4);
            }

            var processedImages = new List<(string FileName, string FilePath, long FileSize)>();
            if (vol.QualityStatus != QualityStatus.Available && vol.QualityImages != null && vol.QualityImages.Any())
            {
                foreach (var img in vol.QualityImages)
                {
                    if (!string.IsNullOrWhiteSpace(img.Base64Data))
                    {
                        var (filePath, size) = await _imageStorage.CompressAndSaveImageAsync(img.FileName, img.Base64Data, ct);
                        processedImages.Add((img.FileName, filePath, size));
                    }
                }
            }

            for (int i = 0; i < vol.VolumeCount; i++)
            {
                var lpn = GenerateShortLpn();

                var hu = new HandlingUnit(
                    lpn,
                    companyId,
                    orderItem.InboundOrder.CustomerId!.Value,
                    orderItem.ProductId.Value,
                    vol.PackagingTypeId,
                    orderItem.InboundOrderId,
                    effectiveBatch,
                    effectiveMfgDate,
                    effectiveExpDate,
                    rules.TracksSerial ? vol.SerialNumber?.Trim().ToUpper() : null,
                    vol.QuantityPerVolume,
                    orderItem.ExpectedUnitValue,
                    huUnitNet,
                    huUnitGross
                );

                hu.ReceiveAtDock(vol.TargetLocationId);

                if (vol.QualityStatus != QualityStatus.Available)
                {
                    hu.ChangeQuality(vol.QualityStatus);
                    Guid reasonId = vol.QualityReasonId ?? await GetDefaultQualityReasonIdAsync(companyId, ct);
                    string qualityNotes = !string.IsNullOrWhiteSpace(vol.QualityNotes)
                        ? vol.QualityNotes
                        : $"Retenção registrada na conferência da NF-e {orderItem.InboundOrder.AccessKey} ({vol.QualityStatus})";

                    var qualityEvent = new QualityEvent(companyId, hu.Id, vol.TargetLocationId, reasonId, qualityNotes);
                    foreach (var (fileName, filePath, size) in processedImages)
                    {
                        qualityEvent.AddImage(fileName, filePath, size);
                    }
                    _db.QualityEvents.Add(qualityEvent);
                }

                husToInsert.Add(hu);
                totalToReceive += vol.QuantityPerVolume;
                balance.ReceiveToDock(vol.QuantityPerVolume);

                // Prepara movimento desacoplado para gravação segura após o commit
                kardexMovements.Add(new RecordKardexMovementItemDto(
                    CustomerId: orderItem.InboundOrder.CustomerId.Value,
                    ProductId: orderItem.ProductId.Value,
                    HandlingUnitId: hu.Id,
                    LocationId: vol.TargetLocationId,
                    Type: TransactionType.Inbound_Receipt,
                    QuantityChange: vol.QuantityPerVolume,
                    BalanceAfter: vol.QuantityPerVolume,
                    SourceDocumentId: orderItem.InboundOrderId,
                    SourceDocumentNumber: orderItem.InboundOrder.AccessKey,
                    CompanyId: companyId
                ));
            }
        }

        _db.HandlingUnits.AddRange(husToInsert);
        orderItem.AddReceivedQuantity(totalToReceive);

        var orderItems = await _db.InboundOrderItems.Where(i => i.InboundOrderId == orderItem.InboundOrderId).ToListAsync(ct);
        if (orderItems.All(i => i.Status == InboundOrderItemStatus.Completed))
        {
            orderItem.InboundOrder.UpdateStatus(InboundOrderStatus.Completed);
        }

        if (string.IsNullOrWhiteSpace(orderItem.InboundOrder.InvoiceNumber) && orderItem.InboundOrder.AccessKey?.Length == 44)
        {
            if (long.TryParse(orderItem.InboundOrder.AccessKey.Substring(25, 9), out var nNf))
            {
                int.TryParse(orderItem.InboundOrder.AccessKey.Substring(22, 3), out var serie);
                orderItem.InboundOrder.SetInvoiceDetails(nNf.ToString(), serie.ToString());
            }
        }

        var docNumber = orderItem.InboundOrder.InvoiceNumber ??
            (orderItem.InboundOrder.AccessKey!.Length == 44 ? long.Parse(orderItem.InboundOrder.AccessKey.Substring(25, 9)).ToString() : orderItem.InboundOrder.AccessKey[..8]);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao atualizar o saldo ou a ordem. Tente novamente." });
        }

        // DELEGAÇÃO VIA MEDIATR: Gravação segura em lote no Kardex
        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        // DELEGAÇÃO VIA MEDIATR: Faturamento Inbound
        var serviceGroups = new Dictionary<Guid, List<Guid>>();
        int huIndex = 0;

        foreach (var vol in request.Volumes)
        {
            var sId = vol.BillingServiceId ?? request.BillingServiceId;
            var currentHuIds = husToInsert.Skip(huIndex).Take(vol.VolumeCount).Select(h => h.Id).ToList();
            huIndex += vol.VolumeCount;

            if (sId.HasValue && sId.Value != Guid.Empty)
            {
                if (!serviceGroups.ContainsKey(sId.Value))
                    serviceGroups[sId.Value] = new List<Guid>();

                serviceGroups[sId.Value].AddRange(currentHuIds);
            }
        }

        if (orderItem.InboundOrder.CustomerId.HasValue && serviceGroups.Any())
        {
            var billingGroups = serviceGroups.Select(kvp => new InboundBillingServiceItemDto(
                BillingServiceId: kvp.Key,
                HandlingUnitIds: kvp.Value
            )).ToList();

            await _mediator.Send(new BillInboundReceiptCommand(
                InboundOrderId: orderItem.InboundOrderId,
                CustomerId: orderItem.InboundOrder.CustomerId.Value,
                DocumentNumber: docNumber,
                OrderItemId: orderItem.Id,
                ServiceGroups: billingGroups
            ), ct);
        }

        return Results.Ok(new
        {
            Message = "Lote recebido na Doca com sucesso.",
            HusGenerated = husToInsert.Select(h => new { h.Id, h.Lpn }).ToList(),
            OrderItemStatus = orderItem.Status.ToString()
        });
    }

    private async Task<InventoryBalance> GetOrCreateBalanceAsync(Guid companyId, Guid customerId, Guid productId, CancellationToken ct)
    {
        var balance = await _db.InventoryBalances.FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == productId, ct);
        if (balance == null)
        {
            balance = new InventoryBalance(companyId, customerId, productId);
            _db.InventoryBalances.Add(balance);
        }
        return balance;
    }

    private async Task<Guid> GetDefaultQualityReasonIdAsync(Guid companyId, CancellationToken ct)
    {
        var reason = await _db.QualityReasons
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.CompanyId == companyId && r.IsActive, ct);

        if (reason != null) return reason.Id;

        var defaultReason = new QualityReason(companyId, "RECEBIMENTO", "Avaria / Divergência Identificada no Recebimento Fiscal");
        _db.QualityReasons.Add(defaultReason);
        await _db.SaveChangesAsync(ct);
        return defaultReason.Id;
    }

    private static string GenerateShortLpn()
    {
        var ticks = (DateTime.UtcNow.Ticks - 638000000000000000L) % 2176782336L;
        var randomVal = Random.Shared.Next(0, 1679616);
        return $"{ConvertToBase36(ticks, 6)}{ConvertToBase36(randomVal, 4)}".ToUpper();
    }

    private static string ConvertToBase36(long number, int minLength)
    {
        const string chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var result = new StringBuilder();
        while (number > 0)
        {
            result.Insert(0, chars[(int)(number % 36)]);
            number /= 36;
        }
        return result.ToString().PadLeft(minLength, '0');
    }
}

public static class ReceiveLoteEndpoints
{
    public static void MapReceiveLoteEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/receive/checkout", async ([FromBody] ReceiveLoteCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Receive);
    }
}