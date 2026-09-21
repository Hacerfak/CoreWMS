using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Warehouses;

public record ListWarehousesQuery(decimal PalletHeight) : IRequest<IResult>;

public class ListWarehousesHandler : IRequestHandler<ListWarehousesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListWarehousesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListWarehousesQuery request, CancellationToken ct)
    {
        // Previne divisão por zero caso enviem altura incorreta
        var safePalletHeight = request.PalletHeight <= 0 ? 1.5m : request.PalletHeight;

        var warehouses = await _db.Warehouses
            .AsNoTracking()
            .Include(w => w.Zones)
                .ThenInclude(z => z.Locations)
                    .ThenInclude(l => l.StorageType)
            .ToListAsync(ct);

        var dtos = warehouses.Select(w =>
        {
            int totalBase = 0;
            int totalEst = 0;

            foreach (var z in w.Zones)
            {
                foreach (var l in z.Locations)
                {
                    totalBase += l.BaseCapacity;
                    int locMax = l.BaseCapacity;

                    if (l.StorageType.CapacityStrategy == StorageCapacityStrategy.DynamicStacking)
                    {
                        var maxStacking = (int)Math.Max(1, Math.Floor(w.ClearanceHeight / safePalletHeight));
                        locMax = l.BaseCapacity * maxStacking;
                    }
                    totalEst += locMax;
                }
            }
            return new WarehouseDto(w.Id, w.Code, w.Name, w.ClearanceHeight, w.IsActive, totalBase, totalEst);
        }).OrderBy(w => w.Code).ToList();

        return Results.Ok(dtos);
    }
}

public static class ListWarehousesEndpoints
{
    public static void MapListWarehousesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/topology/warehouses", async ([FromQuery] decimal? palletHeight, IMediator mediator) =>
            await mediator.Send(new ListWarehousesQuery(palletHeight ?? 1.5m)))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}