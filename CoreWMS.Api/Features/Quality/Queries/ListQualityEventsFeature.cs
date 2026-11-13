using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Quality.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality.Queries;

public record QualityEventImageDetailDto(
    Guid Id,
    string FileName,
    string FilePath,
    long FileSizeBytes,
    DateTime CreatedAt
);

public record QualityEventDetailDto(
    Guid Id,
    Guid HandlingUnitId,
    string Lpn,
    string HuStatus,
    string QualityStatus,
    decimal CurrentQuantity,
    string Unit,
    string ProductSku,
    string ProductDescription,
    Guid CustomerId,
    string CustomerName,
    string? Batch,
    DateTime? ExpirationDate,
    Guid? OriginalLocationId,
    string? OriginalLocationPath,
    Guid? CurrentLocationId,
    string? CurrentLocationPath,
    Guid HoldReasonId,
    string HoldReasonCode,
    string HoldReasonDescription,
    string HoldNotes,
    Guid? ReleaseReasonId,
    string? ReleaseReasonCode,
    string? ReleaseReasonDescription,
    string? ReleaseNotes,
    bool IsResolved,
    DateTime CreatedAt,
    DateTime? ResolvedAt,
    List<QualityEventImageDetailDto> Images
);

public record QualityEventsPagedResponse(
    List<QualityEventDetailDto> Items,
    int TotalCount,
    int OpenEventsCount,
    int ResolvedEventsCount,
    int QuarantineHusCount,
    int DamagedHusCount
);

public record ListQualityEventsQuery(
    Guid? CustomerId,
    Guid? HandlingUnitId,
    bool? IsResolved,
    string? Search,
    DateTime? StartDate,
    DateTime? EndDate,
    int Page = 1,
    int PageSize = 20
) : IRequest<IResult>;

public record GetHandlingUnitQualityHistoryQuery(Guid HandlingUnitId) : IRequest<IResult>;

