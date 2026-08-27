using System.Security.Claims;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Users;

// ==============================================================================
// 1. CONTRATOS (Usando IRequest do MediatR)
// ==============================================================================
public record CreateUserCommand(string Name, string Email, string Password) : IRequest<IResult>;
public record UpdateUserRequest(string Name, string Email);
public record UpdateUserCommand(Guid Id, string Name, string Email) : IRequest<IResult>;
public record DeleteUserCommand(Guid Id) : IRequest<IResult>;
public record ListUsersQuery() : IRequest<IResult>;
public record GetMyPermissionsQuery() : IRequest<IResult>;

// ==============================================================================
// 2. HANDLERS (Usando IRequestHandler)
// ==============================================================================
public class CreateUserHandler : IRequestHandler<CreateUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateUserHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateUserCommand request, CancellationToken ct)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email, ct))
            return Results.BadRequest(new { Message = "E-mail já em uso." });

        var user = new User(request.Name, request.Email, BCrypt.Net.BCrypt.HashPassword(request.Password), false);
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/users/{user.Id}", new { user.Id, user.Name, user.Email });
    }
}

public class UpdateUserHandler : IRequestHandler<UpdateUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateUserHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateUserCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.Id }, ct);
        if (user == null) return Results.NotFound(new { Message = "Usuário não encontrado." });

        if (await _db.Users.AnyAsync(u => u.Email == request.Email && u.Id != request.Id, ct))
            return Results.BadRequest(new { Message = "E-mail já em uso." });

        user.UpdateDetails(request.Name, request.Email);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public class DeleteUserHandler : IRequestHandler<DeleteUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteUserHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteUserCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.Id }, ct);
        if (user == null) return Results.NotFound(new { Message = "Usuário não encontrado." });

        if (user.IsMaster) return Results.BadRequest(new { Message = "Usuário Master não pode ser excluído." });

        _db.Users.Remove(user);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public class ListUsersHandler : IRequestHandler<ListUsersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListUsersHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListUsersQuery request, CancellationToken ct)
    {
        var users = await _db.Users.AsNoTracking()
            .Select(u => new { u.Id, u.Name, u.Email, u.IsMaster, u.CreatedAt })
            .ToListAsync(ct);

        return Results.Ok(users); // JSON Puro!
    }
}

public class GetMyPermissionsHandler : IRequestHandler<GetMyPermissionsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public GetMyPermissionsHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> Handle(GetMyPermissionsQuery request, CancellationToken ct)
    {
        var userIdClaim = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Results.Unauthorized();

        var user = await _db.Users.FindAsync(new object[] { userId }, ct);
        if (user == null)
            return Results.Unauthorized();

        if (user.IsMaster)
            return Results.Ok(new List<string> { "*" }); // Retorna direto o array ["*"]

        var companyIdHeader = _httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString();
        if (!Guid.TryParse(companyIdHeader, out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        var permissions = await _db.UserCompanyRoles
            .Where(ucr => ucr.UserId == userId && ucr.CompanyId == companyId)
            .SelectMany(ucr => ucr.Role.Permissions)
            .Select(p => p.Permission)
            .ToListAsync(ct);

        return Results.Ok(permissions); // Retorna direto o array ["customers:view", ...]
    }
}

// ==============================================================================
// 3. ENDPOINTS
// ==============================================================================
public static class UserEndpoints
{
    public static void MapUserCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users").WithTags("Users").RequireAuthorization();

        group.MapGet("/me/permissions", async (IMediator mediator) => await mediator.Send(new GetMyPermissionsQuery()))
            .WithName("GetMyPermissions");

        group.MapPost("/", async (CreateUserCommand cmd, IMediator mediator) => await mediator.Send(cmd));

        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListUsersQuery()));

        group.MapPut("/{id:guid}", async (Guid id, UpdateUserRequest req, IMediator mediator) =>
            await mediator.Send(new UpdateUserCommand(id, req.Name, req.Email)));

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteUserCommand(id)));
    }
}