using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record RollbackKardexByHandlingUnitsCommand(List<Guid> HandlingUnitIds, string? Reason = null) : IRequest<IResult>;

public class RollbackKardexByHandlingUnitsCommandValidator : AbstractValidator<RollbackKardexByHandlingUnitsCommand>
{
    public RollbackKardexByHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Informe ao menos uma HU para estorno no Kardex.");
    }
}

public class RollbackKardexByHandlingUnitsHandler : IRequestHandler<RollbackKardexByHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public RollbackKardexByHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant, IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(RollbackKardexByHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var hus = await _db.HandlingUnits
            .AsNoTracking()
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id))
            .ToListAsync(ct);

        if (!hus.Any())
            return Results.Ok(new { Message = "Nenhuma HU encontrada para processamento no Kardex." });

        // 1. Prepara a saída contábil de estorno no Kardex para cada volume
        var kardexMovements = hus.Select(hu => new RecordKardexMovementItemDto(
            CustomerId: hu.CustomerId,
            ProductId: hu.ProductId,
            HandlingUnitId: null, // Nulo para desvincular do registro que será expurgado
            LocationId: hu.CurrentLocationId,
            Type: TransactionType.Inbound_Receipt_Rollback,
            QuantityChange: -hu.CurrentQuantity,
            BalanceAfter: 0m,
            SourceDocumentId: hu.ReceiptDocumentId,
            SourceDocumentNumber: $"ESTORNO HU {hu.Lpn} (Qualidade: {hu.QualityStatus}) - {request.Reason ?? "Estorno de Recebimento"}",
            CompanyId: companyId
        )).ToList();

        // 2. Desvincula o HandlingUnitId de transações passadas do Kardex para evitar erro de Foreign Key
        await _db.InventoryTransactions
            .Where(t => t.CompanyId == companyId && t.HandlingUnitId.HasValue && request.HandlingUnitIds.Contains(t.HandlingUnitId.Value))
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.HandlingUnitId, (Guid?)null), ct);

        // 3. DELEGAÇÃO VIA MEDIATR: Gravação desacoplada em lote no Kardex
        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        return Results.Ok(new { Message = "Kardex atualizado e desvinculado com sucesso." });
    }
}

public static class RollbackKardexByHandlingUnitsEndpoints
{
    public static void MapRollbackKardexByHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/kardex/rollback-by-hus", async (RollbackKardexByHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}