using System.Security.Claims;
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

namespace CoreWMS.Api.Features.Inbound;

// ==========================================
// 1. DTOs
// ==========================================
public record ReceiveVolumeDto(
    Guid PackagingTypeId,
    int VolumeCount,               // Ex: 5 paletes
    decimal QuantityPerVolume,     // Ex: 100 UN por palete
    string? Batch,
    DateTime? ManufactureDate,
    DateTime? ExpirationDate,
    string? SerialNumber,
    Guid TargetLocationId,         // Endereço de destino (Blocado, Porta-Pallet ou Virtual)
    QualityStatus QualityStatus    // Available, Damaged, Virtual_Shortage
);

// ==========================================
// 2. COMMANDS
// ==========================================v

public record ReceiveLoteCommand(Guid OrderItemId, Guid? BillingServiceId, List<ReceiveVolumeDto> Volumes) : IRequest<IResult>;
public record StartReceivingCommand(Guid OrderItemId, Guid DockLocationId) : IRequest<IResult>;
public record ReleaseItemCommand(Guid OrderItemId) : IRequest<IResult>;

// ==========================================
// 3. VALIDATORS
// ==========================================v

public class ReceiveLoteCommandValidator : AbstractValidator<ReceiveLoteCommand>
{
    public ReceiveLoteCommandValidator()
    {
        RuleFor(x => x.OrderItemId).NotEmpty().WithMessage("O ID do item da ordem é obrigatório.");
        RuleFor(x => x.Volumes).NotEmpty().WithMessage("O carrinho não pode estar vazio.");
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

public class StartReceivingCommandValidator : AbstractValidator<StartReceivingCommand>
{
    public StartReceivingCommandValidator()
    {
        RuleFor(x => x.OrderItemId).NotEmpty();
        RuleFor(x => x.DockLocationId).NotEmpty().WithMessage("É obrigatório informar a doca de recebimento.");
    }
}

public class ReleaseItemCommandValidator : AbstractValidator<ReleaseItemCommand>
{
    public ReleaseItemCommandValidator()
    {
        RuleFor(x => x.OrderItemId).NotEmpty();
    }
}

// ==========================================
// 4. HANDLERS
// ==========================================
public class ReceiveLoteHandler : IRequestHandler<ReceiveLoteCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMasterDataCacheService _masterDataCache;
    private readonly KardexChannel _kardex;
    private readonly IHttpContextAccessor _http;

    public ReceiveLoteHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IMasterDataCacheService masterDataCache,
        KardexChannel kardex,
        IHttpContextAccessor http)
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

        // 1. Carrega o item da ordem
        var orderItem = await _db.InboundOrderItems
            .Include(i => i.InboundOrder)
            .FirstOrDefaultAsync(i => i.Id == request.OrderItemId && i.InboundOrder.CompanyId == companyId, ct);

        if (orderItem == null || !orderItem.ProductId.HasValue)
            return Results.BadRequest(new { Message = "Item inválido ou pendente de revisão." });

        if (orderItem.LockedByUserId.HasValue && orderItem.LockedByUserId != userId)
            return Results.BadRequest(new { Message = "Este item está sendo recebido por outro operador." });

        // 2. Busca as regras 100% em memória (RAM)
        var rules = await _masterDataCache.GetProductRulesAsync(companyId, orderItem.ProductId.Value, ct);
        if (rules == null)
            return Results.BadRequest(new { Message = "Regras do produto não encontradas no Master Data." });

        // 3. Validações Fiscais e Logísticas em Lote
        decimal totalToReceive = 0;
        var husToInsert = new List<HandlingUnit>();
        var balance = await GetOrCreateBalanceAsync(companyId, orderItem.InboundOrder.CustomerId!.Value, orderItem.ProductId.Value, ct);

