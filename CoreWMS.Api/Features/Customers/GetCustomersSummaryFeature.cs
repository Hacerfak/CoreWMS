using System.Security.Claims;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

public record CustomerSummaryDto(Guid Id, string CorporateName, string Cnpj);

public record GetCustomersSummaryQuery(
    Guid? CompanyId = null,
    Guid? UserId = null,
    bool IsMaster = false
) : IRequest<IResult>;

public class GetCustomersSummaryHandler : IRequestHandler<GetCustomersSummaryQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetCustomersSummaryHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetCustomersSummaryQuery request, CancellationToken ct)
    {
        var activeCompanyId = _tenant.GetCompanyId();
        var targetCompanyId = activeCompanyId;

        if (request.CompanyId.HasValue && request.CompanyId.Value != Guid.Empty && request.CompanyId.Value != activeCompanyId)
        {
            if (!request.IsMaster)
            {
                bool hasCompanyAccess = request.UserId.HasValue && await _db.UserCompanyRoles
                    .AsNoTracking()
                    .AnyAsync(ucr => ucr.UserId == request.UserId.Value && ucr.CompanyId == request.CompanyId.Value, ct);

                if (!hasCompanyAccess)
                    return Results.Forbid();
            }

            targetCompanyId = request.CompanyId.Value;
        }

        var q = _db.Customers
            .AsNoTracking()
            .Where(c => c.CompanyId == targetCompanyId && c.IsActive);

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(c => allowedCustomerIds.Contains(c.Id));
        }

        var customers = await q
            .OrderBy(c => c.CorporateName)
            .Select(c => new CustomerSummaryDto(c.Id, c.CorporateName, c.Cnpj))
            .ToListAsync(ct);

        return Results.Ok(customers);
    }
}

public static class GetCustomersSummaryEndpoints
{
    public static void MapGetCustomersSummaryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/customers/summary", async (
            Guid? companyId,
            ClaimsPrincipal userPrincipal,
            IMediator mediator) =>
        {
            var isMaster = bool.TryParse(userPrincipal.FindFirst("isMaster")?.Value, out var m) && m;
            Guid? userId = Guid.TryParse(userPrincipal.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var uid) ? uid : null;

            return await mediator.Send(new GetCustomersSummaryQuery(companyId, userId, isMaster));
        })
        .WithTags("Customers")
        .RequireAuthorization()
        .RequirePermission(Permissions.Customers.View);
    }
}