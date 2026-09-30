using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.PackagingTypes;

public record PackagingTypeSummaryDto(Guid Id, string Code, string Description);

public record GetPackagingTypesSummaryQuery : IRequest<IResult>;

public class GetPackagingTypesSummaryHandler : IRequestHandler<GetPackagingTypesSummaryQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetPackagingTypesSummaryHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetPackagingTypesSummaryQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var types = await _db.PackagingTypes.AsNoTracking()
            .Where(pt => pt.CompanyId == companyId && pt.IsActive)
            .OrderBy(pt => pt.Code)
            .Select(pt => new PackagingTypeSummaryDto(pt.Id, pt.Code, pt.Description))
            .ToListAsync(ct);

        return Results.Ok(types);
    }
}

public static class GetPackagingTypesSummaryEndpoints
{
    public static void MapGetPackagingTypesSummaryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/packaging-types/summary", async (IMediator mediator) =>
            await mediator.Send(new GetPackagingTypesSummaryQuery()))
           .WithTags("PackagingTypes")
           .RequireAuthorization();
    }
}