using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Features.Identity.Constants;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.AssignUserToCompany;

// ==========================================
// 1. CONTRATOS
// ==========================================
public record AssignUserRequest(Guid CompanyId, Guid RoleId);
public record AssignUserCommand(Guid UserId, Guid CompanyId, Guid RoleId) : IRequest<IResult>;
public record RemoveUserAssignmentCommand(Guid UserId, Guid CompanyId) : IRequest<IResult>; // NOVO
public record ListCompaniesQuery() : IRequest<IResult>;

// ==========================================
// 2. VALIDADOR
// ==========================================
public class AssignUserCommandValidator : AbstractValidator<AssignUserCommand>
{
    public AssignUserCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.CompanyId).NotEmpty().WithMessage("A Empresa é obrigatória.");
        RuleFor(x => x.RoleId).NotEmpty().WithMessage("O Perfil é obrigatório.");
    }
}

// ==========================================
// 3. HANDLERS
// ==========================================
public class AssignUserHandler : IRequestHandler<AssignUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionCacheService _cacheService;

    public AssignUserHandler(ApplicationDbContext db, IPermissionCacheService cacheService)
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

// NOVO: Handler de Remoção de Vínculo
public class RemoveUserAssignmentHandler : IRequestHandler<RemoveUserAssignmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionCacheService _cacheService;

    public RemoveUserAssignmentHandler(ApplicationDbContext db, IPermissionCacheService cacheService)
    {
        _db = db;
        _cacheService = cacheService;
    }

    public async Task<IResult> Handle(RemoveUserAssignmentCommand request, CancellationToken ct)
    {
        var assignment = await _db.UserCompanyRoles
            .FirstOrDefaultAsync(x => x.UserId == request.UserId && x.CompanyId == request.CompanyId, ct);

        if (assignment == null)
            return Results.NotFound(new { Message = "Vínculo não encontrado." });

        _db.UserCompanyRoles.Remove(assignment);
        await _db.SaveChangesAsync(ct);

        // Invalida o cache para remover o acesso imediatamente
        _cacheService.InvalidateUserCompanyCache(request.UserId, request.CompanyId);

        return Results.NoContent();
    }
}

public class ListCompaniesHandler : IRequestHandler<ListCompaniesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListCompaniesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListCompaniesQuery request, CancellationToken ct)
    {
        var companies = await _db.Companies.AsNoTracking().Select(c => new { c.Id, c.Cnpj, c.CorporateName }).ToListAsync(ct);
        return Results.Ok(companies);
    }
}

// ==========================================
// 4. ENDPOINTS
// ==========================================
public static class AssignUserEndpoint
{
    public static void MapAssignUserEndpoint(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/users").WithTags("Users").RequireAuthorization();

        // Rota de Inserção/Atualização (Upsert)
        group.MapPost("/{userId:guid}/companies", async (Guid userId, AssignUserRequest req, IMediator mediator) =>
            await mediator.Send(new AssignUserCommand(userId, req.CompanyId, req.RoleId)))
        .RequirePermission(Permissions.Users.Manage);

        // NOVO: Rota de Exclusão do Vínculo
        group.MapDelete("/{userId:guid}/companies/{companyId:guid}", async (Guid userId, Guid companyId, IMediator mediator) =>
            await mediator.Send(new RemoveUserAssignmentCommand(userId, companyId)))
        .RequirePermission(Permissions.Users.Manage);
    }
}

public static class CompanyEndpoints
{
    public static void MapCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/companies-list", async (IMediator mediator) => await mediator.Send(new ListCompaniesQuery()))
        .WithTags("Companies").RequireAuthorization();
    }
}