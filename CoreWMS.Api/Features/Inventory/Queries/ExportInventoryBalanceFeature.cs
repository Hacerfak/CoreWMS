using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ExportInventoryBalanceQuery(Guid? CustomerId, Guid? ProductId) : IRequest<IResult>;

public class ExportInventoryBalanceHandler : IRequestHandler<ExportInventoryBalanceQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ExportInventoryBalanceHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ExportInventoryBalanceQuery request, CancellationToken ct)
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

        var balances = await q.OrderBy(b => b.Product.Sku).ToListAsync(ct);

        var builder = new StringBuilder();
        builder.AppendLine("SKU;Depositante;Esperado;Disponivel;Alocado;Quarentena;FisicoTotal");

        foreach (var b in balances)
        {
            builder.AppendLine($"\"{b.Product.Sku}\";\"{b.Customer.CorporateName}\";{b.TotalExpected};{b.TotalAvailable};{b.TotalAllocated};{b.TotalQuarantine};{b.TotalPhysical}");
        }

        var preamble = Encoding.UTF8.GetPreamble();
        var contentBytes = Encoding.UTF8.GetBytes(builder.ToString());
        var fileBytes = preamble.Concat(contentBytes).ToArray();

        var fileName = $"balanco_estoque_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv";
        return Results.File(fileBytes, "text/csv; charset=utf-8", fileName);
    }
}

public static class ExportInventoryBalanceEndpoints
{
    public static void MapExportInventoryBalanceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inventory/balances/export", async ([AsParameters] ExportInventoryBalanceQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}