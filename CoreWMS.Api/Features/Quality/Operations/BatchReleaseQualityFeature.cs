using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality.Operations;

public record BatchReleaseQualityCommand(
    List<Guid>? HandlingUnitIds,
    List<Guid>? EventIds,
    Guid ReasonId,
    string Notes,
    bool ReturnToOriginalLocation = true
) : IRequest<IResult>;

public class BatchReleaseQualityCommandValidator : AbstractValidator<BatchReleaseQualityCommand>
{
    public BatchReleaseQualityCommandValidator()
    {
        RuleFor(x => x)
            .Must(x => (x.HandlingUnitIds != null && x.HandlingUnitIds.Count > 0) ||
                       (x.EventIds != null && x.EventIds.Count > 0))
            .WithMessage("Selecione ao menos uma Unidade de Manuseio (HU) ou ocorrência para liberar.");

        RuleFor(x => x.ReasonId)
            .NotEmpty().WithMessage("Informe o motivo da liberação.");

        RuleFor(x => x.Notes)
            .NotEmpty().MaximumLength(500).WithMessage("Informe o parecer técnico de liberação.");
    }
}

public class BatchReleaseQualityHandler : IRequestHandler<BatchReleaseQualityCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public BatchReleaseQualityHandler(ApplicationDbContext db, ITenantProvider tenant, IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(BatchReleaseQualityCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var inputHuIds = request.HandlingUnitIds ?? new List<Guid>();
        var inputEventIds = request.EventIds ?? new List<Guid>();

        var eventsQuery = _db.QualityEvents
            .Include(q => q.HandlingUnit)
            .Where(q => q.CompanyId == companyId && !q.IsResolved &&
                        (inputHuIds.Contains(q.HandlingUnitId) || inputEventIds.Contains(q.Id)));

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            eventsQuery = eventsQuery.Where(q => allowedIds.Contains(q.HandlingUnit.CustomerId));
        }

        var openEvents = await eventsQuery
            .OrderByDescending(q => q.CreatedAt)
            .ToListAsync(ct);

        var allTargetHuIds = inputHuIds
            .Concat(openEvents.Select(e => e.HandlingUnitId))
            .Distinct()
            .ToList();

        var huQuery = _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && allTargetHuIds.Contains(h.Id));

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            huQuery = huQuery.Where(h => allowedIds.Contains(h.CustomerId));
        }

        var hus = await huQuery.ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio válida encontrada para liberação." });

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId))
            .ToListAsync(ct);

        var originalLocationIds = openEvents
            .Where(e => e.OriginalLocationId.HasValue)
            .Select(e => e.OriginalLocationId!.Value)
            .Distinct()
            .ToList();

        var locationPaths = await _db.Locations
            .AsNoTracking()
            .Where(l => originalLocationIds.Contains(l.Id) && l.IsActive)
            .ToDictionaryAsync(l => l.Id, l => l.FullPath, ct);

        int releasedCount = 0;
        var kardexMovements = new List<RecordKardexMovementItemDto>();

        foreach (var hu in hus)
        {
            var huOpenEvents = openEvents.Where(e => e.HandlingUnitId == hu.Id).ToList();
            if (hu.QualityStatus == QualityStatus.Available && !huOpenEvents.Any())
                continue;

            var oldQualityStatus = hu.QualityStatus;

            foreach (var ev in huOpenEvents)
            {
                ev.Resolve(request.ReasonId, request.Notes.Trim());
            }

            if (oldQualityStatus != QualityStatus.Available)
            {
                hu.ChangeQuality(QualityStatus.Available);

                var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);
                if (hu.Status != HuStatus.Received && balance != null)
                {
                    balance.ChangeQualityForStored(hu.CurrentQuantity, oldQualityStatus, QualityStatus.Available);
                }
            }

            var latestEventWithOrigin = huOpenEvents.FirstOrDefault(e => e.OriginalLocationId.HasValue);
            if (request.ReturnToOriginalLocation &&
                latestEventWithOrigin?.OriginalLocationId is Guid origLocId &&
                hu.CurrentLocationId != origLocId &&
                locationPaths.TryGetValue(origLocId, out var origPath))
            {
                hu.MoveTo(origLocId);

                kardexMovements.Add(new RecordKardexMovementItemDto(
                    CustomerId: hu.CustomerId,
                    ProductId: hu.ProductId,
                    HandlingUnitId: hu.Id,
                    LocationId: origLocId,
                    Type: TransactionType.Internal_Move,
                    QuantityChange: 0m,
                    BalanceAfter: hu.CurrentQuantity,
                    SourceDocumentId: hu.ReceiptDocumentId,
                    SourceDocumentNumber: $"DEVOLUÇÃO PÓS-INSPEÇÃO PARA POSIÇÃO {origPath}",
                    CompanyId: companyId
                ));
            }

            kardexMovements.Add(new RecordKardexMovementItemDto(
                CustomerId: hu.CustomerId,
                ProductId: hu.ProductId,
                HandlingUnitId: hu.Id,
                LocationId: hu.CurrentLocationId,
                Type: TransactionType.Quality_Release,
                QuantityChange: 0m,
                BalanceAfter: hu.CurrentQuantity,
                SourceDocumentId: hu.ReceiptDocumentId,
                SourceDocumentNumber: $"LIBERAÇÃO TÉCNICA ({oldQualityStatus} -> Available): {request.Notes.Trim()}",
                CompanyId: companyId
            ));

            releasedCount++;
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao liberar as HUs. Tente novamente." });
        }

        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        return Results.Ok(new
        {
            ReleasedCount = releasedCount,
            Message = $"{releasedCount} Unidade(s) de Manuseio liberada(s) com sucesso!"
        });
    }
}

public static class BatchReleaseQualityEndpoints
{
    public static void MapBatchReleaseQualityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/quality/release-batch", async ([FromBody] BatchReleaseQualityCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Quality")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}