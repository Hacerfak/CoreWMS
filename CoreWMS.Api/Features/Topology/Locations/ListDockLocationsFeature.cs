using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Locations;

public record ListDockLocationsQuery() : IRequest<IResult>;

public class ListDockLocationsHandler : IRequestHandler<ListDockLocationsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListDockLocationsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListDockLocationsQuery request, CancellationToken ct)
    {
        var docks = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Where(l => l.StorageType.Role == StorageRole.Dock && l.IsActive)
            .Select(l => new { l.Id, l.FullPath, l.BaseCapacity })
            .ToListAsync(ct);

        return Results.Ok(docks);
    }
}

public static class ListDockLocationsEndpoints
{
    public static void MapListDockLocationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/topology/locations/docks", async (IMediator mediator) => await mediator.Send(new ListDockLocationsQuery()))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}