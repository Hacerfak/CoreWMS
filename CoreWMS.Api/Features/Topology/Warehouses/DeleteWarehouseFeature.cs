using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Warehouses;

public record DeleteWarehouseCommand(Guid Id) : IRequest<IResult>;

public class DeleteWarehouseHandler : IRequestHandler<DeleteWarehouseCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteWarehouseHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteWarehouseCommand request, CancellationToken ct)
    {
        var warehouse = await _db.Warehouses.FindAsync(new object[] { request.Id }, ct);
        if (warehouse == null) return Results.NotFound();

        try
        {
            _db.Warehouses.Remove(warehouse);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir este pavilhão pois existem Zonas/Corredores cadastrados dentro dele." });
        }

        return Results.NoContent();
    }
}

public static class DeleteWarehouseEndpoints
{
    public static void MapDeleteWarehouseEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/topology/warehouses/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteWarehouseCommand(id)))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}