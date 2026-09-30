using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

public record ProductSummaryDto(
    Guid Id,
    Guid CustomerId,
    string CustomerName,
    string Sku,
    string Description
);

public record ListProductsQuery(string? Search, Guid? CustomerId, int Page = 1, int PageSize = 20) : IRequest<IResult>;

public class ListProductsQueryValidator : AbstractValidator<ListProductsQuery>
{
    public ListProductsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 1000);
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
        var q = _db.Products.AsNoTracking()
            .Include(p => p.Customer)
            .Where(p => p.CompanyId == companyId);

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(p => allowedCustomerIds.Contains(p.CustomerId));
        }

        if (request.CustomerId.HasValue)
            q = q.Where(p => p.CustomerId == request.CustomerId.Value);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = $"%{request.Search.Trim()}%";
            q = q.Where(p => EF.Functions.ILike(p.Sku, s) ||
                             EF.Functions.ILike(p.Description, s) ||
                             (p.BaseBarcode != null && EF.Functions.ILike(p.BaseBarcode, s)));
        }

        var totalCount = await q.CountAsync(ct);

        // Projeção hiper leve e direta
        var items = await q
            .OrderBy(p => p.Sku)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(p => new ProductSummaryDto(
                p.Id,
                p.CustomerId,
                p.Customer.CorporateName,
                p.Sku,
                p.Description
            ))
            .ToListAsync(ct);

        var response = new PaginatedResult<ProductSummaryDto>(items, totalCount, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public static class ListProductsEndpoints
{
    public static void MapListProductsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/products", async ([AsParameters] ListProductsQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Products")
           .RequireAuthorization()
           .RequirePermission(Permissions.Products.View);
    }
}