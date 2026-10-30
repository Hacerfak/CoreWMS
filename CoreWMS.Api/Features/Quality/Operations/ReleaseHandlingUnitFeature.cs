using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality.Operations;

public record ReleaseHandlingUnitCommand(Guid EventId, Guid ReasonId, string Notes) : IRequest<IResult>;

public class ReleaseHandlingUnitCommandValidator : AbstractValidator<ReleaseHandlingUnitCommand>
{
    public ReleaseHandlingUnitCommandValidator()
    {
        RuleFor(x => x.EventId).NotEmpty();
        RuleFor(x => x.ReasonId).NotEmpty();
        RuleFor(x => x.Notes).NotEmpty().MaximumLength(500);
    }
}

public class ReleaseHandlingUnitHandler : IRequestHandler<ReleaseHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public ReleaseHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant, IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(ReleaseHandlingUnitCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var qEvent = await _db.QualityEvents
            .Include(q => q.HandlingUnit)
            .FirstOrDefaultAsync(q => q.Id == request.EventId && q.CompanyId == companyId, ct);

        if (qEvent == null || qEvent.IsResolved)
            return Results.BadRequest(new { Message = "Evento inválido ou já resolvido." });

        var hu = qEvent.HandlingUnit;
        var balance = await _db.InventoryBalances.FirstOrDefaultAsync(b => b.ProductId == hu.ProductId && b.CompanyId == companyId, ct);

        // 1. Resolve o Evento
        qEvent.Resolve(request.ReasonId, request.Notes);

        // 2. Devolve para o Saldo Disponível
        hu.ChangeQuality(QualityStatus.Available);
        balance?.ReleaseFromQuarantine(hu.CurrentQuantity);

        var kardexMovements = new List<RecordKardexMovementItemDto>();

        // 3. Devolve para o Endereço Original
        if (qEvent.OriginalLocationId.HasValue && hu.CurrentLocationId != qEvent.OriginalLocationId)
        {
            hu.MoveTo(qEvent.OriginalLocationId.Value);

            kardexMovements.Add(new RecordKardexMovementItemDto(
                CustomerId: hu.CustomerId,
                ProductId: hu.ProductId,
                HandlingUnitId: hu.Id,
                LocationId: qEvent.OriginalLocationId.Value,
                Type: TransactionType.Internal_Move,
                QuantityChange: 0m,
                BalanceAfter: hu.CurrentQuantity,
                SourceDocumentId: hu.ReceiptDocumentId,
                SourceDocumentNumber: $"DEVOLUÇÃO APÓS INSPEÇÃO PARA POSIÇÃO {qEvent.OriginalLocationId.Value}",
                CompanyId: companyId
            ));
        }

        // 4. Kardex Release
        kardexMovements.Add(new RecordKardexMovementItemDto(
            CustomerId: hu.CustomerId,
            ProductId: hu.ProductId,
            HandlingUnitId: hu.Id,
            LocationId: hu.CurrentLocationId,
            Type: TransactionType.Quality_Release,
            QuantityChange: 0m,
            BalanceAfter: hu.CurrentQuantity,
            SourceDocumentId: hu.ReceiptDocumentId,
            SourceDocumentNumber: $"LIBERAÇÃO DE QUALIDADE: {request.Notes}",
            CompanyId: companyId
        ));

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência." });
        }

        // DELEGAÇÃO VIA MEDIATR: Gravação segura em lote no Kardex
        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        return Results.NoContent();
    }
}

public static class ReleaseHandlingUnitEndpoints
{
    public static void MapReleaseHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/quality/events/{eventId:guid}/release", async (Guid eventId, ReleaseHandlingUnitCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { EventId = eventId }))
           .WithTags("Quality")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}