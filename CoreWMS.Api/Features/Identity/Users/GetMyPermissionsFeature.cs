using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace CoreWMS.Api.Features.Identity.Users;

// 1. Request
public record GetMyPermissionsQuery(Guid UserId, bool IsMaster, Guid CompanyId) : IRequest<List<string>>;

// 2. Handler
public class GetMyPermissionsHandler : IRequestHandler<GetMyPermissionsQuery, List<string>>
{
    private readonly ApplicationDbContext _db;
    public GetMyPermissionsHandler(ApplicationDbContext db) => _db = db;

    public async Task<List<string>> Handle(GetMyPermissionsQuery request, CancellationToken ct)
    {
        if (request.IsMaster) return new List<string> { "*" };

        if (request.CompanyId == Guid.Empty)
            throw new InvalidOperationException("Cabeçalho X-Company-Id é obrigatório.");

        var permissions = await _db.UserCompanyRoles
            .Where(ucr => ucr.UserId == request.UserId && ucr.CompanyId == request.CompanyId)
            .SelectMany(ucr => ucr.Role.Permissions)
            .Select(p => p.Permission)
            .AsNoTracking() // Optimization for reads
            .ToListAsync(ct);

        return permissions;
    }
}

// 3. Endpoint
public static class GetMyPermissionsEndpoint
{
    public static void MapGetMyPermissionsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/users/me/permissions", async (HttpContext ctx, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var userId = Guid.Parse(userPrincipal.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            var isMaster = bool.Parse(userPrincipal.FindFirst("isMaster")?.Value ?? "false");
            Guid.TryParse(ctx.Request.Headers["X-Company-Id"].ToString(), out var companyId);
            var permissions = await mediator.Send(new GetMyPermissionsQuery(userId, isMaster, companyId));
            return Results.Ok(permissions);
        })
        .WithName("GetMyPermissions")
        .WithTags("Users")
        .RequireAuthorization();
    }
}