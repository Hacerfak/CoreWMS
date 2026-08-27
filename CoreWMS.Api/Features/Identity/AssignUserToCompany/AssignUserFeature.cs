using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.AssignUserToCompany;

public record AssignUserRequest(Guid CompanyId, Guid RoleId);
public record AssignUserCommand(Guid UserId, Guid CompanyId, Guid RoleId) : IRequest<IResult>;
public record ListCompaniesQuery() : IRequest<IResult>;

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
        if (!await _db.Users.AnyAsync(u => u.Id == request.UserId, ct)) return Results.NotFound(new { Message = "Usuário não encontrado." });
        if (!await _db.Companies.AnyAsync(c => c.Id == request.CompanyId, ct)) return Results.BadRequest(new { Message = "Empresa não existe." });
        if (!await _db.Roles.AnyAsync(r => r.Id == request.RoleId, ct)) return Results.BadRequest(new { Message = "Perfil não existe." });

        if (await _db.UserCompanyRoles.AnyAsync(x => x.UserId == request.UserId && x.CompanyId == request.CompanyId && x.RoleId == request.RoleId, ct))
            return Results.BadRequest(new { Message = "O usuário já possui este perfil neste CNPJ." });

        _db.UserCompanyRoles.Add(new UserCompanyRole(request.UserId, request.CompanyId, request.RoleId));
        await _db.SaveChangesAsync(ct);
        _cacheService.InvalidateUserCompanyCache(request.UserId, request.CompanyId);

        return Results.Ok(new { Message = "Usuário atribuído com sucesso!" });
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

public static class AssignUserEndpoint
{
    public static void MapAssignUserEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/users/{userId:guid}/companies", async (Guid userId, AssignUserRequest req, IMediator mediator) =>
            await mediator.Send(new AssignUserCommand(userId, req.CompanyId, req.RoleId)))
        .WithTags("Users").RequireAuthorization();
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