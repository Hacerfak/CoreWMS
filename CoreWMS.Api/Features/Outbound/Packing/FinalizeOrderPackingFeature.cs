using System.Security.Claims;
using CoreWMS.Api.Features.Billing.Operations;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Packing;

public record ShippingVolumeDto(
    Guid PackagingTypeId,
    int VolumeCount,
    decimal? GrossWeight = null
);

public record FinalizeOrderPackingCommand(
    Guid OrderId,
    Guid DockLocationId,
    bool UsedStretchFilm,
    List<ShippingVolumeDto> ShippingVolumes,
    Guid? HandlingServiceId = null
) : IRequest<IResult>;

public class FinalizeOrderPackingCommandValidator : AbstractValidator<FinalizeOrderPackingCommand>
{
    public FinalizeOrderPackingCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("O identificador do pedido é obrigatório.");
        RuleFor(x => x.DockLocationId).NotEmpty().WithMessage("A doca de embarque destino é obrigatória.");
        RuleFor(x => x.ShippingVolumes).NotEmpty().WithMessage("Informe ao menos um volume final para transporte.");
        RuleForEach(x => x.ShippingVolumes).ChildRules(v =>
        {
            v.RuleFor(x => x.PackagingTypeId).NotEmpty().WithMessage("O tipo de embalagem de transporte é obrigatório.");
            v.RuleFor(x => x.VolumeCount).GreaterThan(0).WithMessage("A quantidade de volumes finais deve ser maior que zero.");
            v.RuleFor(x => x.GrossWeight).GreaterThanOrEqualTo(0).When(x => x.GrossWeight.HasValue)
                .WithMessage("O peso bruto não pode ser negativo.");
        });
    }
}

