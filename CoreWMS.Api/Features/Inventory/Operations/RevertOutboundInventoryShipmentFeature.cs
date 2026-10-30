using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record RevertOutboundShipmentItemDto(Guid HandlingUnitId, decimal Quantity);

public record RevertOutboundInventoryShipmentCommand(
    Guid OrderId,
    string OrderNumber,
    Guid CustomerId,
    Guid? TargetLocationId,
    List<RevertOutboundShipmentItemDto> Items
) : IRequest<IResult>;

public class RevertOutboundInventoryShipmentCommandValidator : AbstractValidator<RevertOutboundInventoryShipmentCommand>
{
    public RevertOutboundInventoryShipmentCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("ID da ordem obrigatório.");
        RuleFor(x => x.OrderNumber).NotEmpty().WithMessage("Número da ordem obrigatório.");
        RuleFor(x => x.Items).NotEmpty().WithMessage("Nenhum item informado para estorno de inventário.");
    }
}

public class RevertOutboundInventoryShipmentHandler : IRequestHandler<RevertOutboundInventoryShipmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public RevertOutboundInventoryShipmentHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(RevertOutboundInventoryShipmentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Resolve o endereço de retorno das HUs (doca informada ou primeira posição ativa como fallback)
        var targetLocationId = request.TargetLocationId;
        if (!targetLocationId.HasValue)
        {
            targetLocationId = await _db.Set<Location>()
                .Where(l => l.IsActive)
                .Select(l => (Guid?)l.Id)
                .FirstOrDefaultAsync(ct);
        }

        var huIds = request.Items.Select(i => i.HandlingUnitId).Distinct().ToList();

        // 2. Busca as HUs a serem restauradas
        var hus = await _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && huIds.Contains(h.Id))
            .ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio (HU) encontrada para restauração." });

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();

        // 3. Busca os saldos de estoque correspondentes
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId) && b.CustomerId == request.CustomerId)
            .ToListAsync(ct);

        var kardexMovements = new List<RecordKardexMovementItemDto>();

        foreach (var item in request.Items)
        {
            var hu = hus.FirstOrDefault(h => h.Id == item.HandlingUnitId);
            if (hu == null) continue;

            // A) Restaura saldo, status físico (Stored) e endereço da HU
            hu.RestoreConsumed(item.Quantity, targetLocationId);

            // B) Devolve a quantidade para o balde TotalAllocated no balanço
            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == request.CustomerId);
            if (balance != null)
            {
                balance.RestoreShipped(item.Quantity);
            }

            // C) Prepara movimento compensatório desacoplado para o Kardex
            kardexMovements.Add(new RecordKardexMovementItemDto(
                CustomerId: request.CustomerId,
                ProductId: hu.ProductId,
                HandlingUnitId: hu.Id,
                LocationId: targetLocationId,
                Type: TransactionType.Outbound_Shipment_Revert,
                QuantityChange: item.Quantity,
                BalanceAfter: hu.CurrentQuantity,
                SourceDocumentId: request.OrderId,
                SourceDocumentNumber: $"PEDIDO #{request.OrderNumber} (NF-E CANCELADA)",
                CompanyId: companyId
            ));
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao estornar a expedição no inventário. Tente novamente." });
        }

        // DELEGAÇÃO VIA MEDIATR: Gravação segura em lote no Kardex
        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        return Results.Ok(new { Message = "Estoque das HUs, saldos e Kardex restaurados com sucesso." });
    }
}

public static class RevertOutboundInventoryShipmentEndpoints
{
    public static void MapRevertOutboundInventoryShipmentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/outbound/revert-shipment", async ([FromBody] RevertOutboundInventoryShipmentCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}