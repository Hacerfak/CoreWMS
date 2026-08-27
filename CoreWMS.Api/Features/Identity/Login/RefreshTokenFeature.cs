using CoreWMS.Api.Infrastructure.Auth;
using CoreWMS.Api.Infrastructure.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Login;

public record RefreshTokenCommand(string Email, string RefreshToken) : IRequest<IResult>;

public class RefreshTokenHandler : IRequestHandler<RefreshTokenCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly JwtTokenGenerator _jwt;

    public RefreshTokenHandler(ApplicationDbContext db, JwtTokenGenerator jwt)
    {
        _db = db;
        _jwt = jwt;
    }

    public async Task<IResult> Handle(RefreshTokenCommand request, CancellationToken ct)
    {
        var user = await _db.Users.Include(u => u.UserCompanyRoles).ThenInclude(ucr => ucr.Company).FirstOrDefaultAsync(u => u.Email == request.Email, ct);
        if (user == null || user.RefreshToken != request.RefreshToken || user.RefreshTokenExpiryTime <= DateTime.UtcNow)
            return Results.Unauthorized();

        var allowedCompanyIds = user.IsMaster ? await _db.Companies.Select(c => c.Id).ToListAsync(ct) : user.UserCompanyRoles.Select(ucr => ucr.CompanyId).ToList();

        var newAccessToken = _jwt.GenerateToken(user, allowedCompanyIds);
        var newRefreshToken = _jwt.GenerateRefreshToken();

        user.SetRefreshToken(newRefreshToken, DateTime.UtcNow.AddDays(7));
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { AccessToken = newAccessToken, RefreshToken = newRefreshToken });
    }
}

public static class RefreshTokenEndpoint
{
    public static void MapRefreshTokenEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/identity/refresh", async (RefreshTokenCommand cmd, IMediator mediator) => await mediator.Send(cmd))
        .WithTags("Identity").AllowAnonymous();
    }
}