        foreach (var vol in request.Volumes)
        {
            // A. Regras Logísticas (SLA)
            if (rules.StrictBatch && string.IsNullOrWhiteSpace(vol.Batch))
                throw new InvalidOperationException($"SLA Rejeitado: O produto {rules.Sku} exige lote.");

            if (rules.StrictExpiration && !vol.ExpirationDate.HasValue)
                throw new InvalidOperationException($"SLA Rejeitado: O produto {rules.Sku} exige data de validade.");

            // B. Imutabilidade Fiscal (Apenas se o XML trouxe a informação e o volume não for uma sobra avulsa)
            if (!string.IsNullOrWhiteSpace(orderItem.ExpectedBatch) && vol.Batch != orderItem.ExpectedBatch && vol.QualityStatus == QualityStatus.Available)
                throw new InvalidOperationException($"Divergência Fiscal: O lote informado ({vol.Batch}) difere da nota fiscal ({orderItem.ExpectedBatch}). Classifique como avaria/falta ou corrija o lote.");

            // C. Geração Física das HUs
            for (int i = 0; i < vol.VolumeCount; i++)
            {
                // Gera LPN único sequencial (Ex: HU-C1-17092026-XXXX)
                var lpn = $"HU{DateTime.UtcNow:yyMMddHHmmss}{Guid.NewGuid().ToString().Substring(0, 4)}".ToUpper();

                var hu = new HandlingUnit(
                    lpn, companyId, orderItem.InboundOrder.CustomerId!.Value, orderItem.ProductId.Value, vol.PackagingTypeId,
                    orderItem.InboundOrderId, vol.Batch, vol.ManufactureDate, vol.ExpirationDate, vol.SerialNumber,
                    vol.QuantityPerVolume, orderItem.ExpectedUnitValue
                );

                // D. Tratamento de Qualidade e Alocação Automática
                hu.ReceiveAtDock(vol.TargetLocationId); // Já envia direto para o Target (Blocado/Virtual)

                if (vol.QualityStatus != QualityStatus.Available)
                {
                    hu.ChangeQuality(vol.QualityStatus);
                }

                husToInsert.Add(hu);
                totalToReceive += vol.QuantityPerVolume;

                // E. Atualização do Saldo Consolidado e Kardex (Auditoria)
                if (vol.QualityStatus == QualityStatus.Virtual_Shortage || vol.QualityStatus == QualityStatus.Damaged || vol.QualityStatus == QualityStatus.Quarantine)
                {
                    balance.Quarantine(vol.QuantityPerVolume); // Isola saldos não disponíveis
                }
                else
                {
                    balance.Receive(vol.QuantityPerVolume); // Adiciona ao saldo disponível real
                }

                await _kardex.WriteAsync(new InventoryTransaction(
                    companyId, orderItem.InboundOrder.CustomerId.Value, orderItem.ProductId.Value, hu.Id, vol.TargetLocationId,
                    TransactionType.Inbound_Receipt, vol.QuantityPerVolume, vol.QuantityPerVolume,
                    orderItem.InboundOrderId, orderItem.InboundOrder.AccessKey), ct);
            }
        }

        // 4. Efetiva as HUs e atualiza a Linha da Ordem
        _db.HandlingUnits.AddRange(husToInsert);
        orderItem.AddReceivedQuantity(totalToReceive);

        // Se a nota toda foi recebida, atualiza o cabeçalho
        var orderItems = await _db.InboundOrderItems.Where(i => i.InboundOrderId == orderItem.InboundOrderId).ToListAsync(ct);
        if (orderItems.All(i => i.Status == InboundOrderItemStatus.Completed))
        {
            orderItem.InboundOrder.UpdateStatus(InboundOrderStatus.Completed);
        }

        // ==========================================
        // B. FATURAMENTO TRANSACIONAL (NOVIDADE)
        // ==========================================
        if (request.BillingServiceId.HasValue)
        {
            var activeCycle = await _db.BillingCycles
    .FirstOrDefaultAsync(c =>
        c.CustomerId == orderItem.InboundOrder.CustomerId &&
        c.Status == CoreWMS.Api.Features.Billing.Entities.BillingStatus.Draft, ct);

            var tariff = await _db.CustomerTariffs
                .Include(t => t.BillingService)
                .FirstOrDefaultAsync(t =>
                    t.CustomerId == orderItem.InboundOrder.CustomerId &&
                    t.BillingServiceId == request.BillingServiceId.Value, ct);

            if (activeCycle != null && tariff != null)
            {
                // Calcula o faturamento pela quantidade de volumes (Ex: 5 Paletes descarregados)
                var totalVolumes = request.Volumes.Sum(v => v.VolumeCount);
                var totalAmount = totalVolumes * tariff.UnitValue;

                // Gera o extrato descritivo para a fatura
                var extractData = System.Text.Json.JsonSerializer.Serialize(new
                {
                    InboundOrderId = orderItem.InboundOrderId,
                    AccessKey = orderItem.InboundOrder.AccessKey,
                    GeneratedHus = husToInsert.Select(h => h.Lpn).ToList()
                });

                var billingItem = new CoreWMS.Api.Features.Billing.Entities.BillingItem(
                    activeCycle.Id,
                    tariff.BillingServiceId,
                    $"{tariff.BillingService.Name} - NF {orderItem.InboundOrder.AccessKey}",
                    totalVolumes,
                    totalAmount,
                    extractData,
                    null
                );

                _db.BillingItems.Add(billingItem);
            }
        }

