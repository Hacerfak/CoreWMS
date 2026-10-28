using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

public record ProductPackagingOptionDto(
    Guid Id,
    Guid PackagingTypeId,
    string Code,
    string Description,
    decimal ConversionFactor,
    string? Barcode,
    decimal GrossWeight,
    decimal NetWeight,
    bool AllowFractionalPicking
);

public record GetProductPackagingsQuery(Guid ProductId) : IRequest<IResult>;

public class GetProductPackagingsHandler : IRequestHandler<GetProductPackagingsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetProductPackagingsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetProductPackagingsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Validação de pertença do produto ao Tenant
        var productExists = await _db.Products
            .AsNoTracking()
            .AnyAsync(p => p.Id == request.ProductId && p.CompanyId == companyId, ct);

        if (!productExists)
            return Results.NotFound(new { Message = "Produto não encontrado." });

        // 2. Projeção direta e indexada apenas com os dados necessários
        var packagings = await _db.ProductPackagings
            .AsNoTracking()
            .Include(pp => pp.PackagingType)
            .Where(pp => pp.ProductId == request.ProductId && pp.Product.CompanyId == companyId)
            .OrderBy(pp => pp.ConversionFactor)
            .Select(pp => new ProductPackagingOptionDto(
                pp.Id,
                pp.PackagingTypeId,
                pp.PackagingType.Code,
                pp.PackagingType.Description,
                pp.ConversionFactor,
                pp.Barcode,
                pp.GrossWeight,
                pp.NetWeight,
                pp.AllowFractionalPicking
            ))
            .ToListAsync(ct);

        return Results.Ok(packagings);
    }
}

public static class GetProductPackagingsEndpoints
{
    public static void MapGetProductPackagingsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/products/{productId:guid}/packagings", async (Guid productId, IMediator mediator) =>
            await mediator.Send(new GetProductPackagingsQuery(productId)))
           .WithTags("Products")
           .RequireAuthorization();
    }
}