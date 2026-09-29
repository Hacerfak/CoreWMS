// CoreWMS.Api/Features/Inventory/Queries/ListHandlingUnitsFeature.cs
using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ListHandlingUnitsQuery(
    Guid? CustomerId,
    string? Sku,
    Guid? ProductId,
    Guid? ReceiptDocumentId,
    string? Lpn,
    string? Batch,
    string? NfeNumber,
    Guid? LocationId,
    int? Status,
    int? QualityStatus,
    DateTime? StartDate,
    DateTime? EndDate,
    int Page = 1,
    int PageSize = 20
) : IRequest<IResult>;

public class ListHandlingUnitsQueryValidator : AbstractValidator<ListHandlingUnitsQuery>
{
    public ListHandlingUnitsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 1000).WithMessage("O tamanho da página deve ser entre 1 e 1000.");
    }
}

public class ListHandlingUnitsHandler : IRequestHandler<ListHandlingUnitsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListHandlingUnitsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var q = _db.HandlingUnits.AsNoTracking()
            .Include(h => h.Customer)
            .Include(h => h.Product)
            .Include(h => h.PackagingType)
            .Include(h => h.CurrentLocation)
            .Where(h => h.CompanyId == companyId);

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(h => allowedCustomerIds.Contains(h.CustomerId));
        }

        // 1. Filtros Mestre
        if (request.CustomerId.HasValue) q = q.Where(h => h.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) q = q.Where(h => h.ProductId == request.ProductId);
        if (request.ReceiptDocumentId.HasValue) q = q.Where(h => h.ReceiptDocumentId == request.ReceiptDocumentId);
        if (request.LocationId.HasValue) q = q.Where(h => h.CurrentLocationId == request.LocationId);
        if (request.Status.HasValue) q = q.Where(h => h.Status == (HuStatus)request.Status.Value);
        if (request.QualityStatus.HasValue) q = q.Where(h => h.QualityStatus == (QualityStatus)request.QualityStatus.Value);

        // 2. Filtros de Texto na API
        if (!string.IsNullOrWhiteSpace(request.Lpn))
            q = q.Where(h => EF.Functions.ILike(h.Lpn, $"%{request.Lpn.Trim()}%"));

        if (!string.IsNullOrWhiteSpace(request.Sku))
            q = q.Where(h => EF.Functions.ILike(h.Product.Sku, $"%{request.Sku.Trim()}%") || EF.Functions.ILike(h.Product.Description, $"%{request.Sku.Trim()}%"));

        if (!string.IsNullOrWhiteSpace(request.Batch))
            q = q.Where(h => h.Batch != null && EF.Functions.ILike(h.Batch, $"%{request.Batch.Trim()}%"));

        if (!string.IsNullOrWhiteSpace(request.NfeNumber))
        {
            var term = request.NfeNumber.Trim();
            var inboundOrderIds = await _db.InboundOrders
                .AsNoTracking()
                .Where(o => o.CompanyId == companyId && (EF.Functions.ILike(o.AccessKey, $"%{term}%") || o.AccessKey.Contains(term)))
                .Select(o => o.Id)
                .ToListAsync(ct);

            q = q.Where(h => h.ReceiptDocumentId.HasValue && inboundOrderIds.Contains(h.ReceiptDocumentId.Value));
        }

        // 3. Filtro por Período (00:00:00 às 23:59:59)
        if (request.StartDate.HasValue)
        {
            var startUtc = DateTime.SpecifyKind(request.StartDate.Value.Date, DateTimeKind.Utc);
            q = q.Where(h => h.CreatedAt >= startUtc);
        }

        if (request.EndDate.HasValue)
        {
            var endDate = request.EndDate.Value;
            var endUtc = endDate.Kind == DateTimeKind.Utc && endDate.TimeOfDay > TimeSpan.Zero
                ? endDate
                : DateTime.SpecifyKind(endDate.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);

            q = q.Where(h => h.CreatedAt <= endUtc);
        }

        var totalCount = await q.CountAsync(ct);
        var skip = (request.Page - 1) * request.PageSize;

        var items = await q
            .OrderByDescending(h => h.CreatedAt)
            .Skip(skip)
            .Take(request.PageSize)
            .ToListAsync(ct);

        var receiptIds = items.Where(h => h.ReceiptDocumentId.HasValue).Select(h => h.ReceiptDocumentId!.Value).Distinct().ToList();
        var inboundOrdersMap = await _db.InboundOrders
            .AsNoTracking()
            .Where(o => receiptIds.Contains(o.Id))
            .ToDictionaryAsync(o => o.Id, o => o.AccessKey, ct);

        var dtos = items.Select(h =>
        {
            string? accessKey = h.ReceiptDocumentId.HasValue && inboundOrdersMap.TryGetValue(h.ReceiptDocumentId.Value, out var key) ? key : null;
            string? nfeNum = null;
            string? nfeSerie = null;

            if (!string.IsNullOrEmpty(accessKey) && accessKey.Length >= 34)
            {
                nfeSerie = int.Parse(accessKey.Substring(22, 3)).ToString();
                nfeNum = int.Parse(accessKey.Substring(25, 9)).ToString();
            }

            decimal totalValue = h.CurrentQuantity * h.UnitValue;

            return new HandlingUnitDto(
                h.Id,
                h.Lpn,
                h.Customer.CorporateName,
                h.Product.Sku,
                h.Product.Description,
                h.Product.BaseUnit,
                h.PackagingType.Code,
                h.CurrentLocationId,
                h.CurrentLocation?.FullPath,
                h.Batch,
                h.ManufactureDate,
                h.ExpirationDate,
                h.SerialNumber,
                h.InitialQuantity,
                h.CurrentQuantity,
                h.UnitValue,
                totalValue,
                h.Status.ToString(),
                h.QualityStatus.ToString(),
                h.ReceiptDocumentId,
                h.CreatedAt,
                nfeNum,
                nfeSerie,
                accessKey
            );
        }).ToList();

        var response = new PaginatedResult<HandlingUnitDto>(dtos, totalCount, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public static class ListHandlingUnitsEndpoints
{
    public static void MapListHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inventory/handling-units", async ([AsParameters] ListHandlingUnitsQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}