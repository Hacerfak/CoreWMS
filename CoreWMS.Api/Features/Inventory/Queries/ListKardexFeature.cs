using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ListKardexQuery(
    Guid? CustomerId,
    string? Sku,
    string? Lpn,
    string? Batch,
    string? NfeNumber,
    Guid? ProductId,
    Guid? LocationId = null,
    int? Status = null,
    int? QualityStatus = null,
    DateTime? StartDate = null,
    DateTime? EndDate = null,
    int Page = 1,
    int PageSize = 20
) : IRequest<IResult>;

public class ListKardexQueryValidator : AbstractValidator<ListKardexQuery>
{
    public ListKardexQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 1000).WithMessage("O tamanho da página deve ser entre 1 e 1000.");
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

        var baseQuery = from t in _db.InventoryTransactions.AsNoTracking()
                        where t.CompanyId == companyId
                        join c in _db.Customers.AsNoTracking() on t.CustomerId equals c.Id
                        join p in _db.Products.AsNoTracking() on t.ProductId equals p.Id
                        join h in _db.HandlingUnits.AsNoTracking() on t.HandlingUnitId equals h.Id into hGroup
                        from hu in hGroup.DefaultIfEmpty()
                        join l in _db.Locations.AsNoTracking() on t.LocationId equals l.Id into lGroup
                        from loc in lGroup.DefaultIfEmpty()
                        select new
                        {
                            Transaction = t,
                            HandlingUnit = hu,
                            CustomerName = c.CorporateName,
                            ProductSku = p.Sku,
                            ProductDescription = p.Description,
                            HandlingUnitLpn = hu != null ? hu.Lpn : null,
                            HandlingUnitBatch = hu != null ? hu.Batch : null,
                            HandlingUnitExpirationDate = hu != null ? hu.ExpirationDate : null,
                            LocationPath = loc != null ? loc.FullPath : null
                        };

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            baseQuery = baseQuery.Where(q => allowedCustomerIds.Contains(q.Transaction.CustomerId));
        }

        if (request.CustomerId.HasValue)
            baseQuery = baseQuery.Where(q => q.Transaction.CustomerId == request.CustomerId.Value);

        if (request.ProductId.HasValue)
            baseQuery = baseQuery.Where(q => q.Transaction.ProductId == request.ProductId.Value);

        if (request.LocationId.HasValue)
            baseQuery = baseQuery.Where(q => q.Transaction.LocationId == request.LocationId.Value);

        if (request.Status.HasValue)
        {
            var statusEnum = (HuStatus)request.Status.Value;
            baseQuery = baseQuery.Where(q => q.HandlingUnit != null && q.HandlingUnit.Status == statusEnum);
        }

        if (request.QualityStatus.HasValue)
        {
            var qualityEnum = (QualityStatus)request.QualityStatus.Value;
            baseQuery = baseQuery.Where(q => q.HandlingUnit != null && q.HandlingUnit.QualityStatus == qualityEnum);
        }

        if (!string.IsNullOrWhiteSpace(request.Lpn))
        {
            var lpnTerm = request.Lpn.Trim();
            baseQuery = baseQuery.Where(q => q.HandlingUnitLpn != null && EF.Functions.ILike(q.HandlingUnitLpn, $"%{lpnTerm}%"));
        }

        if (!string.IsNullOrWhiteSpace(request.Sku))
        {
            var skuTerm = request.Sku.Trim();
            baseQuery = baseQuery.Where(q => EF.Functions.ILike(q.ProductSku, $"%{skuTerm}%") || EF.Functions.ILike(q.ProductDescription, $"%{skuTerm}%"));
        }

        if (!string.IsNullOrWhiteSpace(request.Batch))
        {
            var batchTerm = request.Batch.Trim();
            baseQuery = baseQuery.Where(q => q.HandlingUnitBatch != null && EF.Functions.ILike(q.HandlingUnitBatch, $"%{batchTerm}%"));
        }

        if (!string.IsNullOrWhiteSpace(request.NfeNumber))
        {
            var term = request.NfeNumber.Trim();
            var inboundOrderIds = await _db.InboundOrders
                .AsNoTracking()
                .Where(o => o.CompanyId == companyId && (EF.Functions.ILike(o.AccessKey, $"%{term}%") || o.AccessKey.Contains(term)))
                .Select(o => o.Id)
                .ToListAsync(ct);

            baseQuery = baseQuery.Where(q =>
                (q.Transaction.SourceDocumentNumber != null && EF.Functions.ILike(q.Transaction.SourceDocumentNumber, $"%{term}%")) ||
                (q.HandlingUnit != null && q.HandlingUnit.ReceiptDocumentId.HasValue && inboundOrderIds.Contains(q.HandlingUnit.ReceiptDocumentId.Value)) ||
                (q.Transaction.SourceDocumentId.HasValue && inboundOrderIds.Contains(q.Transaction.SourceDocumentId.Value))
            );
        }

        if (request.StartDate.HasValue)
        {
            var startDate = request.StartDate.Value;
            var startUtc = startDate.Kind == DateTimeKind.Utc && startDate.TimeOfDay > TimeSpan.Zero
                ? startDate
                : DateTime.SpecifyKind(startDate.Date, DateTimeKind.Utc);
            baseQuery = baseQuery.Where(q => q.Transaction.CreatedAt >= startUtc);
        }

        if (request.EndDate.HasValue)
        {
            var endDate = request.EndDate.Value;
            var endUtc = endDate.Kind == DateTimeKind.Utc && endDate.TimeOfDay > TimeSpan.Zero
                ? endDate
                : DateTime.SpecifyKind(endDate.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
            baseQuery = baseQuery.Where(q => q.Transaction.CreatedAt <= endUtc);
        }

        var totalCount = await baseQuery.CountAsync(ct);
        var totalInputs = await baseQuery.Where(q => q.Transaction.QuantityChange > 0).SumAsync(q => (decimal?)q.Transaction.QuantityChange, ct) ?? 0m;
        var totalOutputs = await baseQuery.Where(q => q.Transaction.QuantityChange < 0).SumAsync(q => (decimal?)Math.Abs(q.Transaction.QuantityChange), ct) ?? 0m;
        var netChange = totalInputs - totalOutputs;

        var skip = (request.Page - 1) * request.PageSize;

        var items = await baseQuery
            .OrderByDescending(q => q.Transaction.CreatedAt)
            .Skip(skip)
            .Take(request.PageSize)
            .Select(q => new KardexTransactionDto(
                q.Transaction.Id,
                q.Transaction.CreatedAt,
                q.CustomerName,
                q.ProductSku,
                q.ProductDescription,
                q.HandlingUnitLpn,
                q.HandlingUnitBatch,
                q.HandlingUnitExpirationDate,
                q.Transaction.Type.ToString(),
                q.Transaction.QuantityChange,
                q.Transaction.BalanceAfter,
                q.LocationPath,
                q.Transaction.SourceDocumentNumber
            )).ToListAsync(ct);

        var response = new KardexResponse(items, totalCount, request.Page, request.PageSize, totalInputs, totalOutputs, netChange);
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