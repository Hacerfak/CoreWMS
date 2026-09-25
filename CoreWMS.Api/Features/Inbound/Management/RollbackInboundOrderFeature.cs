using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Management;

public record RollbackInboundOrderCommand(Guid OrderId) : IRequest<IResult>;

public class RollbackInboundOrderCommandValidator : AbstractValidator<RollbackInboundOrderCommand>
{
    public RollbackInboundOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
    }
}

public class RollbackInboundOrderHandler : IRequestHandler<RollbackInboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public RollbackInboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(RollbackInboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.InboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound();

        var generatedHus = await _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && h.ReceiptDocumentId == order.Id)
            .ToListAsync(ct);

        if (generatedHus.Any(h => h.Status == Inventory.Enums.HuStatus.Shipped))
            return Results.BadRequest(new { Message = "Estorno bloqueado. Uma ou mais HUs desta ordem já foram expedidas." });

        foreach (var hu in generatedHus)
        {
            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId, ct);

            if (balance != null)
            {
                balance.RollbackReceipt(hu.CurrentQuantity, hu.Status, hu.QualityStatus);
            }

            await _kardex.WriteAsync(new Inventory.Entities.InventoryTransaction(
                companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId,
                Inventory.Enums.TransactionType.Inventory_Adjustment_Out,
                -hu.CurrentQuantity, 0,
                order.Id, $"ESTORNO NF {order.AccessKey}"), ct);
        }

        _db.HandlingUnits.RemoveRange(generatedHus);

        foreach (var item in order.Items)
        {
            item.ResetForRollback();
            item.Unlock();
        }

        order.UpdateStatus(InboundOrderStatus.Pending);

        var billingItems = await _db.BillingItems
            .Where(b => b.Description.Contains(order.AccessKey))
            .ToListAsync(ct);

        if (billingItems.Any()) _db.BillingItems.RemoveRange(billingItems);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito ao processar o estorno. Tente novamente." });
        }

        return Results.Ok(new { Message = "Estorno realizado com sucesso. A ordem retornou para o status pendente." });
    }
}

public static class RollbackInboundOrderEndpoints
{
    public static void MapRollbackInboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/{orderId:guid}/rollback", async (Guid orderId, IMediator mediator) => await mediator.Send(new RollbackInboundOrderCommand(orderId)))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Manage);
    }
}