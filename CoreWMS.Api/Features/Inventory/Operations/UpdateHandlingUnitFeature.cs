using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record UpdateHandlingUnitCommand(Guid Id, string? Batch, DateTime? ManufactureDate, DateTime? ExpirationDate, string? SerialNumber) : IRequest<IResult>;

public class UpdateHandlingUnitHandler : IRequestHandler<UpdateHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdateHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdateHandlingUnitCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.Id && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound(new { Message = "HU não encontrada." });

        hu.UpdateTraceability(request.Batch, request.ManufactureDate, request.ExpirationDate, request.SerialNumber);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Esta HU foi alterada por outro usuário simultaneamente. Atualize a tela." });
        }

        return Results.NoContent();
    }
}

public static class UpdateHandlingUnitEndpoints
{
    public static void MapUpdateHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/inventory/handling-units/{id:guid}/traceability", async (Guid id, UpdateHandlingUnitCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.EditTraceability);
    }
}