public class ListQualityEventsHandler :
    IRequestHandler<ListQualityEventsQuery, IResult>,
    IRequestHandler<GetHandlingUnitQualityHistoryQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListQualityEventsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListQualityEventsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 200);

        var baseQuery = _db.QualityEvents
            .AsNoTracking()
            .Include(q => q.HandlingUnit)
                .ThenInclude(h => h.Product)
            .Include(q => q.HandlingUnit)
                .ThenInclude(h => h.Customer)
            .Include(q => q.HandlingUnit)
                .ThenInclude(h => h.CurrentLocation)
            .Include(q => q.OriginalLocation)
            .Include(q => q.HoldReason)
            .Include(q => q.ReleaseReason)
            .Include(q => q.Images)
            .Where(q => q.CompanyId == companyId);

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            baseQuery = baseQuery.Where(q => allowedIds.Contains(q.HandlingUnit.CustomerId));
        }

        if (request.CustomerId.HasValue)
            baseQuery = baseQuery.Where(q => q.HandlingUnit.CustomerId == request.CustomerId.Value);

        if (request.HandlingUnitId.HasValue)
            baseQuery = baseQuery.Where(q => q.HandlingUnitId == request.HandlingUnitId.Value);

        if (request.IsResolved.HasValue)
            baseQuery = baseQuery.Where(q => q.IsResolved == request.IsResolved.Value);

        if (request.StartDate.HasValue)
        {
            var startUtc = request.StartDate.Value.Date.ToUniversalTime();
            baseQuery = baseQuery.Where(q => q.CreatedAt >= startUtc);
        }

        if (request.EndDate.HasValue)
        {
            var endUtc = request.EndDate.Value.Date.AddDays(1).AddTicks(-1).ToUniversalTime();
            baseQuery = baseQuery.Where(q => q.CreatedAt <= endUtc);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToUpper();
            baseQuery = baseQuery.Where(q =>
                q.HandlingUnit.Lpn.ToUpper().Contains(term) ||
                q.HandlingUnit.Product.Sku.ToUpper().Contains(term) ||
                q.HandlingUnit.Product.Description.ToUpper().Contains(term) ||
                q.HoldReason.Code.ToUpper().Contains(term) ||
                q.HoldNotes.ToUpper().Contains(term)
            );
        }

        var totalCount = await baseQuery.CountAsync(ct);

        var metricsQuery = _db.QualityEvents.AsNoTracking().Where(q => q.CompanyId == companyId);
        var huMetricsQuery = _db.HandlingUnits.AsNoTracking().Where(h => h.CompanyId == companyId && h.CurrentQuantity > 0);

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            metricsQuery = metricsQuery.Where(q => allowedIds.Contains(q.HandlingUnit.CustomerId));
            huMetricsQuery = huMetricsQuery.Where(h => allowedIds.Contains(h.CustomerId));
        }

        var openEventsCount = await metricsQuery.CountAsync(q => !q.IsResolved, ct);
        var resolvedEventsCount = await metricsQuery.CountAsync(q => q.IsResolved, ct);
        var quarantineHusCount = await huMetricsQuery.CountAsync(h => h.QualityStatus == QualityStatus.Quarantine, ct);
        var damagedHusCount = await huMetricsQuery.CountAsync(h => h.QualityStatus == QualityStatus.Damaged, ct);

        var events = await baseQuery
            .OrderBy(q => q.IsResolved)
            .ThenByDescending(q => q.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return Results.Ok(new QualityEventsPagedResponse(
            events.Select(MapToDto).ToList(),
            totalCount,
            openEventsCount,
            resolvedEventsCount,
            quarantineHusCount,
            damagedHusCount
        ));
    }

    public async Task<IResult> Handle(GetHandlingUnitQualityHistoryQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var events = await _db.QualityEvents
            .AsNoTracking()
            .Include(q => q.HandlingUnit)
                .ThenInclude(h => h.Product)
            .Include(q => q.HandlingUnit)
                .ThenInclude(h => h.Customer)
            .Include(q => q.HandlingUnit)
                .ThenInclude(h => h.CurrentLocation)
            .Include(q => q.OriginalLocation)
            .Include(q => q.HoldReason)
            .Include(q => q.ReleaseReason)
            .Include(q => q.Images)
            .Where(q => q.CompanyId == companyId && q.HandlingUnitId == request.HandlingUnitId)
            .OrderByDescending(q => q.CreatedAt)
            .ToListAsync(ct);

        return Results.Ok(events.Select(MapToDto).ToList());
    }

    private static QualityEventDetailDto MapToDto(QualityEvent q)
    {
        var hu = q.HandlingUnit;
        return new QualityEventDetailDto(
            q.Id,
            q.HandlingUnitId,
            hu.Lpn,
            hu.Status.ToString(),
            hu.QualityStatus.ToString(),
            hu.CurrentQuantity,
            hu.Product.BaseUnit ?? "UN",
            hu.Product.Sku,
            hu.Product.Description,
            hu.CustomerId,
            hu.Customer.CorporateName,
            hu.Batch,
            hu.ExpirationDate,
            q.OriginalLocationId,
            q.OriginalLocation?.FullPath,
            hu.CurrentLocationId,
            hu.CurrentLocation?.FullPath,
            q.HoldReasonId,
            q.HoldReason.Code,
            q.HoldReason.Description,
            q.HoldNotes,
            q.ReleaseReasonId,
            q.ReleaseReason?.Code,
            q.ReleaseReason?.Description,
            q.ReleaseNotes,
            q.IsResolved,
            q.CreatedAt,
            q.IsResolved ? q.UpdatedAt : null,
            q.Images
                .OrderBy(i => i.CreatedAt)
                .Select(i => new QualityEventImageDetailDto(i.Id, i.FileName, i.FilePath, i.FileSizeBytes, i.CreatedAt))
                .ToList()
        );
    }
}

public static class ListQualityEventsEndpoints
{
    public static void MapListQualityEventsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/quality/events", async (
            Guid? customerId,
            Guid? handlingUnitId,
            bool? isResolved,
            string? search,
            DateTime? startDate,
            DateTime? endDate,
            int? page,
            int? pageSize,
            IMediator mediator) =>
            await mediator.Send(new ListQualityEventsQuery(
                customerId,
                handlingUnitId,
                isResolved,
                search,
                startDate,
                endDate,
                page ?? 1,
                pageSize ?? 20)))
           .WithTags("Quality")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);

        app.MapGet("/api/quality/handling-units/{handlingUnitId:guid}/events", async (
            Guid handlingUnitId,
            IMediator mediator) =>
            await mediator.Send(new GetHandlingUnitQualityHistoryQuery(handlingUnitId)))
           .WithTags("Quality")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}