using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Zones;

public record ListZonesQuery(Guid WarehouseId, decimal PalletHeight) : IRequest<IResult>;

public class ListZonesHandler : IRequestHandler<ListZonesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListZonesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListZonesQuery request, CancellationToken ct)
    {
        var safePalletHeight = request.PalletHeight <= 0 ? 1.5m : request.PalletHeight;

        var zones = await _db.Zones
            .AsNoTracking()
            .Include(z => z.Warehouse)
            .Include(z => z.Locations)
                .ThenInclude(l => l.StorageType)
            .Where(z => z.WarehouseId == request.WarehouseId)
            .ToListAsync(ct);

        var dtos = zones.Select(z =>
        {
            int totalBase = 0;
            int totalEst = 0;
            var clearance = z.Warehouse.ClearanceHeight;

            foreach (var l in z.Locations)
            {
                totalBase += l.BaseCapacity;
                int locMax = l.BaseCapacity;

                if (l.StorageType.CapacityStrategy == StorageCapacityStrategy.DynamicStacking)
                {
                    var maxStacking = (int)Math.Max(1, Math.Floor(clearance / safePalletHeight));
                    locMax = l.BaseCapacity * maxStacking;
                }
                totalEst += locMax;
            }

            return new ZoneDto(z.Id, z.WarehouseId, z.Code, z.Name, z.IsActive, totalBase, totalEst);
        }).OrderBy(z => z.Code).ToList();

        return Results.Ok(dtos);
    }
}

public static class ListZonesEndpoints
{
    public static void MapListZonesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/topology/zones/{warehouseId:guid}", async (Guid warehouseId, [FromQuery] decimal? palletHeight, IMediator mediator) =>
            await mediator.Send(new ListZonesQuery(warehouseId, palletHeight ?? 1.5m)))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}