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

// ====================================================================
// DTOS & COMANDOS (MOMENTO 2: FECHAMENTO DE CARGA, TRANSPORTE & FATURAMENTO)
// ====================================================================

public record ShippingVolumeDto(
    Guid PackagingTypeId,
    int VolumeCount,
    decimal? GrossWeight = null
);

public record FinalizeOrderPackingCommand(
    Guid OrderId,
    Guid DockLocationId,
    bool UsedStretchFilm,
    List<ShippingVolumeDto> ShippingVolumes
) : IRequest<IResult>;

// ====================================================================
// VALIDAÇÃO
// ====================================================================

public class FinalizeOrderPackingCommandValidator : AbstractValidator<FinalizeOrderPackingCommand>
{
    public FinalizeOrderPackingCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("O identificador do pedido é obrigatório.");
        RuleFor(x => x.DockLocationId).NotEmpty().WithMessage("A doca de embarque destino é obrigatória.");
        RuleFor(x => x.ShippingVolumes).NotEmpty().WithMessage("Informe ao menos um volume final para transporte/expedição.");
        RuleForEach(x => x.ShippingVolumes).ChildRules(v =>
        {
            v.RuleFor(x => x.PackagingTypeId).NotEmpty().WithMessage("O tipo de embalagem de transporte é obrigatório.");
            v.RuleFor(x => x.VolumeCount).GreaterThan(0).WithMessage("A quantidade de volumes finais deve ser maior que zero.");
            v.RuleFor(x => x.GrossWeight).GreaterThanOrEqualTo(0).When(x => x.GrossWeight.HasValue)
                .WithMessage("O peso bruto não pode ser negativo.");
        });
    }
}

// ====================================================================
// HANDLER: FECHAMENTO DA CARGA, GERAÇÃO DOS VOLUMES SEFAZ & BILLING
// ====================================================================

