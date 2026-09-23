using System.Security.Claims;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CoreWMS.Api.Infrastructure.Security;

public class RequirePermissionFilter : IEndpointFilter
{
    private readonly string _permission;

    public RequirePermissionFilter(string permission)
    {
        _permission = permission;
    }

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var httpContext = context.HttpContext;
        var user = httpContext.User;

        // 1. Identificação básica do Usuário
        var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Results.Unauthorized();
        }

        // 2. Se for Master, ignora checagem e concede acesso total
        var isMaster = user.FindFirst("isMaster")?.Value;
        if (string.Equals(isMaster, "True", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(isMaster, "true", StringComparison.OrdinalIgnoreCase))
        {
            return await next(context);
        }

        // 3. Exige o cabeçalho de isolamento de empresa (Tenant)
        if (!httpContext.Request.Headers.TryGetValue("X-Company-Id", out var companyIdHeader) ||
            !Guid.TryParse(companyIdHeader, out var companyId))
        {
            return Results.BadRequest(new { Message = "O cabeçalho 'X-Company-Id' é obrigatório para esta operação." });
        }

        // 4. Verificação de Permissão Específica na Empresa Ativa (Com Cache)
        var cache = httpContext.RequestServices.GetRequiredService<IMemoryCache>();
        var cacheKey = $"perm:{userId}:{companyId}";

        if (!cache.TryGetValue(cacheKey, out HashSet<string>? userPermissions) || userPermissions == null)
        {
            var db = httpContext.RequestServices.GetRequiredService<ApplicationDbContext>();

            // Confirma vinculo ativo do usuário com a empresa
            var hasCompanyAccess = await db.UserCompanyRoles
                .AnyAsync(ucr => ucr.UserId == userId && ucr.CompanyId == companyId);

            if (!hasCompanyAccess)
            {
                return Results.Forbid();
            }

            var permissionsList = await db.UserCompanyRoles
                .Where(ucr => ucr.UserId == userId && ucr.CompanyId == companyId)
                .SelectMany(ucr => ucr.Role.Permissions)
                .Select(p => p.Permission)
                .ToListAsync();

            userPermissions = new HashSet<string>(permissionsList);

            var cacheOptions = new MemoryCacheEntryOptions()
                .SetSlidingExpiration(TimeSpan.FromMinutes(15))
                .SetAbsoluteExpiration(TimeSpan.FromHours(1));

            cache.Set(cacheKey, userPermissions, cacheOptions);
        }

        if (!userPermissions.Contains(_permission))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status403Forbidden,
                title: "Acesso Negado",
                detail: $"Seu perfil não possui a permissão '{_permission}' nesta empresa.");
        }

        return await next(context);
    }
}

public static class PermissionFilterExtensions
{
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder builder, string permission)
    {
        return builder.AddEndpointFilter(new RequirePermissionFilter(permission));
    }
}