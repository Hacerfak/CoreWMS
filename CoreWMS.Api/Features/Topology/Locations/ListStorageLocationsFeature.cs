using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Locations;

public record ListStorageLocationsQuery() : IRequest<IResult>;

public class ListStorageLocationsHandler : IRequestHandler<ListStorageLocationsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListStorageLocationsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListStorageLocationsQuery request, CancellationToken ct)
    {
        var locs = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Where(l => l.StorageType.Role == StorageRole.Storage && l.IsActive)
            .Select(l => new { l.Id, l.FullPath, l.BaseCapacity })
            .OrderBy(l => l.FullPath)
            .ToListAsync(ct);

        return Results.Ok(locs);
    }
}

public static class ListStorageLocationsEndpoints
{
    public static void MapListStorageLocationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/topology/locations/storage", async (IMediator mediator) => await mediator.Send(new ListStorageLocationsQuery()))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}