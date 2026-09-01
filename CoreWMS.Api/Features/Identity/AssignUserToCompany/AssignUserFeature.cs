using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Features.Identity.Constants;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.AssignUserToCompany;

// 1. CONTRATOS
public record AssignUserRequest(Guid CompanyId, Guid RoleId);
public record AssignUserCommand(Guid UserId, Guid CompanyId, Guid RoleId) : IRequest<IResult>;
public record ListCompaniesQuery() : IRequest<IResult>;

// 2. VALIDADOR
public class AssignUserCommandValidator : AbstractValidator<AssignUserCommand>
{
    public AssignUserCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.CompanyId).NotEmpty().WithMessage("A Empresa é obrigatória.");
        RuleFor(x => x.RoleId).NotEmpty().WithMessage("O Perfil é obrigatório.");
    }
}

// 3. HANDLERS
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
        // 1. Validações de integridade
        if (!await _db.Users.AnyAsync(u => u.Id == request.UserId, ct))
            return Results.NotFound(new { Message = "Usuário não encontrado." });

        if (!await _db.Companies.AnyAsync(c => c.Id == request.CompanyId, ct))
            return Results.BadRequest(new { Message = "Empresa não existe." });

        if (!await _db.Roles.AnyAsync(r => r.Id == request.RoleId, ct))
            return Results.BadRequest(new { Message = "Perfil não existe." });

        // 2. Busca se o usuário JÁ POSSUI algum vínculo nesta empresa específica
        var existingAssignment = await _db.UserCompanyRoles
            .FirstOrDefaultAsync(x => x.UserId == request.UserId && x.CompanyId == request.CompanyId, ct);

        // 3. Lógica de "Upsert" (Substituição) para evitar acúmulo de papéis
        if (existingAssignment != null)
        {
            // Se tentou vincular exatamente o mesmo perfil que ele já tem
            if (existingAssignment.RoleId == request.RoleId)
                return Results.BadRequest(new { Message = "O usuário já possui este perfil nesta empresa." });

            // Remove o vínculo antigo para abrir espaço para o novo
            _db.UserCompanyRoles.Remove(existingAssignment);
        }

        // 4. Cria o novo vínculo
        _db.UserCompanyRoles.Add(new UserCompanyRole(request.UserId, request.CompanyId, request.RoleId));
        await _db.SaveChangesAsync(ct);

        // 5. Invalida o cache de permissões para aplicar na hora
        _cacheService.InvalidateUserCompanyCache(request.UserId, request.CompanyId);

        return Results.Ok(new
        {
            Message = existingAssignment != null
            ? "Perfil atualizado com sucesso nesta empresa!"
            : "Usuário vinculado com sucesso!"
        });
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

// 4. ENDPOINTS
public static class AssignUserEndpoint
{
    public static void MapAssignUserEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/users/{userId:guid}/companies", async (Guid userId, AssignUserRequest req, IMediator mediator) =>
            await mediator.Send(new AssignUserCommand(userId, req.CompanyId, req.RoleId)))
        .WithTags("Users")
        .RequireAuthorization()
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