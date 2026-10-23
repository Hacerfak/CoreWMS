using System.Security.Claims;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Checking;

// 1. Escanear Item/HU/Volume
public record CheckOutboundItemCommand(Guid OrderId, string ScannedCode, decimal? Quantity = null) : IRequest<IResult>;

// 2. Desfazer Leitura Individual
public record UndoCheckScanCommand(Guid OrderId, Guid CheckLogId) : IRequest<IResult>;

// 3. Resetar Toda a Conferência da Ordem
public record ResetOrderCheckingCommand(Guid OrderId) : IRequest<IResult>;

public class CheckOutboundItemCommandValidator : AbstractValidator<CheckOutboundItemCommand>
{
    public CheckOutboundItemCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("O identificador do pedido é obrigatório.");
        RuleFor(x => x.ScannedCode).NotEmpty().WithMessage("O código lido é obrigatório.").MaximumLength(100);
        When(x => x.Quantity.HasValue, () =>
        {
            RuleFor(x => x.Quantity!.Value).GreaterThan(0).WithMessage("A quantidade deve ser maior que zero.");
        });
    }
}

public class CheckOutboundItemHandler :
    IRequestHandler<CheckOutboundItemCommand, IResult>,
    IRequestHandler<UndoCheckScanCommand, IResult>,
    IRequestHandler<ResetOrderCheckingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public CheckOutboundItemHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(CheckOutboundItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var user = _http.HttpContext?.User;
        var userId = Guid.TryParse(user?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var uGuid) ? uGuid : Guid.Empty;
        var userName = user?.FindFirst("Name")?.Value ?? user?.Identity?.Name ?? "Conferente";

        var order = await _db.OutboundOrders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });
        if (order.Status == OutboundOrderStatus.Canceled || order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "O pedido não se encontra num estado elegível para conferência." });

        // Validação de Segurança Baseada no Indicador Direto "IsFractional"
        var hasFractionalPendingPacking = await _db.OutboundAllocations
            .Include(a => a.OutboundOrderItem)
            .AnyAsync(a => a.OutboundOrderId == order.Id
                        && a.IsFractional
                        && a.OutboundOrderItem.Status != OutboundOrderItemStatus.Packed, ct);

        if (hasFractionalPendingPacking && (order.Status == OutboundOrderStatus.Picking || order.Status == OutboundOrderStatus.Packing))
        {
            return Results.BadRequest(new
            {
                Message = "Este pedido possui itens fracionados pendentes de embalagem. A conferência só é permitida após a finalização do Packing."
            });
        }

        var codeClean = request.ScannedCode.Trim().ToUpper();

        // CASO 1: LPN da HU (Volume Fechado)
        var allocationByHu = await _db.OutboundAllocations
            .Include(a => a.HandlingUnit)
            .Include(a => a.OutboundOrderItem)
            .FirstOrDefaultAsync(a => a.OutboundOrderId == order.Id && a.HandlingUnit.Lpn == codeClean, ct);

        if (allocationByHu != null)
        {
            if (!allocationByHu.IsPicked)
                return Results.BadRequest(new { Message = $"A HU {codeClean} ainda não foi recolhida no armazém." });

            if (allocationByHu.IsChecked)
                return Results.BadRequest(new { Message = $"A HU {codeClean} já foi conferida anteriormente por {allocationByHu.CheckedByName}." });

            var item = order.Items.First(i => i.Id == allocationByHu.OutboundOrderItemId);
            decimal qtyToApply = allocationByHu.Quantity;

            allocationByHu.MarkAsChecked(userId, userName);
            item.AddCheckedQuantity(qtyToApply);

            var vol = order.Volumes.FirstOrDefault(v => v.VolumeLpn == codeClean);
            if (vol != null && !vol.IsChecked)
            {
                vol.MarkAsChecked(userId, userName);
            }

            var checkLog = new OutboundCheckLog(
                order.Id, item.Id, codeClean, CheckCodeType.HandlingUnitLpn,
                qtyToApply, userId, userName, allocationByHu.HandlingUnitId, vol?.Id
            );
            _db.OutboundCheckLogs.Add(checkLog);

            order.RefreshStatusAfterProgress();
            await _db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                Message = order.Status == OutboundOrderStatus.ReadyToShip
                    ? $"HU {codeClean} conferida! Conferência 100% concluída para a Ordem #{order.OrderNumber}."
                    : $"HU {codeClean} conferida com sucesso!",
                OrderItemId = item.Id,
                SkuCode = item.SkuCode,
                QuantityCheckedNow = qtyToApply,
                TotalChecked = item.CheckedQuantity,
                OrderStatus = order.Status.ToString()
            });
        }

        // CASO 2: Código do Volume de Transporte (VOL-...)
        var shippingVol = order.Volumes.FirstOrDefault(v => v.VolumeLpn == codeClean);
        if (shippingVol != null)
        {
            if (shippingVol.IsChecked)
                return Results.BadRequest(new { Message = $"O volume {codeClean} já foi conferido anteriormente por {shippingVol.CheckedByName}." });

            shippingVol.MarkAsChecked(userId, userName);

            var alloc = await _db.OutboundAllocations
                .Include(a => a.HandlingUnit)
                .FirstOrDefaultAsync(a => a.OutboundOrderId == order.Id && a.HandlingUnit.Lpn == codeClean, ct);

            if (alloc != null && !alloc.IsChecked)
            {
                alloc.MarkAsChecked(userId, userName);
                var item = order.Items.First(i => i.Id == alloc.OutboundOrderItemId);
                item.AddCheckedQuantity(alloc.Quantity);

                var checkLog = new OutboundCheckLog(
                    order.Id, item.Id, codeClean, CheckCodeType.ShippingVolumeLpn,
                    alloc.Quantity, userId, userName, alloc.HandlingUnitId, shippingVol.Id
                );
                _db.OutboundCheckLogs.Add(checkLog);

                order.RefreshStatusAfterProgress();
                await _db.SaveChangesAsync(ct);

                return Results.Ok(new
                {
                    Message = $"Volume {codeClean} conferido com sucesso!",
                    OrderItemId = item.Id,
                    SkuCode = item.SkuCode,
                    TotalChecked = item.CheckedQuantity,
                    OrderStatus = order.Status.ToString()
                });
            }

            order.RefreshStatusAfterProgress();
            await _db.SaveChangesAsync(ct);
            return Results.Ok(new { Message = $"Volume de transporte {codeClean} marcado como conferido!", OrderStatus = order.Status.ToString() });
        }

        // CASO 3: SKU / Código de Barras EAN
        var targetItem = order.Items.FirstOrDefault(i =>
            i.SkuCode.Equals(codeClean, StringComparison.OrdinalIgnoreCase) ||
            (!string.IsNullOrWhiteSpace(i.Product?.BaseBarcode) && i.Product.BaseBarcode == codeClean));

        if (targetItem != null)
        {
            decimal qtyToAdd = request.Quantity ?? 1m;
            decimal remainingToCheck = targetItem.ExpectedQuantity - targetItem.CheckedQuantity;

            if (remainingToCheck <= 0)
                return Results.BadRequest(new { Message = $"O SKU {targetItem.SkuCode} já foi 100% conferido nesta ordem." });

            if (qtyToAdd > remainingToCheck)
                return Results.BadRequest(new { Message = $"Quantidade ({qtyToAdd}) excede o saldo pendente de conferência ({remainingToCheck} {targetItem.Product?.BaseUnit ?? "UN"})." });

            if (targetItem.CheckedQuantity + qtyToAdd > targetItem.PickedQuantity)
                return Results.BadRequest(new { Message = $"Não é possível conferir além do total que já foi separado no armazém ({targetItem.PickedQuantity})." });

            targetItem.AddCheckedQuantity(qtyToAdd);

            var checkLog = new OutboundCheckLog(
                order.Id, targetItem.Id, codeClean, CheckCodeType.ProductSkuBarcode,
                qtyToAdd, userId, userName
            );
            _db.OutboundCheckLogs.Add(checkLog);

            order.RefreshStatusAfterProgress();
            await _db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                Message = order.Status == OutboundOrderStatus.ReadyToShip
                    ? $"SKU {targetItem.SkuCode} conferido! Ordem #{order.OrderNumber} liberada para expedição."
                    : $"Conferência de {qtyToAdd} un do SKU {targetItem.SkuCode} registrada!",
                OrderItemId = targetItem.Id,
                SkuCode = targetItem.SkuCode,
                QuantityCheckedNow = qtyToAdd,
                TotalChecked = targetItem.CheckedQuantity,
                OrderStatus = order.Status.ToString()
            });
        }

        return Results.BadRequest(new { Message = $"O código lido '{codeClean}' não corresponde a nenhum LPN de HU, Volume ou SKU deste pedido." });
    }

    // Desfaz uma leitura pontual
    public async Task<IResult> Handle(UndoCheckScanCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido não encontrado." });
        if (order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Não é possível estornar conferência de um pedido já expedido." });

        var log = await _db.OutboundCheckLogs
            .FirstOrDefaultAsync(c => c.Id == request.CheckLogId && c.OutboundOrderId == order.Id, ct);

        if (log == null) return Results.NotFound(new { Message = "Registro de conferência não encontrado." });

        var item = order.Items.FirstOrDefault(i => i.Id == log.OutboundOrderItemId);
        if (item != null)
        {
            item.ReduceCheckedQuantity(log.Quantity);
        }

        if (log.HandlingUnitId.HasValue)
        {
            var alloc = await _db.OutboundAllocations
                .FirstOrDefaultAsync(a => a.OutboundOrderId == order.Id && a.HandlingUnitId == log.HandlingUnitId.Value, ct);
            if (alloc != null)
            {
                alloc.UpdateQuantity(alloc.Quantity); // Mantém alocação intacta
                // Limpa flags de conferência
                var propIsChecked = typeof(OutboundAllocation).GetProperty("IsChecked");
                var propCheckedByName = typeof(OutboundAllocation).GetProperty("CheckedByName");
                var propCheckedAt = typeof(OutboundAllocation).GetProperty("CheckedAt");
                propIsChecked?.SetValue(alloc, false);
                propCheckedByName?.SetValue(alloc, null);
                propCheckedAt?.SetValue(alloc, null);
            }
        }

        if (log.OutboundVolumeId.HasValue)
        {
            var vol = order.Volumes.FirstOrDefault(v => v.Id == log.OutboundVolumeId.Value);
            if (vol != null)
            {
                var propIsChecked = typeof(OutboundVolume).GetProperty("IsChecked");
                var propCheckedByName = typeof(OutboundVolume).GetProperty("CheckedByName");
                var propCheckedAt = typeof(OutboundVolume).GetProperty("CheckedAt");
                propIsChecked?.SetValue(vol, false);
                propCheckedByName?.SetValue(vol, null);
                propCheckedAt?.SetValue(vol, null);
            }
        }

        _db.OutboundCheckLogs.Remove(log);
        order.RefreshStatusAfterProgress();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Leitura de conferência desfeita com sucesso!", OrderStatus = order.Status.ToString() });
    }

    // Reseta toda a conferência do pedido
    public async Task<IResult> Handle(ResetOrderCheckingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido não encontrado." });
        if (order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Não é possível resetar conferência de um pedido já expedido." });

        var checkLogs = await _db.OutboundCheckLogs.Where(c => c.OutboundOrderId == order.Id).ToListAsync(ct);
        if (checkLogs.Any()) _db.OutboundCheckLogs.RemoveRange(checkLogs);

        var allocations = await _db.OutboundAllocations.Where(a => a.OutboundOrderId == order.Id).ToListAsync(ct);
        foreach (var a in allocations)
        {
            typeof(OutboundAllocation).GetProperty("IsChecked")?.SetValue(a, false);
            typeof(OutboundAllocation).GetProperty("CheckedByName")?.SetValue(a, null);
            typeof(OutboundAllocation).GetProperty("CheckedAt")?.SetValue(a, null);
        }

        foreach (var v in order.Volumes)
        {
            typeof(OutboundVolume).GetProperty("IsChecked")?.SetValue(v, false);
            typeof(OutboundVolume).GetProperty("CheckedByName")?.SetValue(v, null);
            typeof(OutboundVolume).GetProperty("CheckedAt")?.SetValue(v, null);
        }

        foreach (var i in order.Items)
        {
            i.ReduceCheckedQuantity(i.CheckedQuantity);
        }

        order.RefreshStatusAfterProgress();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Toda a conferência do pedido foi resetada.", OrderStatus = order.Status.ToString() });
    }
}

public static class CheckOutboundItemEndpoints
{
    public static void MapCheckOutboundItemEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbound/checking").WithTags("Outbound").RequireAuthorization();

        group.MapPost("/scan", async (CheckOutboundItemCommand cmd, IMediator mediator) => await mediator.Send(cmd))
             .RequirePermission(Permissions.Outbound.Manage);

        group.MapPost("/orders/{orderId:guid}/undo/{checkLogId:guid}", async (Guid orderId, Guid checkLogId, IMediator mediator) =>
             await mediator.Send(new UndoCheckScanCommand(orderId, checkLogId)))
             .RequirePermission(Permissions.Outbound.Manage);

        group.MapPost("/orders/{orderId:guid}/reset", async (Guid orderId, IMediator mediator) =>
             await mediator.Send(new ResetOrderCheckingCommand(orderId)))
             .RequirePermission(Permissions.Outbound.Manage);
    }
}