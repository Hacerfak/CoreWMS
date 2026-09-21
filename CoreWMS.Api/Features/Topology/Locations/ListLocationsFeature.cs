using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Locations;

public record ListLocationsQuery(Guid ZoneId, decimal PalletHeight) : IRequest<IResult>;

public class ListLocationsHandler : IRequestHandler<ListLocationsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListLocationsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListLocationsQuery request, CancellationToken ct)
    {
        var locations = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Include(l => l.Zone).ThenInclude(z => z.Warehouse)
            .Where(l => l.ZoneId == request.ZoneId)
            .ToListAsync(ct);

        var safePalletHeight = request.PalletHeight <= 0 ? 1.5m : request.PalletHeight;

        var dtos = locations.Select(loc =>
        {
            var clearance = loc.Zone.Warehouse.ClearanceHeight;
            int maxCapacity = loc.BaseCapacity;

            if (loc.StorageType.CapacityStrategy == StorageCapacityStrategy.DynamicStacking)
            {
                var maxStacking = (int)Math.Max(1, Math.Floor(clearance / safePalletHeight));
                maxCapacity = loc.BaseCapacity * maxStacking;
            }

            return new LocationDto(
                loc.Id, loc.ZoneId, loc.StorageTypeId, loc.StorageType.Name,
                loc.Code, loc.FullPath, loc.BaseCapacity, loc.IsActive,
                maxCapacity, clearance);
        }).OrderBy(l => l.FullPath).ToList();

        return Results.Ok(dtos);
    }
}

public static class ListLocationsEndpoints
{
    public static void MapListLocationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/topology/locations/{zoneId:guid}", async (Guid zoneId, [FromQuery] decimal? palletHeight, IMediator mediator) =>
            await mediator.Send(new ListLocationsQuery(zoneId, palletHeight ?? 1.5m)))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}