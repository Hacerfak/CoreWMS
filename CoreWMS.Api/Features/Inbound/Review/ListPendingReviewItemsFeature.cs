using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Review;

public record ListPendingReviewItemsQuery() : IRequest<IResult>;

public class ListPendingReviewItemsHandler : IRequestHandler<ListPendingReviewItemsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListPendingReviewItemsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListPendingReviewItemsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var pendingItems = await _db.InboundOrderItems
            .AsNoTracking()
            .Include(i => i.InboundOrder)
            .Where(i => i.InboundOrder.CompanyId == companyId && i.Status == InboundOrderItemStatus.Pending_Review)
            .OrderBy(i => i.InboundOrder.IssueDate)
            .ThenBy(i => i.LineNumber)
            .Select(i => new PendingReviewItemDto(
                i.Id, i.InboundOrderId, i.InboundOrder.AccessKey, i.InboundOrder.IssuerName, i.LineNumber,
                i.RawSkuCode, i.RawBarcode, i.RawDescription, i.RawNcm,
                i.ExpectedQuantity, i.ExpectedBatch
            ))
            .ToListAsync(ct);

        return Results.Ok(pendingItems);
    }
}

public static class ListPendingReviewItemsEndpoints
{
    public static void MapListPendingReviewItemsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inbound/review", async (IMediator mediator) => await mediator.Send(new ListPendingReviewItemsQuery()))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Review);
    }
}