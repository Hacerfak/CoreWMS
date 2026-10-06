using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Picking;

public record PickItemCommand(
    Guid OrderId,
    Guid OrderItemId,
    string ScannedLpn,
    decimal PickedQuantity
) : IRequest<IResult>;

public class PickItemCommandValidator : AbstractValidator<PickItemCommand>
{
    public PickItemCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.OrderItemId).NotEmpty();
        RuleFor(x => x.ScannedLpn).NotEmpty().WithMessage("A etiqueta LPN é obrigatória.").MaximumLength(50);
        RuleFor(x => x.PickedQuantity).GreaterThan(0).WithMessage("A quantidade separada deve ser maior que zero.");
    }
}

public class PickItemHandler : IRequestHandler<PickItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public PickItemHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(PickItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Carrega a Ordem e o Item
        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });
        if (order.Status == OutboundOrderStatus.Canceled || order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Este pedido não está em status válido para separação." });

        var orderItem = order.Items.FirstOrDefault(i => i.Id == request.OrderItemId);
        if (orderItem == null) return Results.NotFound(new { Message = "Item do pedido não encontrado." });

        // Valida se o item ainda tem saldo pendente para separação
        decimal pendingQty = orderItem.ExpectedQuantity - orderItem.PickedQuantity;
        if (pendingQty <= 0)
            return Results.BadRequest(new { Message = "A quantidade deste item já foi totalmente separada." });

        if (request.PickedQuantity > pendingQty)
            return Results.BadRequest(new { Message = $"A quantidade informada ({request.PickedQuantity}) excede a quantidade pendente do item ({pendingQty})." });

        // 2. Busca e Valida a HU lida no Coletor
        var lpnClean = request.ScannedLpn.Trim().ToUpper();
        var hu = await _db.HandlingUnits
            .Include(h => h.CurrentLocation)
            .FirstOrDefaultAsync(h => h.CompanyId == companyId && h.CustomerId == order.CustomerId && h.Lpn == lpnClean, ct);

        if (hu == null)
            return Results.BadRequest(new { Message = $"A etiqueta LPN '{lpnClean}' não foi encontrada em estoque para este depositante." });

        if (hu.ProductId != orderItem.ProductId)
            return Results.BadRequest(new { Message = $"A etiqueta '{lpnClean}' pertence a outro produto e não pode ser separada para este item." });

        if (hu.QualityStatus != QualityStatus.Available)
            return Results.BadRequest(new { Message = $"A etiqueta '{lpnClean}' está bloqueada/quarentena e não pode ser expedida." });

        if (hu.Status != HuStatus.Stored && hu.Status != HuStatus.Received)
            return Results.BadRequest(new { Message = $"A etiqueta '{lpnClean}' não está em status de estoque disponível." });

        // 3. Validação de Saldo Livre na HU (Desconta o que já foi SEPARADO por outros pedidos)
        var alreadyPickedQtyOnHu = await _db.OutboundAllocations
            .Where(a => a.HandlingUnitId == hu.Id && a.IsPicked)
            .SumAsync(a => (decimal?)a.Quantity, ct) ?? 0m;

        decimal freeQtyOnHu = hu.CurrentQuantity - alreadyPickedQtyOnHu;
        if (request.PickedQuantity > freeQtyOnHu)
            return Results.BadRequest(new { Message = $"A etiqueta '{lpnClean}' não possui saldo livre suficiente. Disponível livre: {freeQtyOnHu}, Solicitado: {request.PickedQuantity}." });

        // 4. Vinculação da Alocação / Troca Dinâmica
        var existingUnpickedAlloc = await _db.OutboundAllocations
            .FirstOrDefaultAsync(a => a.OutboundOrderId == order.Id &&
                                      a.OutboundOrderItemId == orderItem.Id &&
                                      a.HandlingUnitId == hu.Id &&
                                      !a.IsPicked, ct);

        if (existingUnpickedAlloc != null)
        {
            // O operador bipou a exata HU que estava pré-alocada
            if (existingUnpickedAlloc.Quantity == request.PickedQuantity)
            {
                existingUnpickedAlloc.MarkAsPicked();
            }
            else if (existingUnpickedAlloc.Quantity > request.PickedQuantity)
            {
                // Abate parcial da sugestão e grava a fração separada
                var remainingAllocQty = existingUnpickedAlloc.Quantity - request.PickedQuantity;
                existingUnpickedAlloc.GetType().GetProperty("Quantity")?.SetValue(existingUnpickedAlloc, remainingAllocQty);

                var pickedAlloc = new OutboundAllocation(order.Id, orderItem.Id, hu.Id, request.PickedQuantity);
                pickedAlloc.MarkAsPicked();
                _db.OutboundAllocations.Add(pickedAlloc);
            }
            else
            {
                existingUnpickedAlloc.MarkAsPicked();
            }
        }
        else
        {
            // Operador bipou uma HU diferente da sugerida (Troca / Escolha no Chão)
            var newAlloc = new OutboundAllocation(order.Id, orderItem.Id, hu.Id, request.PickedQuantity);
            newAlloc.MarkAsPicked();
            _db.OutboundAllocations.Add(newAlloc);
        }

        // 5. Atualização dos Baldes do Item e Status da Ordem
        if (orderItem.AllocatedQuantity < orderItem.PickedQuantity + request.PickedQuantity)
        {
            decimal missingAlloc = (orderItem.PickedQuantity + request.PickedQuantity) - orderItem.AllocatedQuantity;
            orderItem.AddAllocatedQuantity(missingAlloc);
        }

        orderItem.AddPickedQuantity(request.PickedQuantity);

        if (order.Status == OutboundOrderStatus.Allocated || order.Status == OutboundOrderStatus.Pending)
        {
            order.UpdateStatus(OutboundOrderStatus.Picking);
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao bipar etiqueta. Tente novamente." });
        }

        decimal newPendingQty = orderItem.ExpectedQuantity - orderItem.PickedQuantity;

        return Results.Ok(new
        {
            Message = $"Coleta de {request.PickedQuantity} realizada com sucesso do LPN {lpnClean}.",
            OrderItemId = orderItem.Id,
            PickedQuantity = orderItem.PickedQuantity,
            PendingQuantity = newPendingQty,
            IsItemFullyPicked = newPendingQty == 0
        });
    }
}

public static class OutboundPickingEndpoints
{
    public static void MapOutboundPickingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/picking/scan", async (PickItemCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}