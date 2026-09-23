using CoreWMS.Api.Infrastructure.Auth;
using CoreWMS.Api.Infrastructure.Data;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Login;

// 1. DTOs
public record RefreshTokenRequest(string? Email, string RefreshToken);
public record RefreshTokenResponse(string AccessToken, string RefreshToken);

// 2. Command
public record RefreshTokenCommand(string? Email, string RefreshToken) : IRequest<RefreshTokenResponse>;

// 3. Validator (Pipeline MediatR)
public class RefreshTokenCommandValidator : AbstractValidator<RefreshTokenCommand>
{
    public RefreshTokenCommandValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotEmpty().WithMessage("O Refresh Token é obrigatório.");
    }
}

// 4. Handler
public class RefreshTokenCommandHandler : IRequestHandler<RefreshTokenCommand, RefreshTokenResponse>
{
    private readonly ApplicationDbContext _db;
    private readonly IJwtTokenGenerator _jwt;

    public RefreshTokenCommandHandler(ApplicationDbContext db, IJwtTokenGenerator jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    public async Task<RefreshTokenResponse> Handle(RefreshTokenCommand request, CancellationToken ct)
    {
        CoreWMS.Api.Features.Identity.Entities.User? user = null;

        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var emailLower = request.Email.Trim().ToLower();
            user = await _db.Users
                .FirstOrDefaultAsync(u => u.Email.ToLower() == emailLower && u.RefreshToken == request.RefreshToken, ct);
        }
        else
        {
            user = await _db.Users
                .FirstOrDefaultAsync(u => u.RefreshToken == request.RefreshToken, ct);
        }

        if (user == null || user.RefreshTokenExpiryTime <= DateTime.UtcNow)
        {
            throw new UnauthorizedAccessException("Refresh token inválido ou expirado.");
        }

        // Gera o JWT ultraleve sem serializar listas de IDs
        var newAccessToken = _jwt.GenerateToken(user);
        var newRefreshToken = _jwt.GenerateRefreshToken();

        user.SetRefreshToken(newRefreshToken, DateTime.UtcNow.AddDays(7));
        await _db.SaveChangesAsync(ct);

        return new RefreshTokenResponse(newAccessToken, newRefreshToken);
    }
}

// 5. Endpoint Minimal API
public static class RefreshTokenEndpoint
{
    public static void MapRefreshTokenEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/identity/refresh", async (RefreshTokenRequest request, IMediator mediator) =>
        {
            var command = request.Adapt<RefreshTokenCommand>();
            var result = await mediator.Send(command);
            return Results.Ok(result);
        })
        .WithTags("Identity")
        .AllowAnonymous()
        .RequireRateLimiting("refreshPolicy")
        .Produces<RefreshTokenResponse>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status400BadRequest)
        .ProducesProblem(StatusCodes.Status401Unauthorized);
    }
}