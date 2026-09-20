using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using CoreWMS.Api.Infrastructure.Security;

namespace CoreWMS.Api.Features.Identity.Users;

// 1. Request
public record UpdateUserRequest(string Name, string Email);
public record UpdateUserCommand(Guid Id, string Name, string Email, bool IsRequesterMaster) : IRequest<Unit>;

// 2. Validator
public class UpdateUserCommandValidator : AbstractValidator<UpdateUserCommand>
{
    public UpdateUserCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome é obrigatório.").MaximumLength(150);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Informe um e-mail válido.");
    }
}

// 3. Handler
public class UpdateUserHandler : IRequestHandler<UpdateUserCommand, Unit>
{
    private readonly ApplicationDbContext _db;
    public UpdateUserHandler(ApplicationDbContext db) => _db = db;

    public async Task<Unit> Handle(UpdateUserCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.Id }, ct);
        if (user == null) throw new KeyNotFoundException("Usuário não encontrado.");

        if (user.IsMaster && !request.IsRequesterMaster)
            throw new UnauthorizedAccessException("Apenas usuários master podem editar outro usuário master.");

        if (await _db.Users.AnyAsync(u => u.Email == request.Email && u.Id != request.Id, ct))
            throw new InvalidOperationException("E-mail já em uso por outro usuário.");

        user.UpdateDetails(request.Name, request.Email);
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

// 4. Endpoint
public static class UpdateUserEndpoint
{
    public static void MapUpdateUserEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/users/{id:guid}", async (Guid id, UpdateUserRequest req, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var isMaster = bool.Parse(userPrincipal.FindFirst("isMaster")?.Value ?? "false");
            await mediator.Send(new UpdateUserCommand(id, req.Name, req.Email, isMaster));
            return Results.NoContent();
        })
        .WithTags("Users")
        .RequireAuthorization()
        .RequirePermission(Permissions.Users.Manage);
    }
}