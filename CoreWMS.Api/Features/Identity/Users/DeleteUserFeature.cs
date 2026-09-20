using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CoreWMS.Api.Infrastructure.Security;

namespace CoreWMS.Api.Features.Identity.Users;

// 1. Request
public record DeleteUserCommand(Guid Id) : IRequest<Unit>;

// 2. Handler
public class DeleteUserHandler : IRequestHandler<DeleteUserCommand, Unit>
{
    private readonly ApplicationDbContext _db;
    public DeleteUserHandler(ApplicationDbContext db) => _db = db;

    public async Task<Unit> Handle(DeleteUserCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.Id }, ct);
        if (user == null) throw new KeyNotFoundException("Usuário não encontrado.");

        if (user.IsMaster) throw new InvalidOperationException("Usuário Master não pode ser excluído.");

        _db.Users.Remove(user);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

// 3. Endpoint
public static class DeleteUserEndpoint
{
    public static void MapDeleteUserEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/users/{id:guid}", async (Guid id, IMediator mediator) =>
        {
            await mediator.Send(new DeleteUserCommand(id));
            return Results.NoContent();
        })
        .WithTags("Users")
        .RequireAuthorization()
        .RequirePermission(Permissions.Users.Manage);
    }
}