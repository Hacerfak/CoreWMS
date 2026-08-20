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

    public string GenerateToken(User user)
    {
        // Puxando a chave secreta (vamos configurar isso no appsettings/env)
        var secret = _configuration["JwtSettings:Secret"] ?? "SuperSecretKeyThatNeedsToBeAtLeast32BytesLong!";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // Criando os dados do usuário que vão dentro do token (Claims)
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("name", user.Name),
            new Claim("isMaster", user.IsMaster.ToString())
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddHours(4), // Token válido por 4 horas
            SigningCredentials = credentials,
            Issuer = "CoreWMS",
            Audience = "CoreWMS.Users"
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);

        return tokenHandler.WriteToken(token);
    }
}