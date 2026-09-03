using CoreWMS.Api.Infrastructure.Auth;
using CoreWMS.Api.Infrastructure.Data;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Login;

// ==========================================
// 1. DTOs
// ==========================================
public record RefreshTokenRequest(string Email, string RefreshToken);
public record RefreshTokenResponse(string AccessToken, string RefreshToken);

// ==========================================
// 2. Command
// ==========================================
public record RefreshTokenCommand(string Email, string RefreshToken) : IRequest<RefreshTokenResponse>;

// ==========================================
// 3. Validator (Pipeline MediatR)
// ==========================================
public class RefreshTokenCommandValidator : AbstractValidator<RefreshTokenCommand>
{
    public RefreshTokenCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("O e-mail é obrigatório.")
            .EmailAddress().WithMessage("Formato de e-mail inválido.");

        RuleFor(x => x.RefreshToken)
            .NotEmpty().WithMessage("O Refresh Token é obrigatório.");
    }
}

// ==========================================
// 4. Handler
// ==========================================
public class RefreshTokenCommandHandler : IRequestHandler<RefreshTokenCommand, RefreshTokenResponse>
{
    private readonly ApplicationDbContext _db;
    private readonly JwtTokenGenerator _jwt;

    public RefreshTokenCommandHandler(ApplicationDbContext db, JwtTokenGenerator jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    public async Task<RefreshTokenResponse> Handle(RefreshTokenCommand request, CancellationToken ct)
    {
        var emailLower = request.Email.Trim().ToLower();

        var user = await _db.Users
            .Include(u => u.UserCompanyRoles)
                .ThenInclude(ucr => ucr.Company)
            .FirstOrDefaultAsync(u => u.Email.ToLower() == emailLower, ct);

        if (user == null || user.RefreshToken != request.RefreshToken || user.RefreshTokenExpiryTime <= DateTime.UtcNow)
        {
            // Lança a exceção que será perfeitamente capturada e convertida em 401 pelo GlobalExceptionHandler
            throw new UnauthorizedAccessException("Refresh token inválido ou expirado.");
        }

        var allowedCompanyIds = user.IsMaster
            ? await _db.Companies.Select(c => c.Id).ToListAsync(ct)
            : user.UserCompanyRoles.Select(ucr => ucr.CompanyId).ToList();

        var newAccessToken = _jwt.GenerateToken(user, allowedCompanyIds);
        var newRefreshToken = _jwt.GenerateRefreshToken();

        // Mutação de estado encapsulada (DDD)
        user.SetRefreshToken(newRefreshToken, DateTime.UtcNow.AddDays(7));

        await _db.SaveChangesAsync(ct);

        return new RefreshTokenResponse(newAccessToken, newRefreshToken);
    }
}

// ==========================================
// 5. Endpoint (Minimal API)
// ==========================================
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
        .Produces<RefreshTokenResponse>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status400BadRequest)
        .ProducesProblem(StatusCodes.Status401Unauthorized);
    }
}