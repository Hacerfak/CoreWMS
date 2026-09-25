using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Receiving;

public record RollbackHandlingUnitsCommand(List<Guid> HandlingUnitIds, string? Reason) : IRequest<IResult>;

public class RollbackHandlingUnitsCommandValidator : AbstractValidator<RollbackHandlingUnitsCommand>
{
    public RollbackHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Selecione ao menos uma HU para realizar o estorno.");
    }
}

public class RollbackHandlingUnitsHandler : IRequestHandler<RollbackHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public RollbackHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(RollbackHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var hus = await _db.HandlingUnits
            .Include(h => h.Product)
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id))
            .ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio (HU) encontrada." });

        var invalidStatusHus = hus.Where(h => h.Status == HuStatus.Shipped || h.Status == HuStatus.Staged || h.Status == HuStatus.Picking).ToList();
        if (invalidStatusHus.Any())
        {
            var lpns = string.Join(", ", invalidStatusHus.Select(h => h.Lpn));
            return Results.BadRequest(new
            {
                Message = $"As seguintes HUs não podem ser estornadas pois já estão em processo de saída/expedição: {lpns}."
            });
        }

        var huIds = hus.Select(h => h.Id).ToList();
        var allocatedHuIds = await _db.OutboundAllocations
            .Where(a => huIds.Contains(a.HandlingUnitId))
            .Select(a => a.HandlingUnitId)
            .Distinct()
            .ToListAsync(ct);

        if (allocatedHuIds.Any())
        {
            var allocatedLpns = string.Join(", ", hus.Where(h => allocatedHuIds.Contains(h.Id)).Select(h => h.Lpn));
            return Results.BadRequest(new
            {
                Message = $"As seguintes HUs não podem ser estornadas pois já possuem alocação em Notas de Saída/Retorno: {allocatedLpns}."
            });
        }

        var orderIds = hus.Where(h => h.ReceiptDocumentId.HasValue).Select(h => h.ReceiptDocumentId!.Value).Distinct().ToList();
        var inboundOrders = await _db.InboundOrders
            .Include(o => o.Items)
            .Where(o => orderIds.Contains(o.Id))
            .ToListAsync(ct);

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId))
            .ToListAsync(ct);

        foreach (var hu in hus)
        {
            if (hu.ReceiptDocumentId.HasValue)
            {
                var order = inboundOrders.FirstOrDefault(o => o.Id == hu.ReceiptDocumentId.Value);
                if (order != null)
                {
                    var item = order.Items.FirstOrDefault(i => i.ProductId == hu.ProductId);
                    if (item != null)
                    {
                        item.AddReceivedQuantity(-hu.CurrentQuantity);
                        if (item.Status == InboundOrderItemStatus.Completed)
                        {
                            item.UpdateStatus(InboundOrderItemStatus.Ready_To_Receive);
                        }
                    }
                    if (order.Status == InboundOrderStatus.Completed)
                    {
                        order.UpdateStatus(InboundOrderStatus.Receiving);
                    }
                }
            }

            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);
            if (balance != null)
            {
                balance.RollbackReceipt(hu.CurrentQuantity, hu.Status, hu.QualityStatus);
            }

            await _kardex.WriteAsync(new InventoryTransaction(
                companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId,
                TransactionType.Inventory_Adjustment_Out, -hu.CurrentQuantity, 0,
                hu.ReceiptDocumentId, $"ESTORNO HU {hu.Lpn}"), ct);
        }

        _db.HandlingUnits.RemoveRange(hus);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = $"{hus.Count} HU(s) estornada(s) com sucesso." });
    }
}

public static class RollbackHandlingUnitEndpoints
{
    public static void MapRollbackHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/receive/hus/rollback", async ([FromBody] RollbackHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Receive);
    }
}