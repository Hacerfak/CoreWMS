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
    Guid? OrderItemId,
    string ScannedLpn,
    decimal PickedQuantity
) : IRequest<IResult>;

public class PickItemCommandValidator : AbstractValidator<PickItemCommand>
{
    public PickItemCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("O identificador do pedido é obrigatório.");
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

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
                .ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status == OutboundOrderStatus.Canceled || order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Este pedido não está em status válido para separação." });

        // 1. Localiza a HU bipada no estoque do depositante
        var lpnClean = request.ScannedLpn.Trim().ToUpper();
        var hu = await _db.HandlingUnits
            .Include(h => h.CurrentLocation)
            .Include(h => h.Product)
            .FirstOrDefaultAsync(h => h.CompanyId == companyId && h.CustomerId == order.CustomerId && h.Lpn == lpnClean, ct);

        if (hu == null)
            return Results.BadRequest(new { Message = $"A etiqueta LPN '{lpnClean}' não foi encontrada em estoque para este depositante." });

        if (hu.QualityStatus != QualityStatus.Available)
            return Results.BadRequest(new { Message = $"A etiqueta '{lpnClean}' está bloqueada/em quarentena e não pode ser expedida." });

        if (hu.Status != HuStatus.Stored && hu.Status != HuStatus.Received)
            return Results.BadRequest(new { Message = $"A etiqueta '{lpnClean}' não está em status de estoque disponível." });

        // 2. Vincula e valida com o item do pedido (seja informado ou identificado automaticamente pelo Produto da HU)
        OutboundOrderItem? orderItem = null;

        if (request.OrderItemId.HasValue && request.OrderItemId.Value != Guid.Empty)
        {
            orderItem = order.Items.FirstOrDefault(i => i.Id == request.OrderItemId.Value);
        }

        if (orderItem == null || orderItem.ProductId != hu.ProductId)
        {
            // Busca o item da ordem correspondente ao produto da HU que ainda tenha quantidade pendente
            var matchingItem = order.Items.FirstOrDefault(i => i.ProductId == hu.ProductId && i.PickedQuantity < i.ExpectedQuantity);
            matchingItem ??= order.Items.FirstOrDefault(i => i.ProductId == hu.ProductId);

            if (matchingItem == null)
            {
                var huProductName = hu.Product?.Sku ?? "Produto não identificado";
                return Results.BadRequest(new { Message = $"A etiqueta LPN '{lpnClean}' ({huProductName}) pertence a um produto que não faz parte deste pedido." });
            }

            orderItem = matchingItem;
        }

        decimal pendingQty = orderItem.ExpectedQuantity - orderItem.PickedQuantity;
        if (pendingQty <= 0)
            return Results.BadRequest(new { Message = $"O SKU {orderItem.SkuCode} já foi 100% separado neste pedido." });

        if (request.PickedQuantity > pendingQty)
            return Results.BadRequest(new { Message = $"A quantidade ({request.PickedQuantity}) excede o saldo pendente do SKU {orderItem.SkuCode} (Pendente: {pendingQty} {orderItem.Product?.BaseUnit ?? "UN"})." });

        // 3. Validação de Saldo Livre na HU (descontando separações anteriores)
        var alreadyPickedQtyOnHu = await _db.OutboundAllocations
            .Where(a => a.HandlingUnitId == hu.Id && a.IsPicked)
            .SumAsync(a => (decimal?)a.Quantity, ct) ?? 0m;

        decimal freeQtyOnHu = hu.CurrentQuantity - alreadyPickedQtyOnHu;
        if (request.PickedQuantity > freeQtyOnHu)
            return Results.BadRequest(new { Message = $"A etiqueta '{lpnClean}' não possui saldo livre suficiente. Disponível: {freeQtyOnHu}, Solicitado: {request.PickedQuantity}." });

        // 4. Grava a Alocação Separada (IsPicked = true)
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

        // 5. Abate as alocações pendentes (IsPicked = false)
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
                remainingToAbate -= unpickedAlloc.Quantity;
                _db.OutboundAllocations.Remove(unpickedAlloc);
            }
            else
            {
                unpickedAlloc.UpdateQuantity(unpickedAlloc.Quantity - remainingToAbate);
                remainingToAbate = 0;
            }
        }

        // 6. Atualiza progresso do item
        if (orderItem.AllocatedQuantity < orderItem.PickedQuantity + request.PickedQuantity)
        {
            decimal missingAlloc = (orderItem.PickedQuantity + request.PickedQuantity) - orderItem.AllocatedQuantity;
            orderItem.AddAllocatedQuantity(missingAlloc);
        }

        orderItem.AddPickedQuantity(request.PickedQuantity);

        // 7. Atualização do status da ordem
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
                ? $"Todos os itens do pedido #{order.OrderNumber} foram 100% separados!"
                : $"Coleta de {request.PickedQuantity} do SKU {orderItem.SkuCode} registrada com sucesso (LPN: {lpnClean})!",
            OrderItemId = orderItem.Id,
            SkuCode = orderItem.SkuCode,
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