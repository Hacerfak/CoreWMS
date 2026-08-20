using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Infrastructure.Auth;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Login;

public class LoginCommandHandler : ICommandHandler<LoginCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly JwtTokenGenerator _jwt;

    public LoginCommandHandler(ApplicationDbContext db, JwtTokenGenerator jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    public async Task<IResult> HandleAsync(LoginCommand command, CancellationToken ct = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == command.Email, ct);

        if (user == null || !BCrypt.Net.BCrypt.Verify(command.Password, user.PasswordHash))
        {
            return Results.Unauthorized();
        }

        // Busca as empresas liberadas para este usuário
        List<CompanyLoginDto> userCompanies = new();

        if (user.IsMaster)
        {
            // Master tem passe livre para todas as empresas
            userCompanies = await _db.Companies
                .Select(c => new CompanyLoginDto(c.Id, c.Cnpj, c.CorporateName))
                .ToListAsync(ct);
        }
        else
        {
            // Usuário comum vê apenas os CNPJs onde possui algum vínculo
            userCompanies = await _db.UserCompanyRoles
                .Where(ucr => ucr.UserId == user.Id)
                .Select(ucr => new CompanyLoginDto(ucr.Company.Id, ucr.Company.Cnpj, ucr.Company.CorporateName))
                .Distinct()
                .ToListAsync(ct);
        }

        var allowedCompanyIds = userCompanies.Select(c => c.Id).ToList();
        var token = _jwt.GenerateToken(user, allowedCompanyIds);

        // Geração e salvamento do Refresh Token
        var refreshToken = _jwt.GenerateRefreshToken();
        user.SetRefreshToken(refreshToken, DateTime.UtcNow.AddDays(7)); // Válido por 7 dias
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new LoginResponse(token, refreshToken, user.Name, user.IsMaster, userCompanies));
    }
}