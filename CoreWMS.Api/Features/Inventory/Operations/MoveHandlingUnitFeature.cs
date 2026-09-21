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

public record MoveHandlingUnitCommand(Guid Id, Guid DestinationLocationId) : IRequest<IResult>;

public class MoveHandlingUnitCommandValidator : AbstractValidator<MoveHandlingUnitCommand>
{
    public MoveHandlingUnitCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.DestinationLocationId).NotEmpty();
    }
}

public class MoveHandlingUnitHandler : IRequestHandler<MoveHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public MoveHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(MoveHandlingUnitCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.Id && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound();

        if (!await _db.Locations.AnyAsync(l => l.Id == request.DestinationLocationId, ct))
            return Results.BadRequest(new { Message = "Endereço de destino inválido." });

        hu.MoveTo(request.DestinationLocationId);

        var transaction = new InventoryTransaction(
            companyId, hu.CustomerId, hu.ProductId, hu.Id,
            request.DestinationLocationId, TransactionType.Internal_Move,
            0, hu.CurrentQuantity, null, null);

        await _kardex.WriteAsync(transaction, ct);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao mover a HU." });
        }

        return Results.NoContent();
    }
}

public static class MoveHandlingUnitEndpoints
{
    public static void MapMoveHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/handling-units/{id:guid}/move", async (Guid id, MoveHandlingUnitCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}