        // ==========================================
        // C. COMMIT TRANSACIONAL (Tudo ou nada)
        // ==========================================
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
            HusGenerated = husToInsert.Select(h => h.Lpn).ToList(),
            OrderItemStatus = orderItem.Status.ToString()
        });
    }

    private async Task<InventoryBalance> GetOrCreateBalanceAsync(Guid companyId, Guid customerId, Guid productId, CancellationToken ct)
    {
        var balance = await _db.InventoryBalances
            .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == productId, ct);

        if (balance == null)
        {
            balance = new InventoryBalance(companyId, customerId, productId);
            _db.InventoryBalances.Add(balance);
        }

        return balance;
    }
}

public class StartReceivingHandler : IRequestHandler<StartReceivingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public StartReceivingHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(StartReceivingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var userId = Guid.Parse(_http.HttpContext!.User.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value);

        var item = await _db.InboundOrderItems
            .FirstOrDefaultAsync(i => i.Id == request.OrderItemId && i.InboundOrder.CompanyId == companyId, ct);

        if (item == null) return Results.NotFound(new { Message = "Item não encontrado." });

        // A entidade cuida das regras de negócio (se já está finalizado, se está pendente de revisão ou travado por outro)
        try
        {
            item.LockForReceiving(userId, request.DockLocationId);
            await _db.SaveChangesAsync(ct);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Houve uma atualização simultânea neste item. Atualize a tela." });
        }

        return Results.Ok(new { Message = "Item reservado para recebimento." });
    }
}

public class ReleaseItemHandler : IRequestHandler<ReleaseItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public ReleaseItemHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(ReleaseItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var userId = Guid.Parse(_http.HttpContext!.User.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value);

        // Verifica se o usuário logado tem a permissão gerencial para "forçar" a liberação de qualquer carrinho
        var isManager = _http.HttpContext.User.HasClaim(c => c.Type == "Permission" && c.Value == Permissions.Inbound.Manage);

        var item = await _db.InboundOrderItems
            .FirstOrDefaultAsync(i => i.Id == request.OrderItemId && i.InboundOrder.CompanyId == companyId, ct);

        if (item == null) return Results.NotFound();

        if (!item.LockedByUserId.HasValue)
            return Results.BadRequest(new { Message = "Este item não está em conferência no momento." });

        // Somente o dono do lock ou um gestor pode destravar
        if (item.LockedByUserId != userId && !isManager)
            return Results.Forbid();

        item.Unlock();

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Houve uma atualização simultânea neste item. Atualize a tela." });
        }

        return Results.Ok(new { Message = "Item liberado com sucesso." });
    }
}

// ==========================================
// 5. ENDPOINTS
// ==========================================
public static class InboundReceiveEndpoints
{
    public static void MapInboundReceiveEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inbound/receive").WithTags("Inbound").RequireAuthorization();

        // 1. Trava o item e inicia a conferência
        group.MapPost("/start", async (StartReceivingCommand cmd, IMediator mediator) => await mediator.Send(cmd))
             .RequirePermission(Permissions.Inbound.Receive);

        // 2. O Checkout (que já fizemos)
        group.MapPost("/checkout", async (ReceiveLoteCommand cmd, IMediator mediator) => await mediator.Send(cmd))
             .RequirePermission(Permissions.Inbound.Receive);

        // 3. Destrava o item
        group.MapPost("/{orderItemId:guid}/release", async (Guid orderItemId, IMediator mediator) =>
                await mediator.Send(new ReleaseItemCommand(orderItemId)))
             .RequirePermission(Permissions.Inbound.Receive);
    }
}