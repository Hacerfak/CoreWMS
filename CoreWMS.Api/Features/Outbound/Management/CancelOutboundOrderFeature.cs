using CoreWMS.Api.Features.Fiscal.Entities;
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

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.Id, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status == OutboundOrderStatus.Canceled)
            return Results.BadRequest(new { Message = "O pedido já está cancelado." });

        if (order.Status == OutboundOrderStatus.Shipped)
        {
            return Results.BadRequest(new
            {
                Message = "Não é possível cancelar diretamente um pedido expedido (Shipped). Execute o 'Estorno de Expedição' primeiro para restaurar o estoque."
            });
        }

        // Validação Fiscal: Bloqueia se houver documentos fiscais ativos/pendentes
        var hasActiveFiscalDocs = await _db.CompanyFiscalDocuments
            .AnyAsync(d => d.OutboundOrderId == order.Id && d.Status != FiscalDocumentStatus.Canceled, ct);

        if (hasActiveFiscalDocs)
        {
            return Results.BadRequest(new
            {
                Message = "Não é possível cancelar o pedido pois existem documentos fiscais autorizados ou pendentes vinculados. Cancele as notas fiscais na SEFAZ primeiro."
            });
        }

        // 2. Estorna as Alocações (Tarefas de Picking) e libera saldo reservado
        var allocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderId == order.Id)
            .ToListAsync(ct);

        foreach (var alloc in allocations)
        {
            var orderItem = order.Items.First(i => i.Id == alloc.OutboundOrderItemId);

            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == orderItem.ProductId && b.CustomerId == order.CustomerId, ct);

            if (balance != null)
            {
                balance.UnallocateForPicking(alloc.Quantity);
            }
        }

        if (allocations.Any()) _db.OutboundAllocations.RemoveRange(allocations);

        // 3. Remove Volumes criados
        if (order.Volumes.Any())
        {
            _db.Set<Entities.OutboundVolume>().RemoveRange(order.Volumes);
        }

        // 4. Limpa itens de cobrança associados
        var billingItems = await _db.BillingItems
            .Where(b => b.Description.Contains(order.OrderNumber))
            .ToListAsync(ct);

        if (billingItems.Any()) _db.BillingItems.RemoveRange(billingItems);

        // 5. Reseta os Itens e define status como Canceled
        foreach (var item in order.Items)
        {
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
            return Results.Conflict(new { Message = "Conflito ao cancelar o pedido. Tente novamente." });
        }

        return Results.Ok(new { Message = "Pedido cancelado e todas as reservas foram estornadas com sucesso." });
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