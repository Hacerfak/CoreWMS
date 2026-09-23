using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record ListOutboundOrdersQuery(Guid? CustomerId, string? Search, string? Status, int Page = 1, int PageSize = 20) : IRequest<IResult>;

public class ListOutboundOrdersHandler : IRequestHandler<ListOutboundOrdersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListOutboundOrdersHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListOutboundOrdersQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var q = _db.OutboundOrders.AsNoTracking().Where(o => o.CompanyId == companyId);

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(o => allowedIds.Contains(o.CustomerId));
        }

        if (request.CustomerId.HasValue) q = q.Where(o => o.CustomerId == request.CustomerId);
        if (!string.IsNullOrWhiteSpace(request.Status) && Enum.TryParse<Enums.OutboundOrderStatus>(request.Status, true, out var statusEnum))
            q = q.Where(o => o.Status == statusEnum);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = $"%{request.Search.Trim()}%";
            q = q.Where(o => EF.Functions.ILike(o.OrderNumber, s) ||
                             EF.Functions.ILike(o.DestinationName, s) ||
                             (o.AccessKey != null && EF.Functions.ILike(o.AccessKey, s)));
        }

        // Execução sequencial para evitar exceção de thread-safety no DbContext
        var totalCount = await q.CountAsync(ct);

        var items = await q
            .OrderByDescending(o => o.IssueDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(o => new OutboundOrderDto(
                o.Id, o.CustomerId, o.OrderNumber, o.DestinationName, o.DestinationCity, o.DestinationState,
                o.IssueDate, o.Status.ToString(), o.Items.Count
            )).ToListAsync(ct);

        var response = new PaginatedResult<OutboundOrderDto>(items, totalCount, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public static class ListOutboundOrdersEndpoints
{
    public static void MapListOutboundOrdersEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/outbound/orders", async ([AsParameters] ListOutboundOrdersQuery query, IMediator mediator) => await mediator.Send(query))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.View);
    }
}