public class FinalizeOrderPackingHandler : IRequestHandler<FinalizeOrderPackingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IMediator _mediator;

    public FinalizeOrderPackingHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IHttpContextAccessor httpContextAccessor,
        IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _httpContextAccessor = httpContextAccessor;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(FinalizeOrderPackingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var user = _httpContextAccessor.HttpContext?.User;
        var userId = Guid.TryParse(user?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var uGuid) ? uGuid : (Guid?)null;
        var userName = user?.FindFirst("Name")?.Value
            ?? user?.Identity?.Name
            ?? user?.FindFirst(ClaimTypes.Name)?.Value
            ?? "Operador Packing";

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
                .ThenInclude(i => i.Product)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status != OutboundOrderStatus.Picking &&
            order.Status != OutboundOrderStatus.Allocated &&
            order.Status != OutboundOrderStatus.Packing)
        {
            return Results.BadRequest(new
            {
                Message = $"O pedido #{order.OrderNumber} está em status '{order.Status}' e não permite finalização de packing."
            });
        }

        var pendingItems = order.Items.Where(i =>
            i.Status != OutboundOrderItemStatus.Packed && i.PackedQuantity < i.ExpectedQuantity).ToList();

        if (pendingItems.Any())
        {
            var skus = string.Join(", ", pendingItems.Select(i => i.SkuCode));
            return Results.BadRequest(new
            {
                Message = $"Ainda existem itens com conferência pendente no Momento 1 ({skus}). Conclua o apontamento antes de fechar a carga."
            });
        }

        var dockLocation = await _db.Locations
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.Id == request.DockLocationId, ct);

        if (dockLocation == null)
            return Results.BadRequest(new { Message = "Doca de embarque selecionada não encontrada na topologia." });

        var packTypeIds = request.ShippingVolumes.Select(v => v.PackagingTypeId).Distinct().ToList();
        var packagingTypes = await _db.PackagingTypes
            .AsNoTracking()
            .Where(pt => packTypeIds.Contains(pt.Id))
            .ToDictionaryAsync(pt => pt.Id, ct);

        if (packagingTypes.Count != packTypeIds.Count)
            return Results.BadRequest(new { Message = "Um ou mais tipos de embalagens de transporte são inválidos." });

        // Remove apenas volumes manuais anteriores (preserva volumes criados via Auto-Packing)
        var manualVolumes = order.Volumes.Where(v => !v.IsAutoPacked).ToList();
        if (manualVolumes.Any())
        {
            _db.OutboundVolumes.RemoveRange(manualVolumes);
        }

        var allocations = await _db.OutboundAllocations
            .AsNoTracking()
            .Include(a => a.HandlingUnit)
                .ThenInclude(h => h.Product)
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .ToListAsync(ct);

        decimal calculatedOrderGrossWeight = allocations.Sum(a =>
        {
            var huGross = a.HandlingUnit.UnitGrossWeight > 0
                ? a.HandlingUnit.UnitGrossWeight
                : (a.HandlingUnit.Product?.GrossWeight > 0 ? a.HandlingUnit.Product.GrossWeight : a.HandlingUnit.Product?.NetWeight ?? 0m);

            return a.Quantity * huGross;
        });

        int totalShippingVolumesCount = request.ShippingVolumes.Sum(v => v.VolumeCount);
        decimal autoGrossWeightPerVolume = totalShippingVolumesCount > 0
            ? Math.Round(calculatedOrderGrossWeight / totalShippingVolumesCount, 3)
            : 0m;

        var createdShippingVolumes = new List<OutboundVolume>();
        int volumeSequence = 1;

        foreach (var volReq in request.ShippingVolumes)
        {
            var packType = packagingTypes[volReq.PackagingTypeId];
            decimal volumeGrossWeight = volReq.GrossWeight.HasValue && volReq.GrossWeight.Value > 0
                ? Math.Round(volReq.GrossWeight.Value, 3)
                : autoGrossWeightPerVolume;

            for (int i = 0; i < volReq.VolumeCount; i++)
            {
                var lpn = $"VOL-{order.OrderNumber}-{packType.Code}-{volumeSequence:D2}".ToUpper();

                var shippingVol = new OutboundVolume(
                    outboundOrderId: order.Id,
                    packagingTypeId: packType.Id,
                    volumeLpn: lpn,
                    grossWeight: volumeGrossWeight,
                    usedStretchFilm: request.UsedStretchFilm,
                    isAutoPacked: false,
                    packedByUserId: userId,
                    packedByName: userName
                );

                createdShippingVolumes.Add(shippingVol);
                volumeSequence++;
            }
        }

        _db.OutboundVolumes.AddRange(createdShippingVolumes);
        order.StageAtDock(request.DockLocationId);

        await _db.SaveChangesAsync(ct);

        // DELEGAÇÃO MODULAR VIA MEDIATR: Módulo Billing apura Handling Out e Stretch
        await _mediator.Send(new BillOutboundHandlingCommand(
            OutboundOrderId: order.Id,
            OrderNumber: order.OrderNumber,
            CustomerId: order.CustomerId,
            HandlingServiceId: request.HandlingServiceId,
            UsedStretchFilm: request.UsedStretchFilm,
            TriggerType: "Outbound_Packing"
        ), ct);

        return Results.Ok(new
        {
            Message = $"Packing finalizado com sucesso! Pedido #{order.OrderNumber} liberado para a Doca {dockLocation.FullPath}.",
            OrderId = order.Id,
            OrderStatus = order.Status.ToString(),
            DockLocation = dockLocation.FullPath,
            TotalShippingVolumes = createdShippingVolumes.Count,
            UsedStretchFilm = request.UsedStretchFilm,
            TotalCalculatedGrossWeight = createdShippingVolumes.Sum(v => v.GrossWeight)
        });
    }
}

public static class FinalizeOrderPackingEndpoints
{
    public static void MapFinalizeOrderPackingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbound/packing").WithTags("Outbound").RequireAuthorization();

        group.MapPost("/orders/{orderId:guid}/finalize", async (
            Guid orderId,
            [FromBody] FinalizeOrderPackingCommand cmd,
            IMediator mediator) =>
        {
            var command = cmd with { OrderId = orderId };
            return await mediator.Send(command);
        })
        .RequirePermission(Permissions.Outbound.Manage);
    }
}