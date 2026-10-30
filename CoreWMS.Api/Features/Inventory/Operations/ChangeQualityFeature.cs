using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record ChangeQualityCommand(List<Guid> HandlingUnitIds, QualityStatus NewStatus, string? Reason) : IRequest<IResult>;

public class ChangeQualityCommandValidator : AbstractValidator<ChangeQualityCommand>
{
    public ChangeQualityCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Selecione ao menos uma Unidade de Manuseio (HU).");
        RuleFor(x => x.NewStatus).IsInEnum().WithMessage("Status de qualidade inválido.");
        RuleFor(x => x.Reason).MaximumLength(250).WithMessage("O motivo deve ter no máximo 250 caracteres.");
    }
}

public class ChangeQualityHandler : IRequestHandler<ChangeQualityCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public ChangeQualityHandler(ApplicationDbContext db, ITenantProvider tenant, IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(ChangeQualityCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id));

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(h => allowedIds.Contains(h.CustomerId));
        }

        var hus = await query.ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio (HU) válida foi encontrada." });

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();

        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId))
            .ToListAsync(ct);

        int updatedCount = 0;
        var kardexMovements = new List<RecordKardexMovementItemDto>();

        foreach (var hu in hus)
        {
            if (hu.QualityStatus == request.NewStatus) continue;

            var oldStatus = hu.QualityStatus;
            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);

            // Só altera as gavetas do InventoryBalance se a HU JÁ FOI ARMAZENADA (Stored).
            // Se estiver na Doca (Received), continua no balde TotalDock!
            if (hu.Status != HuStatus.Received && balance != null)
            {
                balance.ChangeQualityForStored(hu.CurrentQuantity, oldStatus, request.NewStatus);
            }

            hu.ChangeQuality(request.NewStatus);

            var movementType = request.NewStatus == QualityStatus.Available
                ? TransactionType.Quality_Release
                : TransactionType.Quality_Hold;

            var reasonText = $"ALTERAÇÃO QUALIDADE ({oldStatus} -> {request.NewStatus}): {request.Reason ?? "Sem observação"}";

            kardexMovements.Add(new RecordKardexMovementItemDto(
                CustomerId: hu.CustomerId,
                ProductId: hu.ProductId,
                HandlingUnitId: hu.Id,
                LocationId: hu.CurrentLocationId,
                Type: movementType,
                QuantityChange: 0m,
                BalanceAfter: hu.CurrentQuantity,
                SourceDocumentId: hu.ReceiptDocumentId,
                SourceDocumentNumber: reasonText,
                CompanyId: companyId
            ));

            updatedCount++;
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao atualizar a qualidade dos itens. Tente novamente." });
        }

        // DELEGAÇÃO VIA MEDIATR: Gravação segura em lote no Kardex
        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        return Results.Ok(new
        {
            Message = $"{updatedCount} Unidade(s) de Manuseio atualizada(s) para o status '{request.NewStatus}'.",
            UpdatedCount = updatedCount
        });
    }
}

public static class ChangeQualityEndpoints
{
    public static void MapChangeQualityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/handling-units/quality", async (ChangeQualityCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}