using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Packing;

// ====================================================================
// DTOS & COMANDOS (MOMENTO 1: APONTAMENTO OPERACIONAL ITEM A ITEM)
// ====================================================================

public record ItemPackVolumeDto(
    Guid PackagingTypeId,
    int VolumeCount,
    decimal QuantityPerVolume
);

public record OutboundItemPackDetailDto(
    Guid Id,
    Guid PackagingTypeId,
    string PackagingTypeCode,
    string PackagingTypeDescription,
    int VolumeCount,
    decimal QuantityPerVolume,
    decimal TotalQuantity
);

public record OrderItemPackingStatusDto(
    Guid OrderItemId,
    string SkuCode,
    string Description,
    string Unit,
    decimal ExpectedQuantity,
    decimal PickedQuantity,
    decimal PackedQuantity,
    bool IsPacked,
    List<OutboundItemPackDetailDto> Packs
);

public record PackOrderItemCommand(
    Guid OrderId,
    Guid OrderItemId,
    List<ItemPackVolumeDto> Packs
) : IRequest<IResult>;

public record GetOrderItemPacksQuery(
    Guid OrderId,
    Guid OrderItemId
) : IRequest<IResult>;

// ====================================================================
// VALIDAÇÃO
// ====================================================================

public class PackOrderItemCommandValidator : AbstractValidator<PackOrderItemCommand>
{
    public PackOrderItemCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("O identificador do pedido é obrigatório.");
        RuleFor(x => x.OrderItemId).NotEmpty().WithMessage("O identificador do item é obrigatório.");
        RuleFor(x => x.Packs).NotEmpty().WithMessage("Informe ao menos uma embalagem/volume para o item.");
        RuleForEach(x => x.Packs).ChildRules(p =>
        {
            p.RuleFor(x => x.PackagingTypeId).NotEmpty().WithMessage("O tipo de embalagem é obrigatório.");
            p.RuleFor(x => x.VolumeCount).GreaterThan(0).WithMessage("A quantidade de volumes deve ser maior que zero.");
            p.RuleFor(x => x.QuantityPerVolume).GreaterThan(0).WithMessage("A quantidade de peças por volume deve ser maior que zero.");
        });
    }
}

// ====================================================================
// HANDLER: SALVAR APONTAMENTO DO ITEM (MOMENTO 1)
// ====================================================================

public class PackOrderItemHandler : IRequestHandler<PackOrderItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public PackOrderItemHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(PackOrderItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status != OutboundOrderStatus.Picking &&
            order.Status != OutboundOrderStatus.Allocated &&
            order.Status != OutboundOrderStatus.Packing)
        {
            return Results.BadRequest(new
            {
                Message = $"O pedido #{order.OrderNumber} está com status '{order.Status}' e não permite apontamento de embalagens."
            });
        }

        var orderItem = order.Items.FirstOrDefault(i => i.Id == request.OrderItemId);
        if (orderItem == null)
            return Results.NotFound(new { Message = "Item do pedido não encontrado." });

        if (orderItem.PickedQuantity < orderItem.ExpectedQuantity)
        {
            return Results.BadRequest(new
            {
                Message = $"O item {orderItem.SkuCode} ainda possui separação pendente no coletor ({orderItem.PickedQuantity}/{orderItem.ExpectedQuantity}). Conclua o picking antes do packing."
            });
        }

        // Validação da integridade das quantidades: a soma das peças apontadas DEVE fechar com a quantidade separada
        decimal totalPointedQuantity = request.Packs.Sum(p => p.VolumeCount * p.QuantityPerVolume);

        if (totalPointedQuantity != orderItem.PickedQuantity)
        {
            return Results.BadRequest(new
            {
                Message = $"A quantidade total apontada ({totalPointedQuantity}) diverge da quantidade separada no armazém ({orderItem.PickedQuantity} {orderItem.Product?.BaseUnit ?? "UN"}). Ajuste os volumes ou o fator das embalagens."
            });
        }

        // Valida se os tipos de embalagens existem no sistema
        var packTypeIds = request.Packs.Select(p => p.PackagingTypeId).Distinct().ToList();
        var existingCount = await _db.PackagingTypes.CountAsync(pt => packTypeIds.Contains(pt.Id), ct);
        if (existingCount != packTypeIds.Count)
        {
            return Results.BadRequest(new { Message = "Um ou mais tipos de embalagens selecionados são inválidos." });
        }

        // Substitui apontamentos anteriores deste item (permite re-apontamento/correções)
        var existingPacks = await _db.OutboundItemPacks
            .Where(p => p.OutboundOrderItemId == orderItem.Id)
            .ToListAsync(ct);

        if (existingPacks.Any())
        {
            _db.OutboundItemPacks.RemoveRange(existingPacks);
        }

        var newPacks = request.Packs.Select(p => new OutboundItemPack(
            order.Id,
            orderItem.Id,
            p.PackagingTypeId,
            p.VolumeCount,
            p.QuantityPerVolume
        )).ToList();

        _db.OutboundItemPacks.AddRange(newPacks);

        // Atualiza a quantidade empacotada no item
        if (orderItem.PackedQuantity < totalPointedQuantity)
        {
            orderItem.AddPackedQuantity(totalPointedQuantity - orderItem.PackedQuantity);
        }

        // Se todos os itens da ordem completaram o Momento 1, atualiza o status do pedido para Packing
        bool allItemsPacked = order.Items.All(i =>
            i.Id == orderItem.Id || i.Status == OutboundOrderItemStatus.Packed || i.PackedQuantity >= i.ExpectedQuantity);

        if (allItemsPacked)
        {
            order.UpdateStatus(OutboundOrderStatus.Packing);
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Conferência do item {orderItem.SkuCode} concluída com sucesso! ({request.Packs.Sum(p => p.VolumeCount)} volumes apontados).",
            OrderItemId = orderItem.Id,
            TotalPiecesPacked = totalPointedQuantity,
            IsItemPacked = orderItem.Status == OutboundOrderItemStatus.Packed,
            IsOrderReadyForStage2 = allItemsPacked
        });
    }
}

