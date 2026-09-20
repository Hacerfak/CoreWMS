using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

public record DeleteProductCommand(Guid Id) : IRequest<IResult>;

public class DeleteProductHandler : IRequestHandler<DeleteProductCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteProductHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteProductCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);
        if (product == null) return Results.NotFound();

        try
        {
            _db.Products.Remove(product);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir o produto pois ele já possui histórico de estoque ou movimentações." });
        }

        return Results.NoContent();
    }
}

public static class DeleteProductEndpoints
{
    public static void MapDeleteProductEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/products/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteProductCommand(id)))
           .WithTags("Products")
           .RequireAuthorization()
           .RequirePermission(Permissions.Products.Delete);
    }
}