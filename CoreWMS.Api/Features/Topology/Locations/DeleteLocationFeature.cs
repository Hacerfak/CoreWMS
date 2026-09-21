using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Locations;

public record DeleteLocationCommand(Guid Id) : IRequest<IResult>;

public class DeleteLocationHandler : IRequestHandler<DeleteLocationCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteLocationHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteLocationCommand request, CancellationToken ct)
    {
        var location = await _db.Locations.FindAsync(new object[] { request.Id }, ct);
        if (location == null) return Results.NotFound();

        try
        {
            _db.Locations.Remove(location);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir este endereço pois existem operações atreladas a ele. Sugerimos Inativá-lo." });
        }

        return Results.NoContent();
    }
}

public static class DeleteLocationEndpoints
{
    public static void MapDeleteLocationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/topology/locations/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteLocationCommand(id)))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}