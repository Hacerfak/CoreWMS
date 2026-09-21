using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record ChangeQualityCommand(Guid Id, QualityStatus NewStatus) : IRequest<IResult>;

public class ChangeQualityCommandValidator : AbstractValidator<ChangeQualityCommand>
{
    public ChangeQualityCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.NewStatus).IsInEnum();
    }
}

public class ChangeQualityHandler : IRequestHandler<ChangeQualityCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public ChangeQualityHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(ChangeQualityCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.Id && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound();

        if (hu.QualityStatus == request.NewStatus) return Results.Ok();

        var balance = await _db.InventoryBalances.FirstOrDefaultAsync(b => b.ProductId == hu.ProductId && b.CompanyId == companyId, ct);
        if (balance == null) return Results.BadRequest(new { Message = "Saldo não encontrado." });

        if (request.NewStatus == QualityStatus.Quarantine && hu.QualityStatus == QualityStatus.Available)
        {
            balance.Quarantine(hu.CurrentQuantity);
            await _kardex.WriteAsync(new InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId, TransactionType.Quality_Hold, 0, hu.CurrentQuantity, null, null), ct);
        }
        else if (request.NewStatus == QualityStatus.Available && hu.QualityStatus == QualityStatus.Quarantine)
        {
            balance.ReleaseFromQuarantine(hu.CurrentQuantity);
            await _kardex.WriteAsync(new InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId, TransactionType.Quality_Release, 0, hu.CurrentQuantity, null, null), ct);
        }

        hu.ChangeQuality(request.NewStatus);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao alterar status de qualidade da HU e Saldo." });
        }

        return Results.NoContent();
    }
}

public static class ChangeQualityEndpoints
{
    public static void MapChangeQualityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/handling-units/{id:guid}/quality", async (Guid id, ChangeQualityCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}