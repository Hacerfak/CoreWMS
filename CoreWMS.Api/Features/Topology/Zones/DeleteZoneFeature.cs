using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Zones;

public record DeleteZoneCommand(Guid Id) : IRequest<IResult>;

public class DeleteZoneHandler : IRequestHandler<DeleteZoneCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteZoneHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteZoneCommand request, CancellationToken ct)
    {
        var zone = await _db.Zones.FindAsync(new object[] { request.Id }, ct);
        if (zone == null) return Results.NotFound();

        try
        {
            _db.Zones.Remove(zone);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir esta zona pois existem endereços vinculados a ela." });
        }

        return Results.NoContent();
    }
}

public static class DeleteZoneEndpoints
{
    public static void MapDeleteZoneEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/topology/zones/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteZoneCommand(id)))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}