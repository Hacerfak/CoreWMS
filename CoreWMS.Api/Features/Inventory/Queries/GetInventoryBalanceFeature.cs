using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record GetInventoryBalanceQuery(
    Guid? CustomerId,
    string? Sku,
    string? NfeNumber,
    Guid? ProductId,
    int Page = 1,
    int PageSize = 20
) : IRequest<IResult>;

public class GetInventoryBalanceQueryValidator : AbstractValidator<GetInventoryBalanceQuery>
{
    public GetInventoryBalanceQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 1000).WithMessage("O tamanho da página deve ser entre 1 e 1000.");
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

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(b => allowedCustomerIds.Contains(b.CustomerId));
        }

        // Filtros Básicos
        if (request.CustomerId.HasValue) q = q.Where(b => b.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) q = q.Where(b => b.ProductId == request.ProductId);

        if (!string.IsNullOrWhiteSpace(request.Sku))
            q = q.Where(b => EF.Functions.ILike(b.Product.Sku, $"%{request.Sku.Trim()}%") || EF.Functions.ILike(b.Product.Description, $"%{request.Sku.Trim()}%"));

        if (!string.IsNullOrWhiteSpace(request.NfeNumber))
        {
            var term = request.NfeNumber.Trim();
            var inboundOrderIds = await _db.InboundOrders
                .AsNoTracking()
                .Where(o => o.CompanyId == companyId && (EF.Functions.ILike(o.AccessKey, $"%{term}%") || o.AccessKey.Contains(term)))
                .Select(o => o.Id)
                .ToListAsync(ct);

            q = q.Where(b => _db.HandlingUnits.Any(h => h.CompanyId == companyId && h.CustomerId == b.CustomerId && h.ProductId == b.ProductId && h.ReceiptDocumentId.HasValue && inboundOrderIds.Contains(h.ReceiptDocumentId.Value)));
        }

        var totalCount = await q.CountAsync(ct);

        // Agregação dos totais via SQL
        var totals = await q
            .GroupBy(b => 1)
            .Select(g => new
            {
                Expected = g.Sum(b => (decimal?)b.TotalExpected) ?? 0m,
                Dock = g.Sum(b => (decimal?)b.TotalDock) ?? 0m,
                Available = g.Sum(b => (decimal?)b.TotalAvailable) ?? 0m,
                Allocated = g.Sum(b => (decimal?)b.TotalAllocated) ?? 0m,
                Quarantine = g.Sum(b => (decimal?)b.TotalQuarantine) ?? 0m
            })
            .FirstOrDefaultAsync(ct);

        var totalExpected = totals?.Expected ?? 0m;
        var totalDock = totals?.Dock ?? 0m;
        var totalAvailable = totals?.Available ?? 0m;
        var totalAllocated = totals?.Allocated ?? 0m;
        var totalQuarantine = totals?.Quarantine ?? 0m;
        var totalPhysical = totalDock + totalAvailable + totalAllocated + totalQuarantine;

        var items = await q
            .OrderBy(b => b.Product.Sku)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(b => new InventoryBalanceDto(
                b.ProductId, b.Product.Sku, b.Product.Description, b.Customer.CorporateName,
                b.TotalExpected, b.TotalDock, b.TotalAvailable, b.TotalAllocated, b.TotalQuarantine, b.TotalPhysical
            )).ToListAsync(ct);

        var response = new InventoryBalanceResponse(
            items, totalCount, request.Page, request.PageSize,
            totalPhysical, totalExpected, totalDock, totalAvailable, totalAllocated, totalQuarantine
        );

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