using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using FluentValidation;
using MediatR;
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
    private readonly BillingEngineService _billingEngine;
    private readonly BillingChannel? _billingChannel;

    public FinalizeOrderPackingHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        BillingEngineService billingEngine,
        BillingChannel? billingChannel = null)
    {
        _db = db;
        _tenant = tenant;
        _billingEngine = billingEngine;
        _billingChannel = billingChannel;
    }

    public async Task<IResult> Handle(FinalizeOrderPackingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

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

        // 1. Validação do Momento 1: todos os itens precisam estar 100% conferidos e apontados
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

        // 2. Remove volumes de transporte anteriores se houver re-packing
        if (order.Volumes.Any())
        {
            _db.OutboundVolumes.RemoveRange(order.Volumes);
        }

        // 3. Cálculo de peso bruto automático com fallback para HUs e Produtos
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

        // 4. Momento 2: Geração das unidades logísticas finais de transporte
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

        // 5. Transita a ordem para ReadyToShip na Doca
        order.StageAtDock(request.DockLocationId);

        // Persiste as alterações físicas antes de rodar os eventos operacionais de faturamento
        await _db.SaveChangesAsync(ct);

        // 6. Faturamento dos Eventos Operacionais (Handling Out e Stretch) vinculados ao Pedido
        var billingItemsGenerated = await GenerateBillingEventsAsync(
            companyId,
            order,
            request.UsedStretchFilm,
            request.HandlingServiceId, // <-- Adicione este argumento aqui
            ct
        );

        // 7. DISPARO EM SEGUNDO PLANO: Atualiza as diárias cumulativas do dia via BillingChannel sem travar a requisição
        if (_billingChannel != null)
        {
            await _billingChannel.EnqueueRecalculationAsync(new BillingRecalculationTask(
                CompanyId: companyId,
                CustomerId: order.CustomerId,
                ReferenceDate: DateTime.UtcNow,
                TriggerOrderId: order.Id,
                TriggerType: "Outbound_Packing"
            ), ct);
        }
        else
        {
            // Fallback assíncrono caso o canal não esteja injetado no container de DI
            _ = Task.Run(async () =>
            {
                try
                {
                    await _billingEngine.UpsertDailyChargesAsync(
                        companyId,
                        order.CustomerId,
                        DateTime.UtcNow,
                        CancellationToken.None
                    );
                }
                catch { }
            });
        }

        return Results.Ok(new
        {
            Message = $"Packing finalizado com sucesso! Pedido #{order.OrderNumber} liberado para a Doca {dockLocation.FullPath}.",
            OrderId = order.Id,
            OrderStatus = order.Status.ToString(),
            DockLocation = dockLocation.FullPath,
            TotalShippingVolumes = createdShippingVolumes.Count,
            UsedStretchFilm = request.UsedStretchFilm,
            TotalCalculatedGrossWeight = createdShippingVolumes.Sum(v => v.GrossWeight),
            BillingEventsCount = billingItemsGenerated.Count
        });
    }

    private async Task<List<BillingItem>> GenerateBillingEventsAsync(
        Guid companyId,
        OutboundOrder order,
        bool usedStretch,
        Guid? handlingServiceId, // <-- Adicione o parâmetro aqui
        CancellationToken ct)
    {
        var currentMonth = DateTime.UtcNow.ToString("MM/yyyy");

        // 1. Localiza ou cria o ciclo de faturamento aberto para a competência corrente
        var cycle = await _db.BillingCycles
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                      c.CustomerId == order.CustomerId &&
                                      c.ReferenceMonth == currentMonth &&
                                      c.Status == BillingStatus.Draft, ct);

        if (cycle == null)
        {
            cycle = new BillingCycle(companyId, order.CustomerId, DateTime.UtcNow);
            _db.BillingCycles.Add(cycle);
            await _db.SaveChangesAsync(ct);
        }

        // 2. Localiza as tarifas ativas vinculadas a este cliente
        var customerTariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId &&
                        t.CustomerId == order.CustomerId &&
                        t.BillingService.IsActive &&
                        t.ValidFrom <= DateTime.UtcNow &&
                        (t.ValidTo == null || t.ValidTo >= DateTime.UtcNow))
            .ToListAsync(ct);

        var generatedItems = new List<BillingItem>();

        // 3. APURAÇÃO HANDLING OUT (MOMENTO 1): Utiliza o serviço indicado ou fallback contratual
        CustomerTariff? handlingTariff = null;

        if (handlingServiceId.HasValue) // <-- Use handlingServiceId diretamente aqui (sem o "request.")
        {
            handlingTariff = customerTariffs.FirstOrDefault(t => t.BillingServiceId == handlingServiceId.Value);
        }

        handlingTariff ??= customerTariffs.FirstOrDefault(t =>
            !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate) &&
            (t.BillingService.Name.Contains("Expedição", StringComparison.OrdinalIgnoreCase) ||
             t.BillingService.Name.Contains("Handling Out", StringComparison.OrdinalIgnoreCase) ||
             t.BillingService.Name.Contains("Saída", StringComparison.OrdinalIgnoreCase)));

        if (handlingTariff != null)
        {
            var calculatedItem = await _billingEngine.ExecuteOperationalEventAsync(
                cycle,
                handlingTariff.BillingService,
                handlingTariff,
                orderId: order.Id,
                documentType: "Ordem de Saída",
                documentNumber: order.OrderNumber,
                orderItemId: null
            );

            if (calculatedItem != null && (calculatedItem.QuantityTotal > 0 || calculatedItem.ServiceTotal > 0))
            {
                var existingItem = cycle.Items.FirstOrDefault(i =>
                    i.BillingServiceId == handlingTariff.BillingServiceId &&
                    i.DocumentId == order.Id &&
                    i.DocumentType == "Ordem de Saída");

                if (existingItem != null)
                {
                    existingItem.UpdateValues(
                        calculatedItem.QuantityTotal,
                        calculatedItem.ServiceTotal,
                        calculatedItem.StatementDataJson,
                        $"Atualizado em {DateTime.UtcNow:dd/MM/yyyy HH:mm} (Finalização Packing)"
                    );
                    generatedItems.Add(existingItem);
                }
                else
                {
                    _db.BillingItems.Add(calculatedItem);
                    generatedItems.Add(calculatedItem);
                }
            }
        }

        // 4. APURAÇÃO FILME STRETCH (MOMENTO 2): Executa a query SQL caso tenha sido aplicado
        if (usedStretch)
        {
            var stretchTariff = customerTariffs.FirstOrDefault(t =>
                !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate) &&
                (t.BillingService.Name.Contains("Stretch", StringComparison.OrdinalIgnoreCase) ||
                 t.BillingService.Name.Contains("Filme", StringComparison.OrdinalIgnoreCase)));

            if (stretchTariff != null)
            {
                var calculatedStretchItem = await _billingEngine.ExecuteOperationalEventAsync(
                    cycle,
                    stretchTariff.BillingService,
                    stretchTariff,
                    orderId: order.Id,
                    documentType: "Ordem de Saída",
                    documentNumber: order.OrderNumber,
                    orderItemId: null
                );

                if (calculatedStretchItem != null && (calculatedStretchItem.QuantityTotal > 0 || calculatedStretchItem.ServiceTotal > 0))
                {
                    var existingStretch = cycle.Items.FirstOrDefault(i =>
                        i.BillingServiceId == stretchTariff.BillingServiceId &&
                        i.DocumentId == order.Id &&
                        i.DocumentType == "Ordem de Saída");

                    if (existingStretch != null)
                    {
                        existingStretch.UpdateValues(
                            calculatedStretchItem.QuantityTotal,
                            calculatedStretchItem.ServiceTotal,
                            calculatedStretchItem.StatementDataJson,
                            $"Atualizado em {DateTime.UtcNow:dd/MM/yyyy HH:mm} (Aplicação Stretch)"
                        );
                        generatedItems.Add(existingStretch);
                    }
                    else
                    {
                        _db.BillingItems.Add(calculatedStretchItem);
                        generatedItems.Add(calculatedStretchItem);
                    }
                }
            }
        }

        if (generatedItems.Any())
        {
            await _db.SaveChangesAsync(ct);
        }

        return generatedItems;
    }
}

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