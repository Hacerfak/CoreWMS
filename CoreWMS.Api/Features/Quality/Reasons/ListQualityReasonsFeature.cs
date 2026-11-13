using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality.Reasons;

public record ListQualityReasonsQuery(bool? OnlyActive = null) : IRequest<IResult>;

public class ListQualityReasonsHandler : IRequestHandler<ListQualityReasonsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListQualityReasonsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListQualityReasonsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.QualityReasons
            .AsNoTracking()
            .Where(r => r.CompanyId == companyId);

        if (request.OnlyActive == true)
            query = query.Where(r => r.IsActive);

        var reasons = await query
            .OrderByDescending(r => r.IsActive)
            .ThenBy(r => r.Code)
            .Select(r => new QualityReasonDto(r.Id, r.Code, r.Description, r.IsActive))
            .ToListAsync(ct);

        return Results.Ok(reasons);
    }
}

public static class ListQualityReasonsEndpoints
{
    public static void MapListQualityReasonsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/quality/reasons", async (bool? onlyActive, IMediator mediator) =>
            await mediator.Send(new ListQualityReasonsQuery(onlyActive)))
           .WithTags("Quality")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}