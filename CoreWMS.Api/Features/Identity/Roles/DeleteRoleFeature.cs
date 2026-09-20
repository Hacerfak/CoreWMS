using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Roles;

// 1. Request
public record DeleteRoleCommand(Guid Id) : IRequest<IResult>;

// 2. Handler
public class DeleteRoleHandler : IRequestHandler<DeleteRoleCommand, IResult>
{
    private readonly ApplicationDbContext _db;

    public DeleteRoleHandler(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> Handle(DeleteRoleCommand request, CancellationToken ct)
    {
        var role = await _db.Roles.FindAsync(new object[] { request.Id }, ct);

        if (role == null) return Results.NotFound(new { Message = "Perfil não encontrado." });

        if (await _db.UserCompanyRoles.AnyAsync(ucr => ucr.RoleId == request.Id, ct))
            return Results.BadRequest(new { Message = "Este perfil não pode ser excluído pois está em uso." });

        _db.Roles.Remove(role);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// 3. Endpoint
public static class DeleteRoleEndpoint
{
    public static void MapDeleteRoleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/roles/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteRoleCommand(id)))
           .WithTags("Roles")
           .RequireAuthorization()
           .RequirePermission(Permissions.Roles.Manage);
    }
}