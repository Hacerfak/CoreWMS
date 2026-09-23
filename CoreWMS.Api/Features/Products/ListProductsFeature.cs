using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

public record ListProductsQuery(Guid? CustomerId, string? Search, int Page = 1, int PageSize = 20) : IRequest<IResult>;

public class ListProductsQueryValidator : AbstractValidator<ListProductsQuery>
{
    public ListProductsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100).WithMessage("O tamanho da página deve ser entre 1 e 100.");
    }
}

public class ListProductsHandler : IRequestHandler<ListProductsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListProductsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListProductsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.Products
            .AsNoTracking()
            .Include(p => p.Customer)
            .Include(p => p.Packagings)
                .ThenInclude(pp => pp.PackagingType)
            .Where(p => p.CompanyId == companyId);

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(p => allowedIds.Contains(p.CustomerId));
        }

        if (request.CustomerId.HasValue)
            query = query.Where(p => p.CustomerId == request.CustomerId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = $"%{request.Search.Trim()}%";
            query = query.Where(p => EF.Functions.ILike(p.Sku, s) ||
                                     EF.Functions.ILike(p.Description, s) ||
                                     (p.BaseBarcode != null && EF.Functions.ILike(p.BaseBarcode, s)));
        }

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderBy(p => p.Sku)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        var dtos = items.Select(p => new ProductDto(
            p.Id, p.CustomerId, p.Customer.CorporateName, p.Sku, p.Description, p.BaseUnit, p.BaseBarcode, p.Ncm, p.Cest, p.Origin, p.MaxStacking,
            p.TracksBatch, p.StrictBatch, p.TracksManufacture, p.StrictManufacture, p.TracksExpiration, p.StrictExpiration, p.TracksSerial, p.StrictSerial,
            (int)p.PickingStrategy, (int)p.PickingBaseDate, p.InboundShelfLifeToleranceDays, p.OutboundShelfLifeToleranceDays, p.IsActive,
            p.Packagings.Select(pp => new ProductPackagingDto(
                pp.Id, pp.PackagingTypeId, pp.PackagingType.Code, pp.ConversionFactor,
                pp.AllowFractionalPicking, pp.GrossWeight, pp.NetWeight, pp.LengthMm, pp.WidthMm, pp.HeightMm, pp.CubageM3, pp.Barcode
            )).ToList()
        )).ToList();

        var response = new PaginatedResult<ProductDto>(dtos, totalCount, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public static class ListProductsEndpoints
{
    public static void MapListProductsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/products", async ([AsParameters] ListProductsQuery query, IMediator mediator) => await mediator.Send(query))
           .WithTags("Products")
           .RequireAuthorization()
           .RequirePermission(Permissions.Products.View);
    }
}