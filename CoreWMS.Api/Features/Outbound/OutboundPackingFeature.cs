using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound;

public record PackOrderCommand(Guid OrderId, Guid PackagingTypeId, int VolumeCount, decimal TotalGrossWeight, bool UsedStretchFilm, Guid DockLocationId) : IRequest<IResult>;

public class PackOrderCommandValidator : AbstractValidator<PackOrderCommand>
{
    public PackOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.PackagingTypeId).NotEmpty();
        RuleFor(x => x.VolumeCount).GreaterThan(0).WithMessage("Deve ser gerado pelo menos 1 volume.");
        RuleFor(x => x.DockLocationId).NotEmpty().WithMessage("A doca de destino é obrigatória.");
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

        if (order == null) return Results.NotFound();

        if (order.Status != OutboundOrderStatus.Picking && order.Status != OutboundOrderStatus.Allocated)
            return Results.BadRequest(new { Message = "Este pedido não está em processo de separação/packing." });

        if (order.Items.Any(i => i.PickedQuantity < i.AllocatedQuantity))
            return Results.BadRequest(new { Message = "Ainda existem itens alocados que não foram separados pelo operador." });

        // 1. Gera os Volumes (A etiqueta que vai no palete do caminhão)
        var packType = await _db.PackagingTypes.FirstOrDefaultAsync(p => p.Id == request.PackagingTypeId, ct);
        if (packType == null) return Results.BadRequest(new { Message = "Tipo de embalagem inválido." });

        var weightPerVolume = request.TotalGrossWeight / request.VolumeCount;

        for (int i = 0; i < request.VolumeCount; i++)
        {
            var volumeLpn = $"EXP-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString().Substring(0, 4).ToUpper()}";
            var volume = new OutboundVolume(order.Id, packType.Id, volumeLpn, weightPerVolume, request.UsedStretchFilm);
            _db.Set<OutboundVolume>().Add(volume);
        }

        // 2. Fecha as quantidades dos Itens (Tudo que foi Picked virou Packed)
        decimal totalFractionalItems = 0;
        foreach (var item in order.Items)
        {
            // Força o PackedQuantity ser igual ao PickedQuantity
            var qtyToPack = item.PickedQuantity - item.PackedQuantity;
            if (qtyToPack > 0)
            {
                item.AddPackedQuantity(qtyToPack);

                // Mágica do Faturamento: Soma as quantidades para cobrar o Picking Fracionado!
                // Aqui estamos assumindo que se a unidade base do produto é cobrada, a gente soma. 
                // Se fosse palete inteiro (transferência), a regra de faturamento não cobraria fracionamento.
                totalFractionalItems += qtyToPack;
            }
        }

        // 3. Faturamento Automático Transacional (Gera faturamento de esforço)
        await GenerateBillingEventsAsync(companyId, order, request.VolumeCount, totalFractionalItems, request.UsedStretchFilm, ct);

        // 4. Move o Pedido para a Doca
        order.StageAtDock(request.DockLocationId);

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = $"Conferência finalizada. {request.VolumeCount} volume(s) gerado(s) na Doca." });
    }

    private async Task GenerateBillingEventsAsync(Guid companyId, OutboundOrder order, int volumes, decimal totalFractionalQty, bool stretch, CancellationToken ct)
    {
        // Pega o ciclo de faturamento aberto deste cliente (Ex: "09-2026")
        var currentMonth = DateTime.UtcNow.ToString("MM-yyyy");
        var cycle = await _db.BillingCycles
            .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.CustomerId == order.CustomerId && c.ReferenceMonth == currentMonth, ct);

        if (cycle == null) return; // Se não tiver ciclo aberto, não fatura automaticamente.

        var newItems = new List<BillingItem>();

        // 1. Cobrança de Picking Fracionado (Ex: Pegou 60 caixas soltas)
        if (totalFractionalQty > 0)
        {
            var fracService = await _db.BillingServices.FirstOrDefaultAsync(s => s.CompanyId == companyId && s.Name.Contains("Picking Fracionado"), ct);
            var fracTariff = fracService != null ? await _db.CustomerTariffs.FirstOrDefaultAsync(t => t.BillingServiceId == fracService.Id && t.CustomerId == order.CustomerId, ct) : null;

            if (fracService != null && fracTariff != null)
            {
                newItems.Add(new BillingItem(cycle.Id, fracService.Id, $"Picking Fracionado NF {order.OrderNumber}", totalFractionalQty, totalFractionalQty * fracTariff.UnitValue, null, null));
            }
        }

        // 2. Cobrança de Montagem de Palete (Ex: Montou 1 Palete)
        var palService = await _db.BillingServices.FirstOrDefaultAsync(s => s.CompanyId == companyId && s.Name.Contains("Montagem de Volume"), ct);
        var palTariff = palService != null ? await _db.CustomerTariffs.FirstOrDefaultAsync(t => t.BillingServiceId == palService.Id && t.CustomerId == order.CustomerId, ct) : null;
        if (palService != null && palTariff != null)
        {
            newItems.Add(new BillingItem(cycle.Id, palService.Id, $"Montagem de Volume NF {order.OrderNumber}", volumes, volumes * palTariff.UnitValue, null, null));
        }

        // 3. Cobrança Insumo - Stretch Film
        if (stretch)
        {
            var stretchService = await _db.BillingServices.FirstOrDefaultAsync(s => s.CompanyId == companyId && s.Name.Contains("Insumo Stretch"), ct);
            var stretchTariff = stretchService != null ? await _db.CustomerTariffs.FirstOrDefaultAsync(t => t.BillingServiceId == stretchService.Id && t.CustomerId == order.CustomerId, ct) : null;
            if (stretchService != null && stretchTariff != null)
            {
                // Cobra 1 stretch por Volume gerado
                newItems.Add(new BillingItem(cycle.Id, stretchService.Id, $"Stretch Aplicado NF {order.OrderNumber}", volumes, volumes * stretchTariff.UnitValue, null, null));
            }
        }

        if (newItems.Any()) _db.BillingItems.AddRange(newItems);
    }
}

public static class OutboundPackingEndpoints
{
    public static void MapOutboundPackingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbound/packing").WithTags("Outbound").RequireAuthorization();

        group.MapPost("/pack", async (PackOrderCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .RequirePermission(Permissions.Outbound.Manage);
    }
}