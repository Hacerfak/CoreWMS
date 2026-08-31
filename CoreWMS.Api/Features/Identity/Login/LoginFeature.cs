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
public record LoginRequest(string Email, string Password);
public record CompanyLoginDto(Guid Id, string Cnpj, string CorporateName);
public record LoginResponse(string AccessToken, string RefreshToken, Guid UserId, string UserName, string Email, string Role, List<CompanyLoginDto> Companies);

// ==========================================
// 2. Command
// ==========================================
public record LoginCommand(string Email, string Password) : IRequest<LoginResponse>;

// ==========================================
// 3. Validator (Pipeline MediatR)
// ==========================================
public class LoginCommandValidator : AbstractValidator<LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("O e-mail é obrigatório.")
            .EmailAddress().WithMessage("Formato de e-mail inválido.");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("A senha é obrigatória.");
    }
}

// ==========================================
// 4. Handler
// ==========================================
public class LoginCommandHandler : IRequestHandler<LoginCommand, LoginResponse>
{
    private readonly ApplicationDbContext _db;
    private readonly JwtTokenGenerator _jwt;

    public LoginCommandHandler(ApplicationDbContext db, JwtTokenGenerator jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    public async Task<LoginResponse> Handle(LoginCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email, ct);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedAccessException("E-mail ou senha inválidos.");
        }

        List<CompanyLoginDto> userCompanies;
        if (user.IsMaster)
        {
            userCompanies = await _db.Companies
                .Select(c => new CompanyLoginDto(c.Id, c.Cnpj, c.CorporateName))
                .ToListAsync(ct);
        }
        else
        {
            userCompanies = await _db.UserCompanyRoles
                .Where(ucr => ucr.UserId == user.Id)
                .Select(ucr => new CompanyLoginDto(ucr.Company.Id, ucr.Company.Cnpj, ucr.Company.CorporateName))
                .Distinct()
                .ToListAsync(ct);
        }

        var allowedCompanyIds = userCompanies.Select(c => c.Id).ToList();

        var token = _jwt.GenerateToken(user, allowedCompanyIds);
        var refreshToken = _jwt.GenerateRefreshToken();

        // Mutação de estado encapsulada (DDD)
        user.SetRefreshToken(refreshToken, DateTime.UtcNow.AddDays(7));
        await _db.SaveChangesAsync(ct);

        return new LoginResponse(
            token,
            refreshToken,
            user.Id,
            user.Name,
            user.Email,
            user.IsMaster ? "ADMIN" : "USER",
            userCompanies);
    }
}

// ==========================================
// 5. Endpoint (Minimal API)
// ==========================================
public static class LoginEndpoint
{
    public static void MapLoginEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/identity/login", async (LoginRequest request, IMediator mediator) =>
        {
            var command = request.Adapt<LoginCommand>();
            var result = await mediator.Send(command);
            return Results.Ok(result);
        })
        .WithTags("Identity")
        .AllowAnonymous()
        .Produces<LoginResponse>(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status400BadRequest)
        .ProducesProblem(StatusCodes.Status401Unauthorized);
    }
}