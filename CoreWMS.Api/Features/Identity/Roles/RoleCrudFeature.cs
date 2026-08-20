using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Roles;

// ==============================================================================
// 1. CONTRATOS
// ==============================================================================
public record CreateRoleCommand(string Name) : ICommand<IResult>;
public record UpdateRoleRequest(string Name);
public record UpdateRoleCommand(Guid Id, string Name) : ICommand<IResult>;
public record DeleteRoleCommand(Guid Id) : ICommand<IResult>;
public record ListRolesQuery() : IQuery<IResult>;

// ==============================================================================
// 2. HANDLERS
// ==============================================================================
public class CreateRoleHandler : ICommandHandler<CreateRoleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateRoleHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(CreateRoleCommand command, CancellationToken ct = default)
    {
        if (await _db.Roles.AnyAsync(r => r.Name == command.Name, ct))
            return Results.BadRequest(new { Message = "Já existe um perfil com este nome." });

        var role = new Role(command.Name);
        _db.Roles.Add(role);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/roles/{role.Id}", new { role.Id, role.Name });
    }
}

public class UpdateRoleHandler : ICommandHandler<UpdateRoleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateRoleHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(UpdateRoleCommand command, CancellationToken ct = default)
    {
        var role = await _db.Roles.FindAsync(new object[] { command.Id }, ct);
        if (role == null) return Results.NotFound();

        if (await _db.Roles.AnyAsync(r => r.Name == command.Name && r.Id != command.Id, ct))
            return Results.BadRequest(new { Message = "Já existe outro perfil com este nome." });

        role.UpdateName(command.Name);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class DeleteRoleHandler : ICommandHandler<DeleteRoleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteRoleHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(DeleteRoleCommand command, CancellationToken ct = default)
    {
        var role = await _db.Roles.FindAsync(new object[] { command.Id }, ct);
        if (role == null) return Results.NotFound();

        // Trava de segurança: Não podemos deletar um perfil se já houver alguém usando ele em algum CNPJ
        if (await _db.UserCompanyRoles.AnyAsync(ucr => ucr.RoleId == command.Id, ct))
            return Results.BadRequest(new { Message = "Este perfil não pode ser excluído pois está em uso." });

        _db.Roles.Remove(role);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class ListRolesHandler : IQueryHandler<ListRolesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListRolesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(ListRolesQuery query, CancellationToken ct = default)
    {
        var roles = await _db.Roles.AsNoTracking()
            .Select(r => new { r.Id, r.Name, r.CreatedAt })
            .ToListAsync(ct);
        return Results.Ok(roles);
    }
}

// ==============================================================================
// 3. ENDPOINTS
// ==============================================================================
public static class RoleEndpoints
{
    public static void MapRoleCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/roles").WithTags("Roles").RequireAuthorization();

        group.MapPost("/", async (CreateRoleCommand cmd, ICommandHandler<CreateRoleCommand, IResult> h, CancellationToken ct)
            => await h.HandleAsync(cmd, ct));

        group.MapGet("/", async (IQueryHandler<ListRolesQuery, IResult> h, CancellationToken ct)
            => await h.HandleAsync(new ListRolesQuery(), ct));

        group.MapPut("/{id:guid}", async (Guid id, UpdateRoleRequest req, ICommandHandler<UpdateRoleCommand, IResult> h, CancellationToken ct)
            => await h.HandleAsync(new UpdateRoleCommand(id, req.Name), ct));

        group.MapDelete("/{id:guid}", async (Guid id, ICommandHandler<DeleteRoleCommand, IResult> h, CancellationToken ct)
            => await h.HandleAsync(new DeleteRoleCommand(id), ct));
    }
}