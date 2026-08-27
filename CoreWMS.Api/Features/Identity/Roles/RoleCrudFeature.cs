using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Roles;

// 1. CONTRATOS
public record CreateRoleCommand(string Name) : IRequest<IResult>;
public record UpdateRoleRequest(string Name);
public record UpdateRoleCommand(Guid Id, string Name) : IRequest<IResult>;
public record DeleteRoleCommand(Guid Id) : IRequest<IResult>;
public record ListRolesQuery() : IRequest<IResult>;

// 2. HANDLERS
public class CreateRoleHandler : IRequestHandler<CreateRoleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateRoleHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateRoleCommand request, CancellationToken ct)
    {
        if (await _db.Roles.AnyAsync(r => r.Name == request.Name, ct))
            return Results.BadRequest(new { Message = "Já existe um perfil com este nome." });

        var role = new Role(request.Name);
        _db.Roles.Add(role);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/roles/{role.Id}", new { role.Id, role.Name });
    }
}

public class UpdateRoleHandler : IRequestHandler<UpdateRoleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionCacheService _cacheService;

    public UpdateRoleHandler(ApplicationDbContext db, IPermissionCacheService cacheService)
    {
        _db = db;
        _cacheService = cacheService;
    }

    public async Task<IResult> Handle(UpdateRoleCommand request, CancellationToken ct)
    {
        var role = await _db.Roles.FindAsync(new object[] { request.Id }, ct);
        if (role == null) return Results.NotFound();

        if (await _db.Roles.AnyAsync(r => r.Name == request.Name && r.Id != request.Id, ct))
            return Results.BadRequest(new { Message = "Já existe outro perfil com este nome." });

        role.UpdateName(request.Name);
        await _db.SaveChangesAsync(ct);

        _cacheService.InvalidateUserAllCompaniesCache(Guid.Empty);
        return Results.Ok(new { Message = "Perfil atualizado com sucesso!" });
    }
}

public class DeleteRoleHandler : IRequestHandler<DeleteRoleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteRoleHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteRoleCommand request, CancellationToken ct)
    {
        var role = await _db.Roles.FindAsync(new object[] { request.Id }, ct);
        if (role == null) return Results.NotFound();

        if (await _db.UserCompanyRoles.AnyAsync(ucr => ucr.RoleId == request.Id, ct))
            return Results.BadRequest(new { Message = "Este perfil não pode ser excluído pois está em uso." });

        _db.Roles.Remove(role);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class ListRolesHandler : IRequestHandler<ListRolesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListRolesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListRolesQuery request, CancellationToken ct)
    {
        var roles = await _db.Roles.AsNoTracking()
            .Select(r => new { r.Id, r.Name, r.CreatedAt })
            .ToListAsync(ct);
        return Results.Ok(roles);
    }
}

// 3. ENDPOINTS
public static class RoleEndpoints
{
    public static void MapRoleCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/roles").WithTags("Roles").RequireAuthorization();

        group.MapPost("/", async (CreateRoleCommand cmd, IMediator mediator) => await mediator.Send(cmd));
        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListRolesQuery()));
        group.MapPut("/{id:guid}", async (Guid id, UpdateRoleRequest req, IMediator mediator) => await mediator.Send(new UpdateRoleCommand(id, req.Name)));
        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteRoleCommand(id)));
    }
}