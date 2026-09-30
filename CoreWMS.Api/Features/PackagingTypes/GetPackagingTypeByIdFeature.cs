using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.PackagingTypes;

public record PackagingTypeDetailDto(Guid Id, string Code, string Description, bool IsActive);

public record GetPackagingTypeByIdQuery(Guid Id) : IRequest<IResult>;

public class GetPackagingTypeByIdHandler : IRequestHandler<GetPackagingTypeByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetPackagingTypeByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetPackagingTypeByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var type = await _db.PackagingTypes.AsNoTracking()
            .Where(pt => pt.Id == request.Id && pt.CompanyId == companyId)
            .Select(pt => new PackagingTypeDetailDto(pt.Id, pt.Code, pt.Description, pt.IsActive))
            .FirstOrDefaultAsync(ct);

        if (type == null) return Results.NotFound(new { Message = "Tipo de embalagem não encontrado." });

        return Results.Ok(type);
    }
}

public static class GetPackagingTypeByIdEndpoints
{
    public static void MapGetPackagingTypeByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/packaging-types/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetPackagingTypeByIdQuery(id)))
           .WithTags("PackagingTypes")
           .RequireAuthorization();
    }
}