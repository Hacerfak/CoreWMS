using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Locations;

public record ListQualityLocationsQuery() : IRequest<IResult>;

public class ListQualityLocationsHandler : IRequestHandler<ListQualityLocationsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListQualityLocationsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListQualityLocationsQuery request, CancellationToken ct)
    {
        var qualityLocs = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Where(l => l.StorageType.Role == StorageRole.Quality && l.IsActive)
            .Select(l => new { l.Id, l.FullPath, l.BaseCapacity })
            .OrderBy(l => l.FullPath)
            .ToListAsync(ct);

        return Results.Ok(qualityLocs);
    }
}

public static class ListQualityLocationsEndpoints
{
    public static void MapListQualityLocationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/topology/locations/quality", async (IMediator mediator) => await mediator.Send(new ListQualityLocationsQuery()))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}