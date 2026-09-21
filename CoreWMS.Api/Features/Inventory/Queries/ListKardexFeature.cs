using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ListKardexQuery(Guid? ProductId, string? Lpn, DateTime? StartDate, DateTime? EndDate, int Page = 1, int PageSize = 20) : IRequest<IResult>;

public class ListKardexQueryValidator : AbstractValidator<ListKardexQuery>
{
    public ListKardexQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

public class ListKardexHandler : IRequestHandler<ListKardexQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListKardexHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListKardexQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = from t in _db.InventoryTransactions.AsNoTracking()
                    where t.CompanyId == companyId
                    join p in _db.Products.AsNoTracking() on t.ProductId equals p.Id
                    join h in _db.HandlingUnits.AsNoTracking() on t.HandlingUnitId equals h.Id into hGroup
                    from hu in hGroup.DefaultIfEmpty()
                    select new { Transaction = t, ProductSku = p.Sku, HandlingUnitLpn = hu != null ? hu.Lpn : null };

        if (request.ProductId.HasValue) query = query.Where(q => q.Transaction.ProductId == request.ProductId);
        if (request.StartDate.HasValue) query = query.Where(q => q.Transaction.CreatedAt >= request.StartDate.Value.ToUniversalTime());
        if (request.EndDate.HasValue) query = query.Where(q => q.Transaction.CreatedAt <= request.EndDate.Value.ToUniversalTime());
        if (!string.IsNullOrWhiteSpace(request.Lpn)) query = query.Where(q => q.HandlingUnitLpn == request.Lpn.Trim().ToUpper());

        var totalTask = query.CountAsync(ct);
        var skip = (request.Page - 1) * request.PageSize;

        var itemsTask = query
            .OrderByDescending(q => q.Transaction.CreatedAt)
            .Skip(skip)
            .Take(request.PageSize)
            .Select(q => new InventoryTransactionDto(
                q.Transaction.Id, q.Transaction.CreatedAt, q.ProductSku, q.HandlingUnitLpn,
                q.Transaction.Type.ToString(), q.Transaction.QuantityChange,
                q.Transaction.BalanceAfter, q.Transaction.SourceDocumentNumber
            )).ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        var response = new PaginatedResult<InventoryTransactionDto>(itemsTask.Result, totalTask.Result, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public static class ListKardexEndpoints
{
    public static void MapListKardexEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inventory/kardex", async ([AsParameters] ListKardexQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}