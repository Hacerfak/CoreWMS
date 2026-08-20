using System.Security.Claims;

namespace CoreWMS.Api.Infrastructure.Security;

public class TenantValidationFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        // 1. Tenta ler o cabeçalho X-Company-Id
        if (!context.HttpContext.Request.Headers.TryGetValue("X-Company-Id", out var companyIdHeader) ||
            !Guid.TryParse(companyIdHeader, out var requestCompanyId))
        {
            return Results.BadRequest(new { Message = "O cabeçalho 'X-Company-Id' é obrigatório para esta operação." });
        }

        // 2. Pega as informações do usuário logado (Token JWT)
        var user = context.HttpContext.User;
        var isMaster = bool.Parse(user.FindFirst("isMaster")?.Value ?? "false");

        // 3. Se for Master, passa direto!
        if (isMaster)
        {
            return await next(context);
        }

        // 4. Se não for Master, verifica se o CNPJ solicitado está na lista de permissões do Token
        var allowedCompaniesClaim = user.FindFirst("companies")?.Value ?? "";
        var allowedCompanies = allowedCompaniesClaim.Split(',', StringSplitOptions.RemoveEmptyEntries);

        if (!allowedCompanies.Contains(requestCompanyId.ToString()))
        {
            return Results.Forbid(); // 403 Forbidden - Toma na cara!
        }

        // 5. Tudo certo, deixa a requisição seguir para o Handler do WMS
        return await next(context);
    }
}