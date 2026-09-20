using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Users;

// 1. Request
public record AssignUserRequest(Guid CompanyId, Guid RoleId);
public record AssignUserCommand(Guid UserId, Guid CompanyId, Guid RoleId) : IRequest<IResult>;

// 2. Validator
public class AssignUserCommandValidator : AbstractValidator<AssignUserCommand>
{
    public AssignUserCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.CompanyId).NotEmpty().WithMessage("A Empresa é obrigatória.");
        RuleFor(x => x.RoleId).NotEmpty().WithMessage("O Perfil é obrigatório.");
    }
}

// 3. Handler
public class AssignUserToCompanyHandler : IRequestHandler<AssignUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionCacheService _cacheService;

    public AssignUserToCompanyHandler(ApplicationDbContext db, IPermissionCacheService cacheService)
    {
        _db = db;
        _cacheService = cacheService;
    }

    public async Task<IResult> Handle(AssignUserCommand request, CancellationToken ct)
    {
        if (!await _db.Users.AnyAsync(u => u.Id == request.UserId, ct))
            return Results.NotFound(new { Message = "Usuário não encontrado." });

        if (!await _db.Companies.AnyAsync(c => c.Id == request.CompanyId, ct))
            return Results.BadRequest(new { Message = "Empresa não existe." });

        if (!await _db.Roles.AnyAsync(r => r.Id == request.RoleId, ct))
            return Results.BadRequest(new { Message = "Perfil não existe." });

        var existingAssignment = await _db.UserCompanyRoles
            .FirstOrDefaultAsync(x => x.UserId == request.UserId && x.CompanyId == request.CompanyId, ct);

        if (existingAssignment != null)
        {
            if (existingAssignment.RoleId == request.RoleId)
                return Results.BadRequest(new { Message = "O usuário já possui este perfil nesta empresa." });

            _db.UserCompanyRoles.Remove(existingAssignment);
        }

        _db.UserCompanyRoles.Add(new UserCompanyRole(request.UserId, request.CompanyId, request.RoleId));
        await _db.SaveChangesAsync(ct);

        _cacheService.InvalidateUserCompanyCache(request.UserId, request.CompanyId);

        return Results.Ok(new
        {
            Message = existingAssignment != null
            ? "Perfil atualizado com sucesso nesta empresa!"
            : "Usuário vinculado com sucesso!"
        });
    }
}

// 4. Endpoint
public static class AssignUserToCompanyEndpoints
{
    public static void MapAssignUserToCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/users/{userId:guid}/companies", async (Guid userId, AssignUserRequest req, IMediator mediator) =>
            await mediator.Send(new AssignUserCommand(userId, req.CompanyId, req.RoleId)))
        .WithTags("Users")
        .RequireAuthorization()
        .RequirePermission(Permissions.Users.Manage);
    }
}