using System.Security.Claims;
using CoreWMS.Api.Core;
using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;

namespace CoreWMS.Api.Features.Identity.Users;

// ==============================================================================
// 1. CONTRATOS (Commands e Queries)
// ==============================================================================
public record CreateUserCommand(string Name, string Email, string Password) : ICommand<IResult>;
public record UpdateUserRequest(string Name, string Email);
public record UpdateUserCommand(Guid Id, string Name, string Email) : ICommand<IResult>;
public record DeleteUserCommand(Guid Id) : ICommand<IResult>;
public record ListUsersQuery() : IQuery<IResult>;
// NOVO: Query para buscar as permissões do usuário logado
public record GetMyPermissionsQuery() : IQuery<IResult>;

// ==============================================================================
// 2. HANDLERS (Os executores)
// ==============================================================================
public class CreateUserHandler : ICommandHandler<CreateUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateUserHandler(ApplicationDbContext db) => _db = db;
    public async Task<IResult> HandleAsync(CreateUserCommand command, CancellationToken ct = default)
    {
        if (await _db.Users.AnyAsync(u => u.Email == command.Email, ct))
            return Results.BadRequest(new { Message = "E-mail já em uso." });

        var user = new User(command.Name, command.Email, BCrypt.Net.BCrypt.HashPassword(command.Password), false);
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return Results.Created($"/api/users/{user.Id}", new { user.Id, user.Name, user.Email });
    }
}

public class UpdateUserHandler : ICommandHandler<UpdateUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateUserHandler(ApplicationDbContext db) => _db = db;
    public async Task<IResult> HandleAsync(UpdateUserCommand command, CancellationToken ct = default)
    {
        var user = await _db.Users.FindAsync(new object[] { command.Id }, ct);
        if (user == null) return Results.NotFound();

        if (await _db.Users.AnyAsync(u => u.Email == command.Email && u.Id != command.Id, ct))
            return Results.BadRequest(new { Message = "E-mail já em uso." });

        user.UpdateDetails(command.Name, command.Email);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class DeleteUserHandler : ICommandHandler<DeleteUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteUserHandler(ApplicationDbContext db) => _db = db;
    public async Task<IResult> HandleAsync(DeleteUserCommand command, CancellationToken ct = default)
    {
        var user = await _db.Users.FindAsync(new object[] { command.Id }, ct);
        if (user == null) return Results.NotFound();

        if (user.IsMaster) return Results.BadRequest(new { Message = "Usuário Master não pode ser excluído." });

        _db.Users.Remove(user);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class ListUsersHandler : IQueryHandler<ListUsersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListUsersHandler(ApplicationDbContext db) => _db = db;
    public async Task<IResult> HandleAsync(ListUsersQuery query, CancellationToken ct = default)
    {
        var users = await _db.Users.AsNoTracking()
            .Select(u => new { u.Id, u.Name, u.Email, u.IsMaster, u.CreatedAt })
            .ToListAsync(ct);
        return Results.Ok(users);
    }
}

// NOVO: Handler de Permissões
public class GetMyPermissionsHandler : IQueryHandler<GetMyPermissionsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public GetMyPermissionsHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> HandleAsync(GetMyPermissionsQuery query, CancellationToken ct = default)
    {
        var userIdClaim = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Results.Unauthorized();

        var user = await _db.Users.FindAsync(new object[] { userId }, ct);
        if (user == null)
            return Results.Unauthorized();

        if (user.IsMaster)
            return Results.Ok(ApiResponse<List<string>>.Ok(new List<string> { "*" }));

        var companyIdHeader = _httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString();
        if (!Guid.TryParse(companyIdHeader, out var companyId))
            return Results.BadRequest(ApiResponse<object>.Fail("Cabeçalho X-Company-Id é obrigatório."));

        var permissions = await _db.UserCompanyRoles
            .Where(ucr => ucr.UserId == userId && ucr.CompanyId == companyId)
            .SelectMany(ucr => ucr.Role.Permissions)
            .Select(p => p.Permission)
            .ToListAsync(ct);

        return Results.Ok(ApiResponse<List<string>>.Ok(permissions));
    }
}

// ==============================================================================
// 3. ENDPOINTS (O mapeamento das rotas)
// ==============================================================================
public static class UserEndpoints
{
    public static void MapUserCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users").WithTags("Users").RequireAuthorization();

        // NOVO ENDPOINT DE PERMISSÕES
        group.MapGet("/me/permissions", async ([FromServices] IQueryHandler<GetMyPermissionsQuery, IResult> h, CancellationToken ct)
            => await h.HandleAsync(new GetMyPermissionsQuery(), ct))
            .WithName("GetMyPermissions");

        group.MapPost("/", async (CreateUserCommand cmd, ICommandHandler<CreateUserCommand, IResult> h, CancellationToken ct)
            => await h.HandleAsync(cmd, ct));

        group.MapGet("/", async (IQueryHandler<ListUsersQuery, IResult> h, CancellationToken ct)
            => await h.HandleAsync(new ListUsersQuery(), ct));

        group.MapPut("/{id:guid}", async (Guid id, UpdateUserRequest req, ICommandHandler<UpdateUserCommand, IResult> h, CancellationToken ct)
            => await h.HandleAsync(new UpdateUserCommand(id, req.Name, req.Email), ct));

        group.MapDelete("/{id:guid}", async (Guid id, ICommandHandler<DeleteUserCommand, IResult> h, CancellationToken ct)
            => await h.HandleAsync(new DeleteUserCommand(id), ct));
    }
}