public class FinalizeOrderPackingHandler : IRequestHandler<FinalizeOrderPackingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public FinalizeOrderPackingHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(FinalizeOrderPackingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Carrega o pedido completo com seus itens, alocações e volumes atuais
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

        // 2. Trava de integridade do Momento 1: Todos os itens precisam estar 100% conferidos e empacotados
        var pendingItems = order.Items.Where(i =>
            i.Status != OutboundOrderItemStatus.Packed && i.PackedQuantity < i.ExpectedQuantity).ToList();

        if (pendingItems.Any())
        {
            var skus = string.Join(", ", pendingItems.Select(i => i.SkuCode));
            return Results.BadRequest(new
            {
                Message = $"Ainda existem itens pendentes de conferência no Momento 1 ({skus}). Realize o apontamento de todos os itens antes de fechar a carga."
            });
        }

        // Valida se a doca selecionada existe e pertence à topologia da empresa
        var dockLocation = await _db.Locations
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.Id == request.DockLocationId, ct);

        if (dockLocation == null)
            return Results.BadRequest(new { Message = "Doca de embarque selecionada não encontrada na topologia." });

        // Valida tipos de embalagens de transporte informados no Momento 2
        var packTypeIds = request.ShippingVolumes.Select(v => v.PackagingTypeId).Distinct().ToList();
        var packagingTypes = await _db.PackagingTypes
            .AsNoTracking()
            .Where(pt => packTypeIds.Contains(pt.Id))
            .ToDictionaryAsync(pt => pt.Id, ct);

        if (packagingTypes.Count != packTypeIds.Count)
            return Results.BadRequest(new { Message = "Um ou mais tipos de embalagens de transporte informados são inválidos." });

        // 3. Remove volumes de transporte anteriores se houver reprocessamento
        if (order.Volumes.Any())
        {
            _db.OutboundVolumes.RemoveRange(order.Volumes);
        }

        // 4. Calcula o peso bruto total com base no cadastro mestre dos produtos e HUs
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

        // 5. Gera as unidades logísticas finais de transporte (Momento 2)
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
                    usedStretchFilm: request.UsedStretchFilm
                );

                createdShippingVolumes.Add(shippingVol);
                volumeSequence++;
            }
        }

        _db.OutboundVolumes.AddRange(createdShippingVolumes);

        // 6. Transita a Ordem de Saída para ReadyToShip na Doca de Embarque
        order.StageAtDock(request.DockLocationId);

        // 7. DISPARO DO FATURAMENTO AUTOMÁTICO (MOMENTO 1 + MOMENTO 2)
        var billingItemsGenerated = await GenerateBillingEventsAsync(
            companyId,
            order,
            createdShippingVolumes,
            request.UsedStretchFilm,
            ct
        );

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Packing finalizado com sucesso! Pedido #{order.OrderNumber} liberado para a Doca {dockLocation.FullPath}.",
            OrderId = order.Id,
            OrderStatus = order.Status.ToString(),
            DockLocation = dockLocation.FullPath,
            TotalShippingVolumes = createdShippingVolumes.Count,
            UsedStretchFilm = request.UsedStretchFilm,
            TotalCalculatedGrossWeight = createdShippingVolumes.Sum(v => v.GrossWeight),
            BillingEventsCount = billingItemsGenerated.Count,
            Volumes = createdShippingVolumes.Select(v => new
            {
                v.VolumeLpn,
                v.PackagingTypeId,
                PackagingCode = packagingTypes[v.PackagingTypeId].Code,
                PackagingDescription = packagingTypes[v.PackagingTypeId].Description,
                v.GrossWeight
            }).ToList()
        });
    }

    // ====================================================================
    // MOTOR DE APURAÇÃO DE FATURAMENTO LOGÍSTICO
    // ====================================================================

    private async Task<List<BillingItem>> GenerateBillingEventsAsync(
        Guid companyId,
        OutboundOrder order,
        List<OutboundVolume> shippingVolumes,
        bool usedStretch,
        CancellationToken ct)
    {
        // Busca o ciclo de cobrança aberto (Draft) do cliente
        var cycle = await _db.BillingCycles
            .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                      c.CustomerId == order.CustomerId &&
                                      c.Status == BillingStatus.Draft, ct);

        // Se não houver ciclo aberto para o mês corrente, cria automaticamente
        if (cycle == null)
        {
            cycle = new BillingCycle(companyId, order.CustomerId, DateTime.UtcNow);
            _db.BillingCycles.Add(cycle);
            await _db.SaveChangesAsync(ct);
        }

        // Carrega todas as tarifas ativas negociadas no contrato do cliente
        var customerTariffs = await _db.CustomerTariffs
            .AsNoTracking()
            .Include(t => t.BillingService)
            .Where(t => t.CustomerId == order.CustomerId &&
                        t.BillingService.CompanyId == companyId &&
                        t.BillingService.IsActive)
            .ToListAsync(ct);

        var generatedItems = new List<BillingItem>();

        // --------------------------------------------------------------------
        // A) COBRANÇA MOMENTO 1: VOLUMES OPERACIONAIS DE SAÍDA (HANDLING OUT)
        // --------------------------------------------------------------------
        var operationalPacks = await _db.OutboundItemPacks
            .AsNoTracking()
            .Include(p => p.PackagingType)
            .Where(p => p.OutboundOrderId == order.Id)
            .GroupBy(p => new { p.PackagingTypeId, p.PackagingType.Code, p.PackagingType.Description })
            .Select(g => new
            {
                g.Key.PackagingTypeId,
                Code = g.Key.Code.Trim().ToUpper(),
                Description = g.Key.Description.Trim(),
                TotalVolumes = g.Sum(x => x.VolumeCount),
                TotalPieces = g.Sum(x => x.VolumeCount * x.QuantityPerVolume)
            })
            .ToListAsync(ct);

        foreach (var packGroup in operationalPacks)
        {
            // Busca a tarifa cadastrada para o tipo de volume operacional (ex: "PLT", "CX", "UN", "SC", "GF")
            var matchedTariff = customerTariffs.FirstOrDefault(t =>
                t.BillingService.Name.Contains(packGroup.Code, StringComparison.OrdinalIgnoreCase) &&
                (t.BillingService.Name.Contains("Expedição", StringComparison.OrdinalIgnoreCase) ||
                 t.BillingService.Name.Contains("Saída", StringComparison.OrdinalIgnoreCase) ||
                 t.BillingService.Name.Contains("Handling", StringComparison.OrdinalIgnoreCase)))
                ?? customerTariffs.FirstOrDefault(t =>
                    t.BillingService.Name.Contains(packGroup.Code, StringComparison.OrdinalIgnoreCase))
                ?? customerTariffs.FirstOrDefault(t =>
                    t.BillingService.Name.Contains("Expedição", StringComparison.OrdinalIgnoreCase) ||
                    t.BillingService.Name.Contains("Handling Out", StringComparison.OrdinalIgnoreCase));

            if (matchedTariff != null)
            {
                decimal unitRate = matchedTariff.UnitValue;
                decimal totalAmount = Math.Round(packGroup.TotalVolumes * unitRate, 2);

                var extractData = System.Text.Json.JsonSerializer.Serialize(new
                {
                    OutboundOrderId = order.Id,
                    OrderNumber = order.OrderNumber,
                    PackagingCode = packGroup.Code,
                    VolumeCount = packGroup.TotalVolumes,
                    TotalPieces = packGroup.TotalPieces
                });

                var billingItem = new BillingItem(
                    cycle.Id,
                    matchedTariff.BillingServiceId,
                    $"Expedição ({packGroup.Code}) - {packGroup.TotalVolumes} vol ({packGroup.TotalPieces:0.####} un) - Pedido #{order.OrderNumber}",
                    packGroup.TotalVolumes,
                    totalAmount,
                    extractData,
                    null
                );

                generatedItems.Add(billingItem);
            }
        }

        // --------------------------------------------------------------------
        // B) COBRANÇA MOMENTO 2: INSUMO FILME STRETCH APLICADO NA EXPEDIÇÃO
        // --------------------------------------------------------------------
        if (usedStretch)
        {
            var stretchTariff = customerTariffs.FirstOrDefault(t =>
                t.BillingService.Name.Contains("Stretch", StringComparison.OrdinalIgnoreCase) ||
                t.BillingService.Name.Contains("Filme", StringComparison.OrdinalIgnoreCase));

            if (stretchTariff != null)
            {
                // Conta paletes gerados para a expedição (se houver tipo PLT, caso contrário cobra por volume final)
                var palletCount = shippingVolumes.Count(v =>
                    v.PackagingType != null &&
                    v.PackagingType.Code.Contains("PLT", StringComparison.OrdinalIgnoreCase));

                int billableCount = palletCount > 0 ? palletCount : shippingVolumes.Count;

                if (billableCount > 0)
                {
                    decimal stretchTotal = Math.Round(billableCount * stretchTariff.UnitValue, 2);

                    var extractData = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        OutboundOrderId = order.Id,
                        OrderNumber = order.OrderNumber,
                        AppliedPallets = billableCount
                    });

                    var stretchBillingItem = new BillingItem(
                        cycle.Id,
                        stretchTariff.BillingServiceId,
                        $"Aplicação Filme Stretch ({billableCount} vol) - Pedido #{order.OrderNumber}",
                        billableCount,
                        stretchTotal,
                        extractData,
                        null
                    );

                    generatedItems.Add(stretchBillingItem);
                }
            }
        }

        if (generatedItems.Any())
        {
            _db.BillingItems.AddRange(generatedItems);
        }

        return generatedItems;
    }
}

// ====================================================================
// MAPEAMENTO DO ENDPOINT
// ====================================================================

public static class FinalizeOrderPackingEndpoints
{
    public static void MapFinalizeOrderPackingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbound/packing").WithTags("Outbound").RequireAuthorization();

        group.MapPost("/orders/{orderId:guid}/finalize", async (
            Guid orderId,
            FinalizeOrderPackingCommand cmd,
            IMediator mediator) =>
        {
            var command = cmd with { OrderId = orderId };
            return await mediator.Send(command);
        })
        .RequirePermission(Permissions.Outbound.Manage);
    }
}