using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record GetFiscalOperationRulesQuery : IRequest<IResult>;

public class GetFiscalOperationRulesHandler : IRequestHandler<GetFiscalOperationRulesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetFiscalOperationRulesHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetFiscalOperationRulesQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var rules = await _db.FiscalOperationRules
            .AsNoTracking()
            .Include(r => r.Exceptions)
            .Where(r => r.CompanyId == companyId)
            .OrderBy(r => r.Description)
            .Select(r => r.ToDto())
            .ToListAsync(ct);

        return Results.Ok(rules);
    }
}

public static class GetFiscalOperationRulesEndpoints
{
    public static void MapGetFiscalOperationRulesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/fiscal/rules", async (IMediator mediator) =>
            await mediator.Send(new GetFiscalOperationRulesQuery()))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.View);
    }
}