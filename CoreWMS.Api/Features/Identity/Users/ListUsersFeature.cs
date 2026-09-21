using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using CoreWMS.Api.Infrastructure.Security;

namespace CoreWMS.Api.Features.Identity.Users;

public record ListUsersQuery(bool IsRequesterMaster) : IRequest<List<UserDto>>;

public class ListUsersHandler : IRequestHandler<ListUsersQuery, List<UserDto>>
{
    private readonly ApplicationDbContext _db;

    public ListUsersHandler(ApplicationDbContext db) => _db = db;

    public async Task<List<UserDto>> Handle(ListUsersQuery request, CancellationToken ct)
    {
        var query = _db.Users
            .Include(u => u.UserCompanyRoles)
                .ThenInclude(ucr => ucr.Company)
            .Include(u => u.UserCompanyRoles)
                .ThenInclude(ucr => ucr.Role)
            .Include(u => u.UserCustomers) // <--- Incluir os Depositantes do Utilizador
            .AsSplitQuery()
            .AsNoTracking();

        if (!request.IsRequesterMaster)
        {
            query = query.Where(u => !u.IsMaster);
        }

        var users = await query.ToListAsync(ct);

        return users.Select(u => new UserDto(
            u.Id,
            u.Name,
            u.Email,
            u.IsMaster,
            u.CreatedAt,
            u.UserCompanyRoles.Select(ucr => new UserAssignmentDto(
                ucr.CompanyId,
                ucr.Company.CorporateName,
                ucr.Role.Name,
                // Extrai apenas os CustomerIds vinculados a este Utilizador
                u.UserCustomers.Select(uc => uc.CustomerId).ToList()
            )).ToList()
        )).ToList();
    }
}

public static class ListUsersEndpoint
{
    public static void MapListUsersEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/users", async (ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var isMaster = bool.Parse(userPrincipal.FindFirst("isMaster")?.Value ?? "false");
            var result = await mediator.Send(new ListUsersQuery(isMaster));
            return Results.Ok(result);
        })
        .WithTags("Users")
        .RequireAuthorization()
        .RequirePermission(Permissions.Users.Manage);
    }
}