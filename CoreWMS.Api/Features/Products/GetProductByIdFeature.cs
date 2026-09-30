using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

public record ProductPackagingDetailDto(
    Guid Id,
    Guid PackagingTypeId,
    string PackagingTypeCode,
    string? Barcode,
    decimal ConversionFactor,
    bool AllowFractionalPicking,
    decimal GrossWeight,
    decimal NetWeight,
    decimal LengthMm,
    decimal WidthMm,
    decimal HeightMm,
    int MaxStacking
);

public record ProductDetailDto(
    Guid Id,
    Guid CustomerId,
    string CustomerName,
    string Sku,
    string Description,
    string BaseUnit,
    string? BaseBarcode,
    string? Ncm,
    string? Cest,
    int Origin,
    bool TracksBatch,
    bool StrictBatch,
    bool TracksManufacture,
    bool StrictManufacture,
    bool TracksExpiration,
    bool StrictExpiration,
    bool TracksSerial,
    bool StrictSerial,
    int PickingStrategy,
    int PickingBaseDate,
    int? InboundShelfLifeToleranceDays,
    int? OutboundShelfLifeToleranceDays,
    List<ProductPackagingDetailDto> Packagings
);

public record GetProductByIdQuery(Guid Id) : IRequest<IResult>;

public class GetProductByIdHandler : IRequestHandler<GetProductByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetProductByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetProductByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.Products
            .AsNoTracking()
            .Include(p => p.Customer)
            .Include(p => p.Packagings)
                .ThenInclude(pack => pack.PackagingType)
            .Where(p => p.Id == request.Id && p.CompanyId == companyId);

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(p => allowedCustomerIds.Contains(p.CustomerId));
        }

        var product = await query
            .Select(p => new ProductDetailDto(
                p.Id,
                p.CustomerId,
                p.Customer.CorporateName,
                p.Sku,
                p.Description,
                p.BaseUnit,
                p.BaseBarcode,
                p.Ncm,
                p.Cest,
                p.Origin,
                p.TracksBatch,
                p.StrictBatch,
                p.TracksManufacture,
                p.StrictManufacture,
                p.TracksExpiration,
                p.StrictExpiration,
                p.TracksSerial,
                p.StrictSerial,
                (int)p.PickingStrategy,
                (int)p.PickingBaseDate,
                p.InboundShelfLifeToleranceDays,
                p.OutboundShelfLifeToleranceDays,
                p.Packagings.Select(pack => new ProductPackagingDetailDto(
                    pack.Id,
                    pack.PackagingTypeId,
                    pack.PackagingType.Code,
                    pack.Barcode,
                    pack.ConversionFactor,
                    pack.AllowFractionalPicking,
                    pack.GrossWeight,
                    pack.NetWeight,
                    pack.LengthMm,
                    pack.WidthMm,
                    pack.HeightMm,
                    pack.MaxStacking
                )).ToList()
            ))
            .FirstOrDefaultAsync(ct);

        if (product == null)
            return Results.NotFound(new { Message = "Produto não encontrado." });

        return Results.Ok(product);
    }
}

public static class GetProductByIdEndpoints
{
    public static void MapGetProductByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/products/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetProductByIdQuery(id)))
           .WithTags("Products")
           .RequireAuthorization()
           .RequirePermission(Permissions.Products.View);
    }
}