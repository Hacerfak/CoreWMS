using System.Security.Claims;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Users;

// ==============================================================================
// 1. CONTRATOS & DTOs
// ==============================================================================
public record UserDto(Guid Id, string Name, string Email, bool IsMaster, DateTime CreatedAt);

public record CreateUserCommand(string Name, string Email, string Password) : IRequest<IResult>;
public record UpdateUserRequest(string Name, string Email);
public record UpdateUserCommand(Guid Id, string Name, string Email) : IRequest<IResult>;
public record DeleteUserCommand(Guid Id) : IRequest<IResult>;
public record ListUsersQuery() : IRequest<IResult>;
public record GetMyPermissionsQuery() : IRequest<IResult>;
public record UpdateProfileRequest(string Name, string Email, string? Password);
public record UpdateProfileCommand(Guid UserId, string Name, string Email, string? Password) : IRequest<IResult>;
public record ResetUserPasswordRequest(string NewPassword);
public record ResetUserPasswordCommand(Guid UserId, string NewPassword) : IRequest<IResult>;

// ==============================================================================
// 2. VALIDAÇÕES (FluentValidation)
// ==============================================================================
public class CreateUserCommandValidator : AbstractValidator<CreateUserCommand>
{
    public CreateUserCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome é obrigatório.").MaximumLength(150);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Informe um e-mail válido.");
        RuleFor(x => x.Password).NotEmpty().MinimumLength(6).WithMessage("A senha deve ter no mínimo 6 caracteres.");
    }
}

public class UpdateUserCommandValidator : AbstractValidator<UpdateUserCommand>
{
    public UpdateUserCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome é obrigatório.").MaximumLength(150);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Informe um e-mail válido.");
    }
}
public class UpdateProfileCommandValidator : AbstractValidator<UpdateProfileCommand>
{
    public UpdateProfileCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome é obrigatório.").MaximumLength(150);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Informe um e-mail válido.");
        RuleFor(x => x.Password).MinimumLength(6).WithMessage("A senha deve ter no mínimo 6 caracteres.").When(x => !string.IsNullOrEmpty(x.Password));
    }
}
public class ResetUserPasswordCommandValidator : AbstractValidator<ResetUserPasswordCommand>
{
    public ResetUserPasswordCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(6).WithMessage("A nova senha deve ter no mínimo 6 caracteres.");
    }
}

// ==============================================================================
// 3. HANDLERS
// ==============================================================================
// ... (CreateUserHandler, UpdateUserHandler, DeleteUserHandler, ListUsersHandler, GetMyPermissionsHandler continuam iguais ao que já tínhamos) ...

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
        return Results.Created($"/api/users/{user.Id}", user.Adapt<UserDto>());
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
            return Results.BadRequest(new { Message = "E-mail já em uso por outro usuário." });

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
        var users = await _db.Users.AsNoTracking().ProjectToType<UserDto>().ToListAsync(ct);
        return Results.Ok(users);
    }
}

public class GetMyPermissionsHandler : IRequestHandler<GetMyPermissionsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;
    public GetMyPermissionsHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db; _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> Handle(GetMyPermissionsQuery request, CancellationToken ct)
    {
        var userIdClaim = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId)) return Results.Unauthorized();

        var user = await _db.Users.FindAsync(new object[] { userId }, ct);
        if (user == null) return Results.Unauthorized();

        if (user.IsMaster) return Results.Ok(new List<string> { "*" });

        var companyIdHeader = _httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString();
        if (!Guid.TryParse(companyIdHeader, out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        var permissions = await _db.UserCompanyRoles
            .Where(ucr => ucr.UserId == userId && ucr.CompanyId == companyId)
            .SelectMany(ucr => ucr.Role.Permissions)
            .Select(p => p.Permission)
            .ToListAsync(ct);

        return Results.Ok(permissions);
    }
}

// NOVO: Handler para atualizar próprio perfil
public class UpdateProfileHandler : IRequestHandler<UpdateProfileCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateProfileHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateProfileCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.UserId }, ct);
        if (user == null) return Results.NotFound(new { Message = "Usuário não encontrado." });

        if (await _db.Users.AnyAsync(u => u.Email == request.Email && u.Id != request.UserId, ct))
            return Results.BadRequest(new { Message = "Este e-mail já está sendo usado." });

        user.UpdateDetails(request.Name, request.Email);

        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            user.UpdatePassword(BCrypt.Net.BCrypt.HashPassword(request.Password));
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Perfil atualizado com sucesso." });
    }
}
public class ResetUserPasswordHandler : IRequestHandler<ResetUserPasswordCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public ResetUserPasswordHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ResetUserPasswordCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.UserId }, ct);
        if (user == null) return Results.NotFound(new { Message = "Usuário não encontrado." });

        user.UpdatePassword(BCrypt.Net.BCrypt.HashPassword(request.NewPassword));
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Senha redefinida com sucesso." });
    }
}

// ==============================================================================
// 4. ENDPOINTS (AGORA BLINDADOS!)
// ==============================================================================
public static class UserEndpoints
{
    public static void MapUserCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users").WithTags("Users").RequireAuthorization();

        // 1. ROTAS DO PRÓPRIO USUÁRIO (Livre para quem tem acesso básico à tela)
        group.MapGet("/me/permissions", async (IMediator mediator) => await mediator.Send(new GetMyPermissionsQuery()))
            .WithName("GetMyPermissions");

        // Usa o ClaimsPrincipal (user do Token JWT) para pegar o ID com segurança
        group.MapPut("/me", async (UpdateProfileRequest req, ClaimsPrincipal user, IMediator mediator) =>
        {
            var userId = Guid.Parse(user.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            return await mediator.Send(new UpdateProfileCommand(userId, req.Name, req.Email, req.Password));
        })
        .RequirePermission(Permissions.Profile.UpdateSelf); // <-- Bloqueio aplicado!

        // 2. ROTAS DE GESTÃO (Exclusivas para Gestores/Masters)
        group.MapPost("/", async (CreateUserCommand cmd, IMediator mediator) => await mediator.Send(cmd))
            .RequirePermission(Permissions.Users.Create); // <-- Bloqueio aplicado!

        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListUsersQuery()))
            .RequirePermission(Permissions.Users.View); // <-- Bloqueio aplicado!

        group.MapPut("/{id:guid}", async (Guid id, UpdateUserRequest req, IMediator mediator) =>
            await mediator.Send(new UpdateUserCommand(id, req.Name, req.Email)))
            .RequirePermission(Permissions.Users.Edit); // <-- Bloqueio aplicado!

        group.MapPut("/{id:guid}/password", async (Guid id, ResetUserPasswordRequest req, IMediator mediator) =>
            await mediator.Send(new ResetUserPasswordCommand(id, req.NewPassword)))
            .RequirePermission(Permissions.Users.Edit);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteUserCommand(id)))
            .RequirePermission(Permissions.Users.Delete); // <-- Bloqueio aplicado!
    }
}