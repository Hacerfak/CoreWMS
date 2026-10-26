using System.IdentityModel.Tokens.Jwt;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Auth.OAuth2.Requests;
using Google.Apis.Gmail.v1;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Companies;

public static class GoogleOAuthFeature
{
    public static void MapGoogleOAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/companies").WithTags("Companies");

        // 1. Gera o URL de autenticação do Google
        group.MapGet("/{companyId:guid}/google-oauth/url", (
            Guid companyId,
            IConfiguration config,
            IHttpContextAccessor httpContext) =>
        {
            var clientId = config["GoogleOAuth:ClientId"];
            var redirectUri = config["GoogleOAuth:RedirectUri"]
                ?? $"{httpContext.HttpContext!.Request.Scheme}://{httpContext.HttpContext!.Request.Host}/api/companies/google-oauth/callback";

            var scopes = new[]
            {
                GmailService.Scope.GmailSend,
                "https://www.googleapis.com/auth/userinfo.email",
                "openid"
            };

            // Instanciação direta com parâmetros Google-specific (AccessType e Prompt)
            var codeRequestUrl = new GoogleAuthorizationCodeRequestUrl(new Uri("https://accounts.google.com/o/oauth2/v2/auth"))
            {
                ClientId = clientId,
                RedirectUri = redirectUri,
                Scope = string.Join(" ", scopes),
                State = companyId.ToString(),
                AccessType = "offline",
                Prompt = "consent"
            };

            return Results.Ok(new { AuthUrl = codeRequestUrl.Build().ToString() });
        })
        .RequireAuthorization()
        .RequirePermission(Permissions.Companies.Manage);

        // 2. Callback de retorno do Google
        group.MapGet("/google-oauth/callback", async (
            [FromQuery] string code,
            [FromQuery] string state,
            ApplicationDbContext db,
            IConfiguration config,
            IHttpContextAccessor httpContext,
            CancellationToken ct) =>
        {
            if (!Guid.TryParse(state, out var companyId))
                return Results.BadRequest("Estado de requisição inválido.");

            var company = await db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);
            if (company == null) return Results.NotFound("Empresa não encontrada.");

            var redirectUri = config["GoogleOAuth:RedirectUri"]
                ?? $"{httpContext.HttpContext!.Request.Scheme}://{httpContext.HttpContext!.Request.Host}/api/companies/google-oauth/callback";

            var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
            {
                ClientSecrets = new ClientSecrets { ClientId = config["GoogleOAuth:ClientId"], ClientSecret = config["GoogleOAuth:ClientSecret"] },
                Scopes = new[] { GmailService.Scope.GmailSend, "https://www.googleapis.com/auth/userinfo.email", "openid" }
            });

            var token = await flow.ExchangeCodeForTokenAsync(companyId.ToString(), code, redirectUri, ct);

            string userEmail = "faturamento@empresa.com.br";
            if (!string.IsNullOrEmpty(token.IdToken))
            {
                var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token.IdToken);
                userEmail = jwt.Claims.FirstOrDefault(c => c.Type == "email")?.Value ?? userEmail;
            }

            company.ConnectGoogleOAuth(userEmail, token.RefreshToken);
            await db.SaveChangesAsync(ct);

            string responseHtml = @"
<!DOCTYPE html>
<html>
<head><meta charset='utf-8'/><title>Autenticado</title></head>
<body>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', email: '" + userEmail + @"' }, '*');
      window.close();
    } else {
      window.location.href = '/empresas';
    }
  </script>
  <p style='font-family: sans-serif; text-align: center; margin-top: 40px;'>
    Autenticado com sucesso! Esta janela fechará automaticamente...
  </p>
</body>
</html>";
            return Results.Content(responseHtml, "text/html");
        });

        // 3. Desconectar conta do Google
        group.MapPost("/{companyId:guid}/google-oauth/disconnect", async (Guid companyId, ApplicationDbContext db, CancellationToken ct) =>
        {
            var company = await db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);
            if (company == null) return Results.NotFound();

            company.DisconnectGoogleOAuth();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { Message = "Conta do Google desconectada com sucesso." });
        })
        .RequireAuthorization()
        .RequirePermission(Permissions.Companies.Manage);
    }
}