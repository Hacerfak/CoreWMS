using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using CoreWMS.Api.Features.Identity.Entities;
using Microsoft.IdentityModel.Tokens;

namespace CoreWMS.Api.Infrastructure.Auth;

public class JwtTokenGenerator
{
    private readonly IConfiguration _configuration;

    public JwtTokenGenerator(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string GenerateToken(User user, List<Guid> allowedCompanyIds)
    {
        var secret = _configuration["JwtSettings:Secret"] ?? "SuperSecretKeyThatNeedsToBeAtLeast32BytesLong!";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim("name", user.Name),
            new Claim("isMaster", user.IsMaster.ToString()),
            new Claim("companies", string.Join(",", allowedCompanyIds))
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(10), // Diminuímos o tempo de vida!
            SigningCredentials = credentials,
            Issuer = "CoreWMS",
            Audience = "CoreWMS.Users"
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);

        return tokenHandler.WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var randomNumber = new byte[64];
        using var rng = System.Security.Cryptography.RandomNumberGenerator.Create();
        rng.GetBytes(randomNumber);
        return Convert.ToBase64String(randomNumber);
    }
}