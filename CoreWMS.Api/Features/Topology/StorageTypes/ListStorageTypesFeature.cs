using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Mapster;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.StorageTypes;

public record ListStorageTypesQuery() : IRequest<IResult>;

public class ListStorageTypesHandler : IRequestHandler<ListStorageTypesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListStorageTypesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListStorageTypesQuery request, CancellationToken ct)
    {
        var types = await _db.StorageTypes.AsNoTracking().ProjectToType<StorageTypeDto>().ToListAsync(ct);
        return Results.Ok(types);
    }
}

public static class ListStorageTypesEndpoints
{
    public static void MapListStorageTypesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/topology/storage-types", async (IMediator mediator) => await mediator.Send(new ListStorageTypesQuery()))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}