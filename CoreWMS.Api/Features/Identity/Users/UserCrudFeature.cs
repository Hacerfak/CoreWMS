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
public record UserAssignmentDto(Guid CompanyId, string CompanyName, string RoleName);
public record UserDto(Guid Id, string Name, string Email, bool IsMaster, DateTime CreatedAt, List<UserAssignmentDto> Assignments);

public record UpdateUserRequest(string Name, string Email);
public record UpdateProfileRequest(string Name, string Email, string? Password);
public record ResetUserPasswordRequest(string NewPassword);

// Commands & Queries (Agora transportam a flag IsRequesterMaster para segurança)
public record CreateUserCommand(string Name, string Email, string Password) : IRequest<UserDto>;
public record UpdateUserCommand(Guid Id, string Name, string Email, bool IsRequesterMaster) : IRequest<Unit>;
public record DeleteUserCommand(Guid Id) : IRequest<Unit>;
public record ListUsersQuery(bool IsRequesterMaster) : IRequest<List<UserDto>>;
public record GetMyPermissionsQuery(Guid UserId, bool IsMaster, Guid CompanyId) : IRequest<List<string>>;
public record UpdateProfileCommand(Guid UserId, string Name, string Email, string? Password) : IRequest<Unit>;
public record ResetUserPasswordCommand(Guid UserId, string NewPassword, bool IsRequesterMaster) : IRequest<Unit>;


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
public class CreateUserHandler : IRequestHandler<CreateUserCommand, UserDto>
{
    private readonly ApplicationDbContext _db;
    public CreateUserHandler(ApplicationDbContext db) => _db = db;

    public async Task<UserDto> Handle(CreateUserCommand request, CancellationToken ct)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email, ct))
            throw new InvalidOperationException("E-mail já em uso.");

        var user = new User(request.Name, request.Email, BCrypt.Net.BCrypt.HashPassword(request.Password), false);
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        return new UserDto(user.Id, user.Name, user.Email, user.IsMaster, user.CreatedAt, new List<UserAssignmentDto>());
    }
}

public class UpdateUserHandler : IRequestHandler<UpdateUserCommand, Unit>
{
    private readonly ApplicationDbContext _db;
    public UpdateUserHandler(ApplicationDbContext db) => _db = db;

    public async Task<Unit> Handle(UpdateUserCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.Id }, ct);
        if (user == null) throw new KeyNotFoundException("Usuário não encontrado.");

        // Bloqueio de segurança: Administrador tentando editar Master
        if (user.IsMaster && !request.IsRequesterMaster)
            throw new UnauthorizedAccessException("Apenas usuários master podem editar outro usuário master.");

        if (await _db.Users.AnyAsync(u => u.Email == request.Email && u.Id != request.Id, ct))
            throw new InvalidOperationException("E-mail já em uso por outro usuário.");

        user.UpdateDetails(request.Name, request.Email);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

public class DeleteUserHandler : IRequestHandler<DeleteUserCommand, Unit>
{
    private readonly ApplicationDbContext _db;
    public DeleteUserHandler(ApplicationDbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteUserCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.Id }, ct);
        if (user == null) throw new KeyNotFoundException("Usuário não encontrado.");

        // Regra imutável: Ninguém exclui usuário Master (nem ele mesmo, por segurança)
        if (user.IsMaster) throw new InvalidOperationException("Usuário Master não pode ser excluído.");

        _db.Users.Remove(user);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

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
            .AsNoTracking();

        // Se quem tá pedindo a lista NÃO for Master, filtramos os Masters para sumirem da tela
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
            u.UserCompanyRoles.Select(ucr => new UserAssignmentDto(ucr.CompanyId, ucr.Company.CorporateName, ucr.Role.Name)).ToList()
        )).ToList();
    }
}

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
            .ToListAsync(ct);

        return permissions;
    }
}

public class UpdateProfileHandler : IRequestHandler<UpdateProfileCommand, Unit>
{
    private readonly ApplicationDbContext _db;
    public UpdateProfileHandler(ApplicationDbContext db) => _db = db;

