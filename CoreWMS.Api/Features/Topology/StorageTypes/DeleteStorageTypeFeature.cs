using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.StorageTypes;

public record DeleteStorageTypeCommand(Guid Id) : IRequest<IResult>;

public class DeleteStorageTypeHandler : IRequestHandler<DeleteStorageTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteStorageTypeHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteStorageTypeCommand request, CancellationToken ct)
    {
        var storageType = await _db.StorageTypes.FindAsync(new object[] { request.Id }, ct);
        if (storageType == null) return Results.NotFound();

        if (await _db.Locations.AnyAsync(l => l.StorageTypeId == request.Id, ct))
            return Results.BadRequest(new { Message = "Não é possível excluir este Tipo pois existem endereços físicos atrelados a ele." });

        _db.StorageTypes.Remove(storageType);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public static class DeleteStorageTypeEndpoints
{
    public static void MapDeleteStorageTypeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/topology/storage-types/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteStorageTypeCommand(id)))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}