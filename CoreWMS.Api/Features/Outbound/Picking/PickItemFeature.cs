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

        // 1. Carrega a Ordem e todos os seus Itens para validação de encerramento
        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });
        if (order.Status == OutboundOrderStatus.Canceled || order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Este pedido não está em status válido para separação." });

        var orderItem = order.Items.FirstOrDefault(i => i.Id == request.OrderItemId);
        if (orderItem == null) return Results.NotFound(new { Message = "Item do pedido não encontrado." });

        // Valida se o item ainda possui quantidade pendente
        decimal pendingQty = orderItem.ExpectedQuantity - orderItem.PickedQuantity;
        if (pendingQty <= 0)
            return Results.BadRequest(new { Message = "A quantidade deste item já foi totalmente separada." });

        if (request.PickedQuantity > pendingQty)
            return Results.BadRequest(new { Message = $"A quantidade informada ({request.PickedQuantity}) excede a quantidade pendente ({pendingQty})." });

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

        // 4. A) Registrar ou Consolidar a Linha SEPARADA (IsPicked = true)
        var existingPickedAlloc = await _db.OutboundAllocations
            .FirstOrDefaultAsync(a => a.OutboundOrderId == order.Id &&
                                      a.OutboundOrderItemId == orderItem.Id &&
                                      a.HandlingUnitId == hu.Id &&
                                      a.IsPicked, ct);

        if (existingPickedAlloc != null)
        {
            existingPickedAlloc.UpdateQuantity(existingPickedAlloc.Quantity + request.PickedQuantity);
        }
        else
        {
            var pickedAlloc = new OutboundAllocation(order.Id, orderItem.Id, hu.Id, request.PickedQuantity);
            pickedAlloc.MarkAsPicked();
            _db.OutboundAllocations.Add(pickedAlloc);
        }

        // 4. B) ABATER ou ELIMINAR as Alocações Pendentes (IsPicked = false) deste Item
        // Dá preferência para abater a pendência da mesma HU primeiro, depois as demais pendências
        var unpickedAllocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderId == order.Id &&
                        a.OutboundOrderItemId == orderItem.Id &&
                        !a.IsPicked)
            .OrderByDescending(a => a.HandlingUnitId == hu.Id)
            .ThenBy(a => a.CreatedAt)
            .ToListAsync(ct);

        decimal remainingToAbate = request.PickedQuantity;

        foreach (var unpickedAlloc in unpickedAllocations)
        {
            if (remainingToAbate <= 0) break;

            if (unpickedAlloc.Quantity <= remainingToAbate)
            {
                // A coleta cobre ou excede o saldo da pendência -> Remove a pendência do banco!
                remainingToAbate -= unpickedAlloc.Quantity;
                _db.OutboundAllocations.Remove(unpickedAlloc);
            }
            else
            {
                // Abate parcial da pendência -> Reduz a quantidade restante
                unpickedAlloc.UpdateQuantity(unpickedAlloc.Quantity - remainingToAbate);
                remainingToAbate = 0;
            }
        }

        // 5. Atualiza Baldes de Progresso do Item
        if (orderItem.AllocatedQuantity < orderItem.PickedQuantity + request.PickedQuantity)
        {
            decimal missingAlloc = (orderItem.PickedQuantity + request.PickedQuantity) - orderItem.AllocatedQuantity;
            orderItem.AddAllocatedQuantity(missingAlloc);
        }

        orderItem.AddPickedQuantity(request.PickedQuantity);

        // 6. Atualização Automática do Status da Ordem Principal
        if (order.Items.All(i => i.PickedQuantity >= i.ExpectedQuantity))
        {
            order.UpdateStatus(OutboundOrderStatus.Packing);
        }
        else if (order.Status == OutboundOrderStatus.Allocated || order.Status == OutboundOrderStatus.Pending)
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
        bool isOrderFullyPicked = order.Status == OutboundOrderStatus.Packing;

        return Results.Ok(new
        {
            Message = isOrderFullyPicked
                ? $"Coleta efetuada! Todos os itens do pedido #{order.OrderNumber} foram separados com sucesso."
                : $"Coleta de {request.PickedQuantity} realizada do LPN {lpnClean}.",
            OrderItemId = orderItem.Id,
            PickedQuantity = orderItem.PickedQuantity,
            PendingQuantity = newPendingQty,
            IsItemFullyPicked = newPendingQty == 0,
            IsOrderFullyPicked = isOrderFullyPicked,
            OrderStatus = order.Status.ToString()
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