    public async Task<Unit> Handle(UpdateProfileCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.UserId }, ct);
        if (user == null) throw new KeyNotFoundException("Usuário não encontrado.");

        if (await _db.Users.AnyAsync(u => u.Email == request.Email && u.Id != request.UserId, ct))
            throw new InvalidOperationException("Este e-mail já está sendo usado.");

        user.UpdateDetails(request.Name, request.Email);
        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            user.UpdatePassword(BCrypt.Net.BCrypt.HashPassword(request.Password));
        }

        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

public class ResetUserPasswordHandler : IRequestHandler<ResetUserPasswordCommand, Unit>
{
    private readonly ApplicationDbContext _db;
    public ResetUserPasswordHandler(ApplicationDbContext db) => _db = db;

    public async Task<Unit> Handle(ResetUserPasswordCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.UserId }, ct);
        if (user == null) throw new KeyNotFoundException("Usuário não encontrado.");

        // Bloqueio de segurança: Administrador tentando alterar senha do Master
        if (user.IsMaster && !request.IsRequesterMaster)
            throw new UnauthorizedAccessException("Apenas usuários master podem redefinir a senha de um master.");

        user.UpdatePassword(BCrypt.Net.BCrypt.HashPassword(request.NewPassword));
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

// ==============================================================================
// 4. ENDPOINTS
// ==============================================================================
public static class UserEndpoints
{
    public static void MapUserCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users").WithTags("Users").RequireAuthorization();

        // 1. ROTAS DO PRÓPRIO USUÁRIO (Livre para quem tem acesso básico à tela)
        group.MapGet("/me/permissions", async (HttpContext ctx, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var userId = Guid.Parse(userPrincipal.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            var isMaster = bool.Parse(userPrincipal.FindFirst("isMaster")?.Value ?? "false");
            Guid.TryParse(ctx.Request.Headers["X-Company-Id"].ToString(), out var companyId);

            var permissions = await mediator.Send(new GetMyPermissionsQuery(userId, isMaster, companyId));
            return Results.Ok(permissions);
        }).WithName("GetMyPermissions");

        group.MapPut("/me", async (UpdateProfileRequest req, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var userId = Guid.Parse(userPrincipal.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            await mediator.Send(new UpdateProfileCommand(userId, req.Name, req.Email, req.Password));
            return Results.Ok(new { Message = "Perfil atualizado com sucesso." });
        }).RequirePermission(Permissions.Profile.UpdateSelf);

        // 2. ROTAS DE GESTÃO (Exclusivas para Gestores/Masters com captura de Claims em Tempo Real)
        group.MapPost("/", async (CreateUserCommand cmd, IMediator mediator) =>
        {
            var result = await mediator.Send(cmd);
            return Results.Created($"/api/users/{result.Id}", result);
        }).RequirePermission(Permissions.Users.Manage);

        group.MapGet("/", async (ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var isMaster = bool.Parse(userPrincipal.FindFirst("isMaster")?.Value ?? "false");
            var result = await mediator.Send(new ListUsersQuery(isMaster));
            return Results.Ok(result);
        }).RequirePermission(Permissions.Users.Manage);

        group.MapPut("/{id:guid}", async (Guid id, UpdateUserRequest req, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var isMaster = bool.Parse(userPrincipal.FindFirst("isMaster")?.Value ?? "false");
            await mediator.Send(new UpdateUserCommand(id, req.Name, req.Email, isMaster));
            return Results.NoContent();
        }).RequirePermission(Permissions.Users.Manage);

        group.MapPut("/{id:guid}/password", async (Guid id, ResetUserPasswordRequest req, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var isMaster = bool.Parse(userPrincipal.FindFirst("isMaster")?.Value ?? "false");
            await mediator.Send(new ResetUserPasswordCommand(id, req.NewPassword, isMaster));
            return Results.Ok(new { Message = "Senha redefinida com sucesso." });
        }).RequirePermission(Permissions.Users.Manage);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
        {
            await mediator.Send(new DeleteUserCommand(id));
            return Results.NoContent();
        }).RequirePermission(Permissions.Users.Manage);
    }
}