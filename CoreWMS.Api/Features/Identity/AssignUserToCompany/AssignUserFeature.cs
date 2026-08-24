using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Features.Identity.Entities;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.AssignUserToCompany;

// ==============================================================================
// 1. CONTRATOS
// ==============================================================================
public record AssignUserRequest(Guid CompanyId, Guid RoleId);
public record AssignUserCommand(Guid UserId, Guid CompanyId, Guid RoleId) : ICommand<IResult>;

// ==============================================================================
// 2. HANDLER
// ==============================================================================
public class AssignUserHandler : ICommandHandler<AssignUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionCacheService _cacheService;
    public AssignUserHandler(ApplicationDbContext db, IPermissionCacheService cacheService)
    {
        _db = db;
        _cacheService = cacheService;
    }

    public async Task<IResult> HandleAsync(AssignUserCommand command, CancellationToken ct = default)
    {
        // 1. Validações de existência (Super rápidas e sem fazer JOIN pesado)
        var userExists = await _db.Users.AnyAsync(u => u.Id == command.UserId, ct);
        if (!userExists) return Results.NotFound(new { Message = "Usuário não encontrado." });

        var companyExists = await _db.Companies.AnyAsync(c => c.Id == command.CompanyId, ct);
        if (!companyExists) return Results.BadRequest(new { Message = "A empresa (CNPJ) informada não existe." });

        var roleExists = await _db.Roles.AnyAsync(r => r.Id == command.RoleId, ct);
        if (!roleExists) return Results.BadRequest(new { Message = "O perfil informado não existe." });

        // 2. Regra de Negócio: Checa no banco se o vínculo já existe
        var alreadyAssigned = await _db.UserCompanyRoles
            .AnyAsync(x => x.UserId == command.UserId && x.CompanyId == command.CompanyId && x.RoleId == command.RoleId, ct);

        if (alreadyAssigned)
            return Results.BadRequest(new { Message = "O usuário já possui este perfil neste CNPJ." });

        // 3. Criação explícita e Persistência Direta (O EF Core entende 100% o que fazer aqui)
        var userCompanyRole = new UserCompanyRole(command.UserId, command.CompanyId, command.RoleId);
        _db.UserCompanyRoles.Add(userCompanyRole);

        await _db.SaveChangesAsync(ct);

        // Invalida o cache IMEDIATAMENTE para a empresa ajustada
        _cacheService.InvalidateUserCompanyCache(command.UserId, command.CompanyId);

        return Results.Ok(new { Message = "Usuário atribuído com sucesso!" });
    }
}

// ==============================================================================
// 3. ENDPOINT
// ==============================================================================
public static class AssignUserEndpoint
{
    public static void MapAssignUserEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/users/{userId:guid}/companies", async (
            Guid userId,
            AssignUserRequest request,
            ICommandHandler<AssignUserCommand, IResult> h,
            CancellationToken ct) =>
        {
            var command = new AssignUserCommand(userId, request.CompanyId, request.RoleId);
            return await h.HandleAsync(command, ct);
        })
        .WithTags("Users") // Vai agrupar lá no Swagger junto com os usuários
        .RequireAuthorization();
    }
}

// Uma Query super simples apenas para buscar os CNPJs para podermos testar
public record ListCompaniesQuery() : IQuery<IResult>;

public class ListCompaniesHandler : IQueryHandler<ListCompaniesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListCompaniesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(ListCompaniesQuery query, CancellationToken ct = default)
    {
        var companies = await _db.Companies.AsNoTracking()
            .Select(c => new { c.Id, c.Cnpj, c.CorporateName })
            .ToListAsync(ct);
        return Results.Ok(companies);
    }
}

public static class CompanyEndpoints
{
    public static void MapCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/companies", async (IQueryHandler<ListCompaniesQuery, IResult> h, CancellationToken ct)
            => await h.HandleAsync(new ListCompaniesQuery(), ct))
        .WithTags("Companies")
        .RequireAuthorization();
    }
}