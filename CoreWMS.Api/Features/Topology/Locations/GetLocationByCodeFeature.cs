using CoreWMS.Api.Infrastructure.Data;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Locations;

public record LocationLookupDto(
    Guid Id,
    string Code,
    string FullPath,
    Guid StorageTypeId,
    string StorageTypeName,
    int Role,
    int BaseCapacity,
    bool IsActive
);

public record GetLocationByCodeQuery(string Code) : IRequest<IResult>;

public class GetLocationByCodeHandler : IRequestHandler<GetLocationByCodeQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public GetLocationByCodeHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(GetLocationByCodeQuery request, CancellationToken ct)
    {
        var clean = request.Code.Trim().ToUpper();

        var loc = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Where(l => l.IsActive && (l.FullPath.ToUpper() == clean || l.Code.ToUpper() == clean))
            .Select(l => new LocationLookupDto(
                l.Id,
                l.Code,
                l.FullPath,
                l.StorageTypeId,
                l.StorageType.Name,
                (int)l.StorageType.Role,
                l.BaseCapacity,
                l.IsActive
            ))
            .FirstOrDefaultAsync(ct);

        if (loc == null)
            return Results.NotFound(new { Message = $"Endereço '{clean}' não encontrado na Topologia." });

        return Results.Ok(loc);
    }
}

public static class GetLocationByCodeEndpoints
{
    public static void MapGetLocationByCodeEndpoints(this IEndpointRouteBuilder app)
    {
        // Requer apenas autenticação para que qualquer operador do armazém possa bipar endereços
        app.MapGet("/api/topology/locations/by-code/{code}", async (string code, IMediator mediator) =>
            await mediator.Send(new GetLocationByCodeQuery(code)))
           .WithTags("Topology")
           .RequireAuthorization();
    }
}