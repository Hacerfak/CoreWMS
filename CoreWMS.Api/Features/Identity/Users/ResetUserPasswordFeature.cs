using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using FluentValidation;
using MediatR;
using System.Security.Claims;
using CoreWMS.Api.Infrastructure.Security;

namespace CoreWMS.Api.Features.Identity.Users;

// 1. Request
public record ResetUserPasswordRequest(string NewPassword);
public record ResetUserPasswordCommand(Guid UserId, string NewPassword, bool IsRequesterMaster) : IRequest<Unit>;

// 2. Validator
public class ResetUserPasswordCommandValidator : AbstractValidator<ResetUserPasswordCommand>
{
    public ResetUserPasswordCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.NewPassword).NotEmpty().MinimumLength(6).WithMessage("A nova senha deve ter no mínimo 6 caracteres.");
    }
}

// 3. Handler
public class ResetUserPasswordHandler : IRequestHandler<ResetUserPasswordCommand, Unit>
{
    private readonly ApplicationDbContext _db;
    public ResetUserPasswordHandler(ApplicationDbContext db) => _db = db;

    public async Task<Unit> Handle(ResetUserPasswordCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.UserId }, ct);
        if (user == null) throw new KeyNotFoundException("Usuário não encontrado.");

        if (user.IsMaster && !request.IsRequesterMaster)
            throw new UnauthorizedAccessException("Apenas usuários master podem redefinir a senha de um master.");

        user.UpdatePassword(BCrypt.Net.BCrypt.HashPassword(request.NewPassword));
        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

// 4. Endpoint
public static class ResetUserPasswordEndpoint
{
    public static void MapResetUserPasswordEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/users/{id:guid}/password", async (Guid id, ResetUserPasswordRequest req, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var isMaster = bool.Parse(userPrincipal.FindFirst("isMaster")?.Value ?? "false");
            await mediator.Send(new ResetUserPasswordCommand(id, req.NewPassword, isMaster));
            return Results.Ok(new { Message = "Senha redefinida com sucesso." });
        })
        .WithTags("Users")
        .RequireAuthorization()
        .RequirePermission(Permissions.Users.Manage);
    }
}