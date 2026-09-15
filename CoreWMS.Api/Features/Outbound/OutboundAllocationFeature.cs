using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound;

public record AllocateOutboundOrderCommand(Guid OrderId) : IRequest<IResult>;

public class AllocateOutboundOrderHandler : IRequestHandler<AllocateOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public AllocateOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(AllocateOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Busca a Ordem e os Itens que ainda precisam de Alocação
        var order = await _db.OutboundOrders
            .Include(o => o.Items)
                .ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido não encontrado." });

        if (order.Status == OutboundOrderStatus.Allocated || order.Status == OutboundOrderStatus.Canceled || order.Status == OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "Este pedido não está em um status válido para alocação." });

        order.UpdateStatus(OutboundOrderStatus.Allocating);

        var itemsToAllocate = order.Items.Where(i => i.ExpectedQuantity > i.AllocatedQuantity).ToList();
        var errors = new List<string>();

        foreach (var item in itemsToAllocate)
        {
            var qtyNeeded = item.ExpectedQuantity - item.AllocatedQuantity;

            // 2. Query Inteligente: Busca HUs armazenadas e já calcula o saldo real sobrando nela usando Subquery
            var huQuery = _db.HandlingUnits
                .Where(h => h.CompanyId == companyId &&
                            h.ProductId == item.ProductId &&
                            h.CustomerId == order.CustomerId &&
                            h.Status == HuStatus.Stored &&
                            h.QualityStatus == QualityStatus.Available)
                .Select(h => new
                {
                    Hu = h,
                    // Subtrai alocações pendentes de outras ordens que apontam para esta mesma HU
                    AllocatedAlready = _db.OutboundAllocations.Where(a => a.HandlingUnitId == h.Id && !a.IsPicked).Sum(a => (decimal?)a.Quantity) ?? 0m
                })
                .Where(x => x.Hu.CurrentQuantity > x.AllocatedAlready); // Só traz HUs que ainda tem espaço livre

            // 3. Aplica a Regra de Negócio (Estratégia de Separação)
            if (item.Product.PickingStrategy == PickingStrategy.Fefo)
            {
                // FEFO: Vence primeiro, sai primeiro
                huQuery = huQuery.OrderBy(x => x.Hu.ExpirationDate).ThenBy(x => x.Hu.CreatedAt);
            }
            else if (item.Product.PickingStrategy == PickingStrategy.Fifo)
            {
                // FIFO: Entrou primeiro, sai primeiro
                huQuery = huQuery.OrderBy(x => x.Hu.CreatedAt);
            }
            else
            {
                // LIFO: Último a entrar, sai primeiro (Blocado)
                huQuery = huQuery.OrderByDescending(x => x.Hu.CreatedAt);
            }

            var availableHus = await huQuery.ToListAsync(ct);
            decimal totalAllocatedInThisRun = 0;

            // 4. Executa as Reservas Físicas
            foreach (var huData in availableHus)
            {
                if (qtyNeeded <= 0) break;

                var huAvailableQty = huData.Hu.CurrentQuantity - huData.AllocatedAlready;
                if (huAvailableQty <= 0) continue;

                var qtyToTake = Math.Min(qtyNeeded, huAvailableQty);

                // Cria a tarefa para o Coletor
                var allocation = new OutboundAllocation(order.Id, item.Id, huData.Hu.Id, qtyToTake);
                _db.OutboundAllocations.Add(allocation);

                item.AddAllocatedQuantity(qtyToTake);
                qtyNeeded -= qtyToTake;
                totalAllocatedInThisRun += qtyToTake;
            }

            // 5. Move o saldo lógico (InventoryBalance) de "Disponível" para "Alocado"
            if (totalAllocatedInThisRun > 0)
            {
                var balance = await _db.InventoryBalances.FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == item.ProductId && b.CustomerId == order.CustomerId, ct);
                if (balance != null)
                {
                    balance.AllocateForPicking(totalAllocatedInThisRun);
                }
            }

            if (qtyNeeded > 0)
            {
                errors.Add($"Estoque insuficiente para o Produto SKU {item.SkuCode}. Faltou alocar {qtyNeeded}.");
            }
        }

        // Se todos os itens da Ordem atingiram 100% de alocação, atualiza o status master
        if (order.Items.All(i => i.Status == OutboundOrderItemStatus.Allocated || i.Status == OutboundOrderItemStatus.Picked || i.Status == OutboundOrderItemStatus.Packed))
        {
            order.UpdateStatus(OutboundOrderStatus.Allocated);
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de alocação (Outro operador reservou o estoque ao mesmo tempo). Tente novamente." });
        }

        return Results.Ok(new
        {
            Message = errors.Any() ? "Alocação parcial concluída com avisos de falta de estoque." : "Alocação 100% concluída.",
            Status = order.Status.ToString(),
            Shortages = errors
        });
    }
}

public static class OutboundAllocationEndpoints
{
    public static void MapOutboundAllocationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbound/orders").WithTags("Outbound").RequireAuthorization();

        group.MapPost("/{id:guid}/allocate", async (Guid id, IMediator mediator) => await mediator.Send(new AllocateOutboundOrderCommand(id)))
             .RequirePermission(Permissions.Outbound.Manage);
    }
}