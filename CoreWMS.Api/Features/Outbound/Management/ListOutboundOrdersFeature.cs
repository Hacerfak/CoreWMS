using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record OutboundOrderSummaryDto(
    string? RequestedBy,
    Guid Id,
    Guid CustomerId,
    string CustomerName,
    string OrderNumber,
    string? InvoiceNumber,
    string? DestinationName,
    string? DestinationCity,
    string? DestinationState,
    DateTime IssueDate,
    DateTime ExpectedShipDate,
    string Status,
    int ItemsCount,
    bool HasFiscalDocuments,
    bool HasActiveFiscalDocuments
);

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
        var q = _db.OutboundOrders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Where(o => o.CompanyId == companyId);

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(o => allowedIds.Contains(o.CustomerId));
        }

        if (request.CustomerId.HasValue)
            q = q.Where(o => o.CustomerId == request.CustomerId);

        if (!string.IsNullOrWhiteSpace(request.Status) && Enum.TryParse<Enums.OutboundOrderStatus>(request.Status, true, out var statusEnum))
            q = q.Where(o => o.Status == statusEnum);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = $"%{request.Search.Trim()}%";
            q = q.Where(o => EF.Functions.ILike(o.OrderNumber, s) ||
                             (o.InvoiceNumber != null && EF.Functions.ILike(o.InvoiceNumber, s)) ||
                             (o.DestinationName != null && EF.Functions.ILike(o.DestinationName, s)) ||
                             (o.AccessKey != null && EF.Functions.ILike(o.AccessKey, s)));
        }

        var totalCount = await q.CountAsync(ct);

        var rawOrders = await q
            .OrderByDescending(o => o.IssueDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(o => new
            {
                o.Id,
                o.CustomerId,
                CustomerName = o.Customer.CorporateName,
                o.OrderNumber,
                o.InvoiceNumber,
                o.DestinationName,
                o.DestinationCity,
                o.DestinationState,
                o.IssueDate,
                o.ExpectedShipDate,
                Status = o.Status.ToString(),
                ItemsCount = o.Items.Count,
                o.RequestedBy
            }).ToListAsync(ct);

        var orderIds = rawOrders.Select(o => o.Id).ToList();

        // Consulta em lote o histórico fiscal dos pedidos da página
        var fiscalDocs = await _db.CompanyFiscalDocuments
            .AsNoTracking()
            .Where(f => f.OutboundOrderId.HasValue && orderIds.Contains(f.OutboundOrderId.Value))
            .Select(f => new { f.OutboundOrderId, f.Status, f.Type })
            .ToListAsync(ct);

        var fiscalLookup = fiscalDocs
            .GroupBy(f => f.OutboundOrderId!.Value)
            .ToDictionary(g => g.Key, g => new
            {
                HasDocs = g.Any(),
                // Considera ativo apenas se houver notas fiscais (tipos 1 a 6) com status Authorized
                HasActive = g.Any(d => (int)d.Type >= 1 && (int)d.Type <= 6 && d.Status == FiscalDocumentStatus.Authorized)
            });

        var items = rawOrders.Select(o =>
        {
            var hasDocs = fiscalLookup.TryGetValue(o.Id, out var f) && f.HasDocs;
            var hasActive = fiscalLookup.TryGetValue(o.Id, out var f2) && f2.HasActive;

            return new OutboundOrderSummaryDto(
                o.RequestedBy,
                o.Id,
                o.CustomerId,
                o.CustomerName,
                o.OrderNumber,
                o.InvoiceNumber,
                o.DestinationName,
                o.DestinationCity,
                o.DestinationState,
                o.IssueDate,
                o.ExpectedShipDate,
                o.Status,
                o.ItemsCount,
                hasDocs,
                hasActive
            );
        }).ToList();

        var response = new PaginatedResult<OutboundOrderSummaryDto>(items, totalCount, request.Page, request.PageSize);
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