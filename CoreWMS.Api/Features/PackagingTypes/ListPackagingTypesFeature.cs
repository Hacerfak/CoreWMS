using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.PackagingTypes;

public record ListPackagingTypesQuery() : IRequest<IResult>;

public class ListPackagingTypesHandler : IRequestHandler<ListPackagingTypesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListPackagingTypesHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListPackagingTypesQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var list = await _db.PackagingTypes
            .AsNoTracking()
            .Where(p => p.CompanyId == companyId)
            .OrderBy(p => p.Code)
            .ProjectToType<PackagingTypeDto>()
            .ToListAsync(ct);

        return Results.Ok(list);
    }
}

public static class ListPackagingTypesEndpoints
{
    public static void MapListPackagingTypesEndpoints(this IEndpointRouteBuilder app)
    {
        // Nota: Apenas exige autorização base, libertando os operadores para listarem os tipos sem restrições
        app.MapGet("/api/packaging-types", async (IMediator mediator) => await mediator.Send(new ListPackagingTypesQuery()))
           .WithTags("PackagingTypes")
           .RequireAuthorization();
    }
}