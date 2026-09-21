using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Management;

public record ListInboundOrdersQuery(Guid? CustomerId, InboundOrderStatus? Status, string? Search, int Page = 1, int PageSize = 20) : IRequest<IResult>;

public class ListInboundOrdersQueryValidator : AbstractValidator<ListInboundOrdersQuery>
{
    public ListInboundOrdersQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

public class ListInboundOrdersHandler : IRequestHandler<ListInboundOrdersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListInboundOrdersHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListInboundOrdersQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var q = _db.InboundOrders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Where(o => o.CompanyId == companyId);

        if (request.CustomerId.HasValue) q = q.Where(o => o.CustomerId == request.CustomerId);
        if (request.Status.HasValue) q = q.Where(o => o.Status == request.Status);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            q = q.Where(o => o.AccessKey.Contains(s) || o.IssuerName.ToLower().Contains(s) || o.IssuerCnpj.Contains(s));
        }

        var totalTask = q.CountAsync(ct);
        var itemsTask = q
            .OrderByDescending(o => o.IssueDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(o => new InboundOrderDto(
                o.Id, o.CustomerId, o.Customer != null ? o.Customer.CorporateName : null,
                o.IssuerCnpj, o.IssuerName, o.AccessKey, o.IssueDate, o.Status.ToString()
            )).ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        var response = new PaginatedResult<InboundOrderDto>(itemsTask.Result, totalTask.Result, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public static class ListInboundOrdersEndpoints
{
    public static void MapListInboundOrdersEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inbound", async ([AsParameters] ListInboundOrdersQuery query, IMediator mediator) => await mediator.Send(query))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.View);
    }
}