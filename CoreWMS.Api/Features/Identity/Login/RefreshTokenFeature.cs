using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Infrastructure.Auth;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Login;

// O frontend só precisa mandar o Email (ou UserId) e o RefreshToken que ele tem salvo
public record RefreshTokenCommand(string Email, string RefreshToken) : ICommand<IResult>;

public class RefreshTokenHandler : ICommandHandler<RefreshTokenCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly JwtTokenGenerator _jwt;

    public RefreshTokenHandler(ApplicationDbContext db, JwtTokenGenerator jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    public async Task<IResult> HandleAsync(RefreshTokenCommand command, CancellationToken ct = default)
    {
        // 1. Busca o usuário e valida o token
        var user = await _db.Users
            .Include(u => u.UserCompanyRoles) // Trazemos os vínculos para gerar o novo token
            .ThenInclude(ucr => ucr.Company)
            .FirstOrDefaultAsync(u => u.Email == command.Email, ct);

        if (user == null || user.RefreshToken != command.RefreshToken || user.RefreshTokenExpiryTime <= DateTime.UtcNow)
        {
            return Results.Unauthorized(); // Se o token for falso ou estiver vencido, recusa.
        }

        // 2. Prepara as empresas para o novo JWT
        var allowedCompanyIds = user.IsMaster
            ? await _db.Companies.Select(c => c.Id).ToListAsync(ct)
            : user.UserCompanyRoles.Select(ucr => ucr.CompanyId).ToList();

        // 3. Gera novos tokens
        var newAccessToken = _jwt.GenerateToken(user, allowedCompanyIds);
        var newRefreshToken = _jwt.GenerateRefreshToken();

        // 4. Salva o novo Refresh Token no banco (rotacionando o token por seguranca)
        user.SetRefreshToken(newRefreshToken, DateTime.UtcNow.AddDays(7));
        await _db.SaveChangesAsync(ct);

        // AQUI: Retornando AccessToken no padrão da indústria
        return Results.Ok(new { AccessToken = newAccessToken, RefreshToken = newRefreshToken });
    }
}

public static class RefreshTokenEndpoint
{
    public static void MapRefreshTokenEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/identity/refresh", async (RefreshTokenCommand command, ICommandHandler<RefreshTokenCommand, IResult> h, CancellationToken ct)
            => await h.HandleAsync(command, ct))
        .WithTags("Identity")
        .AllowAnonymous(); // Rota aberta, pois quem valida a segurança é o próprio handler
    }
}