using CoreWMS.Api.Infrastructure.Auth;
using CoreWMS.Api.Infrastructure.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Login;

// 1. CONTRATOS
public record CompanyLoginDto(Guid Id, string Cnpj, string CorporateName);
public record LoginResponse(string AccessToken, string RefreshToken, Guid UserId, string UserName, string Email, string Role, List<CompanyLoginDto> Companies);
public record LoginCommand(string Email, string Password) : IRequest<IResult>;

// 2. HANDLER
public class LoginCommandHandler : IRequestHandler<LoginCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly JwtTokenGenerator _jwt;

    public LoginCommandHandler(ApplicationDbContext db, JwtTokenGenerator jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    public async Task<IResult> Handle(LoginCommand request, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email, ct);
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Results.BadRequest(new { Message = "E-mail ou senha inválidos." }); // JSON Puro

        List<CompanyLoginDto> userCompanies;
        if (user.IsMaster)
        {
            userCompanies = await _db.Companies.Select(c => new CompanyLoginDto(c.Id, c.Cnpj, c.CorporateName)).ToListAsync(ct);
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

        user.SetRefreshToken(refreshToken, DateTime.UtcNow.AddDays(7));
        await _db.SaveChangesAsync(ct);

        var response = new LoginResponse(token, refreshToken, user.Id, user.Name, user.Email, user.IsMaster ? "ADMIN" : "USER", userCompanies);

        return Results.Ok(response); // JSON Puro direto!
    }
}

// 3. ENDPOINT
public static class LoginEndpoint
{
    public static void MapLoginEndpoint(this IEndpointRouteBuilder app)
    {
        // Olha como a rota fica limpa! Apenas pede o IMediator.
        app.MapPost("/api/identity/login", async (LoginCommand command, IMediator mediator) =>
            await mediator.Send(command))
        .WithTags("Identity").AllowAnonymous();
    }
}