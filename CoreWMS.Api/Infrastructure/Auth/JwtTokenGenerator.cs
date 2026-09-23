using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CoreWMS.Api.Features.Identity.Entities;
using Microsoft.IdentityModel.Tokens;

namespace CoreWMS.Api.Infrastructure.Auth;

public interface IJwtTokenGenerator
{
    string GenerateToken(User user, List<Guid> allowedCompanyIds, List<Guid> allowedCustomerIds);
    string GenerateRefreshToken();
}

public class JwtTokenGenerator : IJwtTokenGenerator
{
    private readonly IConfiguration _configuration;

    public JwtTokenGenerator(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string GenerateToken(User user, List<Guid> allowedCompanyIds, List<Guid> allowedCustomerIds)
    {
        var secret = _configuration["JwtSettings:Secret"] ?? "SuperSecretKeyThatNeedsToBeAtLeast32BytesLong!";
        var issuer = _configuration["JwtSettings:Issuer"] ?? "CoreWMS";
        var audience = _configuration["JwtSettings:Audience"] ?? "CoreWMS.Users";
        var expirationMinutes = _configuration.GetValue<int?>("JwtSettings:ExpirationMinutes") ?? 1;

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var isPartner = allowedCustomerIds.Any();

        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim("name", user.Name),
            new Claim("isMaster", user.IsMaster.ToString()),
            new Claim("companies", string.Join(",", allowedCompanyIds)),
            new Claim("isPartner", isPartner.ToString()),
            new Claim("customers", string.Join(",", allowedCustomerIds))
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(expirationMinutes),
            SigningCredentials = credentials,
            Issuer = issuer,
            Audience = audience
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);

        return tokenHandler.WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var randomNumber = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomNumber);

        return Convert.ToBase64String(randomNumber);
    }
}