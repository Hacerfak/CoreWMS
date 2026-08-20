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
                .Select(c => new CompanyLoginDto(c.Id, c.Cnpj, c.Name))
                .ToListAsync(ct);
        }
        else
        {
            // Usuário comum vê apenas os CNPJs onde possui algum vínculo
            userCompanies = await _db.UserCompanyRoles
                .Where(ucr => ucr.UserId == user.Id)
                .Select(ucr => new CompanyLoginDto(ucr.Company.Id, ucr.Company.Cnpj, ucr.Company.Name))
                .Distinct()
                .ToListAsync(ct);
        }

        var token = _jwt.GenerateToken(user);

        return Results.Ok(new LoginResponse(token, user.Name, user.IsMaster, userCompanies));
    }
}