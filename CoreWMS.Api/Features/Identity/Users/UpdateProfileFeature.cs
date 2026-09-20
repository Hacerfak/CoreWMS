using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using CoreWMS.Api.Infrastructure.Security;

namespace CoreWMS.Api.Features.Identity.Users;

// 1. Request
public record UpdateProfileRequest(string Name, string Email, string? Password);
public record UpdateProfileCommand(Guid UserId, string Name, string Email, string? Password) : IRequest<Unit>;

// 2. Validator
public class UpdateProfileCommandValidator : AbstractValidator<UpdateProfileCommand>
{
    public UpdateProfileCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome é obrigatório.").MaximumLength(150);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Informe um e-mail válido.");
        RuleFor(x => x.Password).MinimumLength(6).WithMessage("A senha deve ter no mínimo 6 caracteres.").When(x => !string.IsNullOrEmpty(x.Password));
    }
}

// 3. Handler
public class UpdateProfileHandler : IRequestHandler<UpdateProfileCommand, Unit>
{
    private readonly ApplicationDbContext _db;
    public UpdateProfileHandler(ApplicationDbContext db) => _db = db;

    public async Task<Unit> Handle(UpdateProfileCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object[] { request.UserId }, ct);
        if (user == null) throw new KeyNotFoundException("Usuário não encontrado.");

        if (await _db.Users.AnyAsync(u => u.Email == request.Email && u.Id != request.UserId, ct))
            throw new InvalidOperationException("Este e-mail já está sendo usado.");

        user.UpdateDetails(request.Name, request.Email);
        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            user.UpdatePassword(BCrypt.Net.BCrypt.HashPassword(request.Password));
        }

        await _db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

// 4. Endpoint
public static class UpdateProfileEndpoint
{
    public static void MapUpdateProfileEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/users/me", async (UpdateProfileRequest req, ClaimsPrincipal userPrincipal, IMediator mediator) =>
        {
            var userId = Guid.Parse(userPrincipal.FindFirst(ClaimTypes.NameIdentifier)!.Value);
            await mediator.Send(new UpdateProfileCommand(userId, req.Name, req.Email, req.Password));
            return Results.Ok(new { Message = "Perfil atualizado com sucesso." });
        })
        .WithTags("Users")
        .RequireAuthorization()
        .RequirePermission(Permissions.Profile.UpdateSelf);
    }
}