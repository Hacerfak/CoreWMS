using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record GetInventoryBalanceQuery(Guid? CustomerId, Guid? ProductId, int Page = 1, int PageSize = 20) : IRequest<IResult>;

public class GetInventoryBalanceQueryValidator : AbstractValidator<GetInventoryBalanceQuery>
{
    public GetInventoryBalanceQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 1000);
    }
}

public class GetInventoryBalanceHandler : IRequestHandler<GetInventoryBalanceQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetInventoryBalanceHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetInventoryBalanceQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var q = _db.InventoryBalances.AsNoTracking()
            .Include(b => b.Product)
            .Include(b => b.Customer)
            .Where(b => b.CompanyId == companyId);

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(b => allowedCustomerIds.Contains(b.CustomerId));
        }

        if (request.CustomerId.HasValue) q = q.Where(b => b.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) q = q.Where(b => b.ProductId == request.ProductId);

        // Execução sequencial para evitar concorrência no DbContext
        var totalCount = await q.CountAsync(ct);

        var items = await q
            .OrderBy(b => b.Product.Sku)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(b => new InventoryBalanceDto(
                b.ProductId, b.Product.Sku, b.Customer.CorporateName,
                b.TotalExpected, b.TotalAvailable, b.TotalAllocated, b.TotalQuarantine, b.TotalPhysical
            )).ToListAsync(ct);

        var response = new PaginatedResult<InventoryBalanceDto>(items, totalCount, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public static class GetInventoryBalanceEndpoints
{
    public static void MapGetInventoryBalanceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inventory/balances", async ([AsParameters] GetInventoryBalanceQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}