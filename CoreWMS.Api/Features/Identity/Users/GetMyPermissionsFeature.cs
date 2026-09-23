using CoreWMS.Api.Infrastructure.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace CoreWMS.Api.Features.Identity.Users;

public record UserCompanyDto(Guid Id, string CorporateName, string? TradeName, string Cnpj);

public record UserMeResponse(
    Guid Id,
    string Name,
    string Email,
    bool IsMaster,
    List<UserCompanyDto> Companies,
    List<string> Permissions
);

public record GetUserMeQuery(Guid UserId, Guid? ActiveCompanyId) : IRequest<UserMeResponse>;

public class GetUserMeHandler : IRequestHandler<GetUserMeQuery, UserMeResponse>
{
    private readonly ApplicationDbContext _db;

    public GetUserMeHandler(ApplicationDbContext db) => _db = db;

    public async Task<UserMeResponse> Handle(GetUserMeQuery request, CancellationToken ct)
    {
        var user = await _db.Users
            .AsNoTracking()
            .Include(u => u.UserCompanyRoles)
                .ThenInclude(ucr => ucr.Company)
            .FirstOrDefaultAsync(u => u.Id == request.UserId, ct);

        if (user == null)
            throw new KeyNotFoundException("Usuário não encontrado.");

        List<UserCompanyDto> companies;
        if (user.IsMaster)
        {
            companies = await _db.Companies
                .AsNoTracking()
                .Select(c => new UserCompanyDto(c.Id, c.CorporateName, c.TradeName, c.Cnpj))
                .ToListAsync(ct);
        }
        else
        {
            companies = user.UserCompanyRoles
                .Select(ucr => new UserCompanyDto(ucr.Company.Id, ucr.Company.CorporateName, ucr.Company.TradeName, ucr.Company.Cnpj))
                .DistinctBy(c => c.Id)
                .ToList();
        }

        List<string> permissions = new();
        if (user.IsMaster)
        {
            permissions = new List<string> { "*" };
        }
        else if (request.ActiveCompanyId.HasValue && request.ActiveCompanyId.Value != Guid.Empty)
        {
            permissions = await _db.UserCompanyRoles
                .Where(ucr => ucr.UserId == request.UserId && ucr.CompanyId == request.ActiveCompanyId.Value)
                .SelectMany(ucr => ucr.Role.Permissions)
                .Select(p => p.Permission)
                .AsNoTracking()
                .Distinct()
                .ToListAsync(ct);
        }

        return new UserMeResponse(user.Id, user.Name, user.Email, user.IsMaster, companies, permissions);
    }
}

public static class GetMeEndpoints
{
    public static void MapGetMeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/users/me", async (HttpContext ctx, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var userId = Guid.Parse(userPrincipal.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            Guid.TryParse(ctx.Request.Headers["X-Company-Id"].ToString(), out var companyId);

            var result = await mediator.Send(new GetUserMeQuery(userId, companyId));
            return Results.Ok(result);
        })
        .WithName("GetUserMe")
        .WithTags("Users")
        .RequireAuthorization();

        app.MapGet("/api/users/me/permissions", async (HttpContext ctx, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var userId = Guid.Parse(userPrincipal.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            Guid.TryParse(ctx.Request.Headers["X-Company-Id"].ToString(), out var companyId);

            var result = await mediator.Send(new GetUserMeQuery(userId, companyId));
            return Results.Ok(result.Permissions);
        })
        .WithName("GetMyPermissions")
        .WithTags("Users")
        .RequireAuthorization();
    }
}