// ====================================================================
// HANDLER: CONSULTAR APONTAMENTO ATUAL DO ITEM (MOMENTO 1)
// ====================================================================

public class GetOrderItemPacksHandler : IRequestHandler<GetOrderItemPacksQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetOrderItemPacksHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetOrderItemPacksQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var item = await _db.OutboundOrderItems
            .AsNoTracking()
            .Include(i => i.Product)
            .Include(i => i.OutboundOrder)
            .FirstOrDefaultAsync(i => i.Id == request.OrderItemId &&
                                      i.OutboundOrderId == request.OrderId &&
                                      i.OutboundOrder.CompanyId == companyId, ct);

        if (item == null)
            return Results.NotFound(new { Message = "Item do pedido não encontrado." });

        var packs = await _db.OutboundItemPacks
            .AsNoTracking()
            .Include(p => p.PackagingType)
            .Where(p => p.OutboundOrderItemId == item.Id)
            .Select(p => new OutboundItemPackDetailDto(
                p.Id,
                p.PackagingTypeId,
                p.PackagingType.Code,
                p.PackagingType.Description,
                p.VolumeCount,
                p.QuantityPerVolume,
                p.VolumeCount * p.QuantityPerVolume
            ))
            .ToListAsync(ct);

        var dto = new OrderItemPackingStatusDto(
            item.Id,
            item.SkuCode,
            item.Product?.Description ?? item.SkuCode,
            item.Product?.BaseUnit ?? "UN",
            item.ExpectedQuantity,
            item.PickedQuantity,
            item.PackedQuantity,
            item.Status == OutboundOrderItemStatus.Packed || item.PackedQuantity >= item.ExpectedQuantity,
            packs
        );

        return Results.Ok(dto);
    }
}

// ====================================================================
// MAPEAMENTO DOS ENDPOINTS
// ====================================================================

public static class PackOrderItemEndpoints
{
    public static void MapPackOrderItemEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbound/packing").WithTags("Outbound").RequireAuthorization();

        // Salvar apontamento do item no Momento 1
        group.MapPost("/orders/{orderId:guid}/items/{orderItemId:guid}", async (
            Guid orderId,
            Guid orderItemId,
            PackOrderItemCommand cmd,
            IMediator mediator) =>
        {
            var command = cmd with { OrderId = orderId, OrderItemId = orderItemId };
            return await mediator.Send(command);
        })
        .RequirePermission(Permissions.Outbound.Manage);

        // Consultar apontamentos existentes do item
        group.MapGet("/orders/{orderId:guid}/items/{orderItemId:guid}", async (
            Guid orderId,
            Guid orderItemId,
            IMediator mediator) =>
        {
            return await mediator.Send(new GetOrderItemPacksQuery(orderId, orderItemId));
        })
        .RequirePermission(Permissions.Outbound.View);
    }
}