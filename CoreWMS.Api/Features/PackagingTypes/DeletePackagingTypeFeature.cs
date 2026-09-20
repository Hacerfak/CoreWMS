using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.PackagingTypes;

public record DeletePackagingTypeCommand(Guid Id) : IRequest<IResult>;

public class DeletePackagingTypeHandler : IRequestHandler<DeletePackagingTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeletePackagingTypeHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeletePackagingTypeCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var pt = await _db.PackagingTypes.FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);

        if (pt == null) return Results.NotFound();

        try
        {
            _db.PackagingTypes.Remove(pt);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir, pois já existem produtos a utilizar esta embalagem." });
        }

        return Results.NoContent();
    }
}

public static class DeletePackagingTypeEndpoints
{
    public static void MapDeletePackagingTypeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/packaging-types/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeletePackagingTypeCommand(id)))
           .WithTags("PackagingTypes")
           .RequireAuthorization()
           .RequirePermission(Permissions.Packing.Manage);
    }
}