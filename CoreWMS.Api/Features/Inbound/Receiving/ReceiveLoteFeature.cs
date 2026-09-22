using System.Security.Claims;
using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Caching;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using MediatR;
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
    private readonly KardexChannel _kardex;
    private readonly IHttpContextAccessor _http;

    public ReceiveLoteHandler(ApplicationDbContext db, ITenantProvider tenant, IMasterDataCacheService masterDataCache, KardexChannel kardex, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _masterDataCache = masterDataCache;
        _kardex = kardex;
        _http = http;
    }

    public async Task<IResult> Handle(ReceiveLoteCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var userId = Guid.Parse(_http.HttpContext!.User.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value);

        var orderItem = await _db.InboundOrderItems
            .Include(i => i.InboundOrder)
            .FirstOrDefaultAsync(i => i.Id == request.OrderItemId && i.InboundOrder.CompanyId == companyId, ct);

        if (orderItem == null || !orderItem.ProductId.HasValue)
            return Results.BadRequest(new { Message = "Item inválido ou pendente de revisão." });

        if (orderItem.LockedByUserId.HasValue && orderItem.LockedByUserId != userId)
            return Results.BadRequest(new { Message = "Este item está sendo recebido por outro operador." });

        var rules = await _masterDataCache.GetProductRulesAsync(companyId, orderItem.ProductId.Value, ct);
        if (rules == null)
            return Results.BadRequest(new { Message = "Regras do produto não encontradas no Master Data." });

        decimal totalToReceive = 0;
        var husToInsert = new List<HandlingUnit>();
        var balance = await GetOrCreateBalanceAsync(companyId, orderItem.InboundOrder.CustomerId!.Value, orderItem.ProductId.Value, ct);

        foreach (var vol in request.Volumes)
        {
            if (rules.StrictBatch && string.IsNullOrWhiteSpace(vol.Batch))
                throw new InvalidOperationException($"O produto {rules.Sku} exige lote.");

            if (rules.StrictExpiration && !vol.ExpirationDate.HasValue)
                throw new InvalidOperationException($"O produto {rules.Sku} exige data de validade.");

            if (!string.IsNullOrWhiteSpace(orderItem.ExpectedBatch) && vol.Batch != orderItem.ExpectedBatch && vol.QualityStatus == QualityStatus.Available)
                throw new InvalidOperationException($"Divergência Fiscal: Lote ({vol.Batch}) difere da nota fiscal ({orderItem.ExpectedBatch}).");

            for (int i = 0; i < vol.VolumeCount; i++)
            {
                // Geração de Código LPN Único com 10 caracteres alfanuméricos (Sem prefixo "HU")
                var lpn = GenerateShortLpn();

                var hu = new HandlingUnit(
                    lpn, companyId, orderItem.InboundOrder.CustomerId!.Value, orderItem.ProductId.Value, vol.PackagingTypeId,
                    orderItem.InboundOrderId, vol.Batch, vol.ManufactureDate, vol.ExpirationDate, vol.SerialNumber,
                    vol.QuantityPerVolume, orderItem.ExpectedUnitValue
                );

                hu.ReceiveAtDock(vol.TargetLocationId);
                if (vol.QualityStatus != QualityStatus.Available)
                    hu.ChangeQuality(vol.QualityStatus);

                husToInsert.Add(hu);
                totalToReceive += vol.QuantityPerVolume;

                if (vol.QualityStatus == QualityStatus.Virtual_Shortage || vol.QualityStatus == QualityStatus.Damaged || vol.QualityStatus == QualityStatus.Quarantine)
                    balance.Quarantine(vol.QuantityPerVolume);
                else
                    balance.Receive(vol.QuantityPerVolume);

                await _kardex.WriteAsync(new InventoryTransaction(
                    companyId, orderItem.InboundOrder.CustomerId.Value, orderItem.ProductId.Value, hu.Id, vol.TargetLocationId,
                    TransactionType.Inbound_Receipt, vol.QuantityPerVolume, vol.QuantityPerVolume,
                    orderItem.InboundOrderId, orderItem.InboundOrder.AccessKey), ct);
            }
        }

        _db.HandlingUnits.AddRange(husToInsert);
        orderItem.AddReceivedQuantity(totalToReceive);

        var orderItems = await _db.InboundOrderItems.Where(i => i.InboundOrderId == orderItem.InboundOrderId).ToListAsync(ct);
        if (orderItems.All(i => i.Status == InboundOrderItemStatus.Completed))
        {
            orderItem.InboundOrder.UpdateStatus(InboundOrderStatus.Completed);
        }

        // Faturamento
        if (request.BillingServiceId.HasValue)
        {
            var activeCycle = await _db.BillingCycles.FirstOrDefaultAsync(c => c.CustomerId == orderItem.InboundOrder.CustomerId && c.Status == Billing.Entities.BillingStatus.Draft, ct);
            var tariff = await _db.CustomerTariffs.Include(t => t.BillingService).FirstOrDefaultAsync(t => t.CustomerId == orderItem.InboundOrder.CustomerId && t.BillingServiceId == request.BillingServiceId.Value, ct);

            if (activeCycle != null && tariff != null)
            {
                var totalVolumes = request.Volumes.Sum(v => v.VolumeCount);
                var extractData = System.Text.Json.JsonSerializer.Serialize(new { InboundOrderId = orderItem.InboundOrderId, AccessKey = orderItem.InboundOrder.AccessKey, GeneratedHus = husToInsert.Select(h => h.Lpn).ToList() });
                _db.BillingItems.Add(new Billing.Entities.BillingItem(activeCycle.Id, tariff.BillingServiceId, $"{tariff.BillingService.Name} - NF {orderItem.InboundOrder.AccessKey}", totalVolumes, totalVolumes * tariff.UnitValue, extractData, null));
            }
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao atualizar o saldo ou a ordem. Tente novamente." });
        }

        return Results.Ok(new
        {
            Message = "Lote recebido com sucesso.",
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

    private static string GenerateShortLpn()
    {
        var ticks = (DateTime.UtcNow.Ticks - 638000000000000000L) % 2176782336L; // 6 dígitos Base36
        var randomVal = Random.Shared.Next(0, 1679616);                          // 4 dígitos Base36

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
        app.MapPost("/api/inbound/receive/checkout", async (ReceiveLoteCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Receive);
    }
}