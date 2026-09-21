using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record CancelOutboundOrderCommand(Guid Id) : IRequest<IResult>;

public class CancelOutboundOrderCommandValidator : AbstractValidator<CancelOutboundOrderCommand>
{
    public CancelOutboundOrderCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class CancelOutboundOrderHandler : IRequestHandler<CancelOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CancelOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CancelOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Busca a Ordem com Itens e Volumes
        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.Id, ct);

        if (order == null) return Results.NotFound();

        if (order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Não é possível cancelar um pedido que já foi faturado e expedido (Shipped)." });

        if (order.Status == OutboundOrderStatus.Canceled)
            return Results.BadRequest(new { Message = "O pedido já está cancelado." });

        // 2. Busca e Estorna as Alocações (Tarefas de Picking)
        var allocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderId == order.Id)
            .ToListAsync(ct);

        foreach (var alloc in allocations)
        {
            var orderItem = order.Items.First(i => i.Id == alloc.OutboundOrderItemId);

            // Devolve o saldo lógico (reservado) para o status de "Disponível"
            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == orderItem.ProductId && b.CustomerId == order.CustomerId, ct);

            if (balance != null)
            {
                // Nota: Certifique-se de ter este método criado na entidade InventoryBalance
                // para subtrair do campo 'AllocatedQuantity' e liberar o saldo.
                balance.UnallocateForPicking(alloc.Quantity);
            }
        }

        // Extermina as tarefas do coletor
        if (allocations.Any()) _db.OutboundAllocations.RemoveRange(allocations);

        // 3. Estorna o Empacotamento (Remove Volumes criados)
        if (order.Volumes.Any())
        {
            _db.Set<Entities.OutboundVolume>().RemoveRange(order.Volumes);
        }

        // 4. Limpa Cobranças Geradas (Se o operador já tinha feito o Packing)
        var billingItems = await _db.BillingItems
            .Where(b => b.Description.Contains(order.OrderNumber))
            .ToListAsync(ct);

        if (billingItems.Any()) _db.BillingItems.RemoveRange(billingItems);

        // 5. Reseta os Itens e o Status Master do Pedido
        foreach (var item in order.Items)
        {
            // Reset seguro através de reflexão para respeitar o private set
            item.GetType().GetProperty("AllocatedQuantity")?.SetValue(item, 0m);
            item.GetType().GetProperty("PickedQuantity")?.SetValue(item, 0m);
            item.GetType().GetProperty("PackedQuantity")?.SetValue(item, 0m);
            item.GetType().GetProperty("Status")?.SetValue(item, OutboundOrderItemStatus.Pending);
        }

        order.UpdateStatus(OutboundOrderStatus.Canceled);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito ao cancelar o pedido (Operador pode estar em processo de bipagem). Tente novamente." });
        }

        return Results.Ok(new { Message = "Pedido cancelado e todas as reservas e faturamentos foram estornados com sucesso." });
    }
}

public static class CancelOutboundOrderEndpoints
{
    public static void MapCancelOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/outbound/orders/{id:guid}/cancel", async (Guid id, IMediator mediator) => await mediator.Send(new CancelOutboundOrderCommand(id)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}