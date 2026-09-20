using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Roles;

// 1. Request / Response
public record ListRolesQuery() : IRequest<IResult>;
public record RoleListResponse(Guid Id, string Name, List<string> Permissions, DateTime CreatedAt);

// 2. Handler
public class ListRolesHandler : IRequestHandler<ListRolesQuery, IResult>
{
    private readonly ApplicationDbContext _db;

    public ListRolesHandler(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> Handle(ListRolesQuery request, CancellationToken ct)
    {
        var roles = await _db.Roles
            .Include(r => r.Permissions)
            .AsNoTracking()
            .ToListAsync(ct);

        var response = roles.Select(r => new RoleListResponse(
            r.Id,
            r.Name,
            r.Permissions.Select(p => p.Permission).ToList(),
            r.CreatedAt
        )).ToList();

        return Results.Ok(response);
    }
}

// 3. Endpoint
public static class ListRolesEndpoint
{
    public static void MapListRolesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/roles", async (IMediator mediator) => await mediator.Send(new ListRolesQuery()))
           .WithTags("Roles")
           .RequireAuthorization()
           .RequirePermission(Permissions.Roles.Manage);
    }
}