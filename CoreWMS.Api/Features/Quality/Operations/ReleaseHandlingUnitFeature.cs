using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
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
    private readonly KardexChannel _kardex;

    public ReleaseHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
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

        // 3. Devolve para o Endereço Original
        if (qEvent.OriginalLocationId.HasValue && hu.CurrentLocationId != qEvent.OriginalLocationId)
        {
            hu.MoveTo(qEvent.OriginalLocationId.Value);
            await _kardex.WriteAsync(new InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, qEvent.OriginalLocationId.Value, TransactionType.Internal_Move, 0, hu.CurrentQuantity, null, null), ct);
        }

        // 4. Kardex
        await _kardex.WriteAsync(new InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId, TransactionType.Quality_Release, 0, hu.CurrentQuantity, null, null), ct);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência." });
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