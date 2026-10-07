using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Packing;

public record FracionadoBoxPackingDto(
    Guid PackagingTypeId,
    int BoxCount,
    List<Guid> OrderItemIds
);

public record PackOrderCommand(
    Guid OrderId,
    Guid DockLocationId,
    bool UsedStretchFilm,
    List<FracionadoBoxPackingDto>? FracionadoBoxes
) : IRequest<IResult>;

public class PackOrderCommandValidator : AbstractValidator<PackOrderCommand>
{
    public PackOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.DockLocationId).NotEmpty().WithMessage("A doca de embarque é obrigatória.");
    }
}

public class PackOrderHandler : IRequestHandler<PackOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public PackOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(PackOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status != OutboundOrderStatus.Picking && order.Status != OutboundOrderStatus.Allocated && order.Status != OutboundOrderStatus.Packing)
            return Results.BadRequest(new { Message = "Este pedido não está em status válido para conferência e embalagem." });

        if (order.Items.Any(i => i.PickedQuantity < i.ExpectedQuantity))
            return Results.BadRequest(new { Message = "Ainda existem itens pendentes de separação no coletor." });

        var allocations = await _db.OutboundAllocations
            .Include(a => a.HandlingUnit)
                .ThenInclude(h => h.PackagingType)
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .ToListAsync(ct);

        if (order.Volumes.Any())
        {
            _db.Set<OutboundVolume>().RemoveRange(order.Volumes);
        }

        int fullPalletVolumesCount = 0;
        int fracionadoBoxesCount = 0;
        decimal totalFracionadoUnitsPicked = 0m;

        // 1. Volumes Fechados
        var fullHuAllocations = allocations
            .Where(a => a.Quantity == a.HandlingUnit.InitialQuantity)
            .GroupBy(a => a.HandlingUnitId)
            .ToList();

        foreach (var huGroup in fullHuAllocations)
        {
            var firstAlloc = huGroup.First();
            var hu = firstAlloc.HandlingUnit;

            var volume = new OutboundVolume(
                outboundOrderId: order.Id,
                packagingTypeId: hu.PackagingTypeId,
                volumeLpn: hu.Lpn,
                usedStretchFilm: request.UsedStretchFilm
            );

            _db.Set<OutboundVolume>().Add(volume);
            fullPalletVolumesCount++;
        }

        // 2. Fracionados
        var fracionadoAllocations = allocations
            .Where(a => a.Quantity < a.HandlingUnit.InitialQuantity)
            .ToList();

        totalFracionadoUnitsPicked = fracionadoAllocations.Sum(a => a.Quantity);

        if (request.FracionadoBoxes != null && request.FracionadoBoxes.Any())
        {
            foreach (var boxReq in request.FracionadoBoxes)
            {
                var packType = await _db.PackagingTypes.FirstOrDefaultAsync(p => p.Id == boxReq.PackagingTypeId, ct);
                if (packType == null) continue;

                for (int i = 0; i < boxReq.BoxCount; i++)
                {
                    var boxLpn = $"CX-EXP-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..4].ToUpper()}";
                    var boxVolume = new OutboundVolume(
                        outboundOrderId: order.Id,
                        packagingTypeId: packType.Id,
                        volumeLpn: boxLpn,
                        grossWeight: 0m,
                        usedStretchFilm: false
                    );
                    _db.Set<OutboundVolume>().Add(boxVolume);
                    fracionadoBoxesCount++;
                }
            }
        }
        else if (totalFracionadoUnitsPicked > 0)
        {
            var defaultPackType = await _db.PackagingTypes.FirstOrDefaultAsync(ct);
            if (defaultPackType != null)
            {
                var boxLpn = $"CX-EXP-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..4].ToUpper()}";
                var boxVolume = new OutboundVolume(
                    outboundOrderId: order.Id,
                    packagingTypeId: defaultPackType.Id,
                    volumeLpn: boxLpn,
                    grossWeight: 0m,
                    usedStretchFilm: false
                );
                _db.Set<OutboundVolume>().Add(boxVolume);
                fracionadoBoxesCount = 1;
            }
        }

        foreach (var item in order.Items)
        {
            item.AddPackedQuantity(item.PickedQuantity - item.PackedQuantity);
        }

        int totalShippingVolumes = fullPalletVolumesCount + fracionadoBoxesCount;
        await GenerateBillingEventsAsync(
            companyId,
            order,
            totalShippingVolumes,
            totalFracionadoUnitsPicked,
            fracionadoBoxesCount,
            request.UsedStretchFilm,
            ct
        );

        order.StageAtDock(request.DockLocationId);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Packing concluído! {totalShippingVolumes} volume(s) final(is) gerado(s) para a Doca.",
            TotalVolumes = totalShippingVolumes,
            FullPallets = fullPalletVolumesCount,
            FracionadoBoxes = fracionadoBoxesCount,
            OrderStatus = order.Status.ToString()
        });
    }

    private async Task GenerateBillingEventsAsync(
        Guid companyId,
        OutboundOrder order,
        int totalShippingVolumes,
        decimal fracionadoUnitsPicked,
        int fracionadoBoxesCount,
        bool stretch,
        CancellationToken ct)
    {
        var currentMonth = DateTime.UtcNow.ToString("MM-yyyy");
        var cycle = await _db.BillingCycles
            .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.CustomerId == order.CustomerId && c.ReferenceMonth == currentMonth, ct);

        if (cycle == null) return;

        var newItems = new List<BillingItem>();

        if (fracionadoUnitsPicked > 0)
        {
            var fracService = await _db.BillingServices.FirstOrDefaultAsync(s => s.CompanyId == companyId && s.Name.Contains("Picking Fracionado"), ct);
            var fracTariff = fracService != null ? await _db.CustomerTariffs.FirstOrDefaultAsync(t => t.BillingServiceId == fracService.Id && t.CustomerId == order.CustomerId, ct) : null;
            if (fracService != null && fracTariff != null)
                newItems.Add(new BillingItem(cycle.Id, fracService.Id, $"Picking Fracionado ({fracionadoUnitsPicked} UN) - PED {order.OrderNumber}", fracionadoUnitsPicked, fracionadoUnitsPicked * fracTariff.UnitValue, null, null));
        }

        if (fracionadoBoxesCount > 0)
        {
            var boxService = await _db.BillingServices.FirstOrDefaultAsync(s => s.CompanyId == companyId && s.Name.Contains("Embalagem de Caixa"), ct);
            var boxTariff = boxService != null ? await _db.CustomerTariffs.FirstOrDefaultAsync(t => t.BillingServiceId == boxService.Id && t.CustomerId == order.CustomerId, ct) : null;
            if (boxService != null && boxTariff != null)
                newItems.Add(new BillingItem(cycle.Id, boxService.Id, $"Montagem de {fracionadoBoxesCount} Caixa(s) Fracionadas - PED {order.OrderNumber}", fracionadoBoxesCount, fracionadoBoxesCount * boxTariff.UnitValue, null, null));
        }

        if (totalShippingVolumes > 0)
        {
            var volService = await _db.BillingServices.FirstOrDefaultAsync(s => s.CompanyId == companyId && s.Name.Contains("Montagem de Volume"), ct);
            var volTariff = volService != null ? await _db.CustomerTariffs.FirstOrDefaultAsync(t => t.BillingServiceId == volService.Id && t.CustomerId == order.CustomerId, ct) : null;
            if (volService != null && volTariff != null)
                newItems.Add(new BillingItem(cycle.Id, volService.Id, $"Expedição de {totalShippingVolumes} Volume(s) - PED {order.OrderNumber}", totalShippingVolumes, totalShippingVolumes * volTariff.UnitValue, null, null));
        }

        if (stretch)
        {
            var stretchService = await _db.BillingServices.FirstOrDefaultAsync(s => s.CompanyId == companyId && s.Name.Contains("Insumo Stretch"), ct);
            var stretchTariff = stretchService != null ? await _db.CustomerTariffs.FirstOrDefaultAsync(t => t.BillingServiceId == stretchService.Id && t.CustomerId == order.CustomerId, ct) : null;
            if (stretchService != null && stretchTariff != null)
                newItems.Add(new BillingItem(cycle.Id, stretchService.Id, $"Insumo Stretch Aplicado - PED {order.OrderNumber}", totalShippingVolumes, totalShippingVolumes * stretchTariff.UnitValue, null, null));
        }

        if (newItems.Any()) _db.BillingItems.AddRange(newItems);
    }
}

public static class OutboundPackingEndpoints
{
    public static void MapOutboundPackingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/packing/pack", async (PackOrderCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}