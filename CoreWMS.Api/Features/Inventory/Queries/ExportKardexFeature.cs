using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ExportKardexQuery(Guid? ProductId, string? Lpn, DateTime? StartDate, DateTime? EndDate) : IRequest<IResult>;

public class ExportKardexHandler : IRequestHandler<ExportKardexQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ExportKardexHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ExportKardexQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = from t in _db.InventoryTransactions.AsNoTracking()
                    where t.CompanyId == companyId
                    join p in _db.Products.AsNoTracking() on t.ProductId equals p.Id
                    join h in _db.HandlingUnits.AsNoTracking() on t.HandlingUnitId equals h.Id into hGroup
                    from hu in hGroup.DefaultIfEmpty()
                    select new { Transaction = t, ProductSku = p.Sku, HandlingUnitLpn = hu != null ? hu.Lpn : null };

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(q => allowedCustomerIds.Contains(q.Transaction.CustomerId));
        }

        if (request.ProductId.HasValue) query = query.Where(q => q.Transaction.ProductId == request.ProductId);
        if (request.StartDate.HasValue) query = query.Where(q => q.Transaction.CreatedAt >= request.StartDate.Value.ToUniversalTime());
        if (request.EndDate.HasValue) query = query.Where(q => q.Transaction.CreatedAt <= request.EndDate.Value.ToUniversalTime());
        if (!string.IsNullOrWhiteSpace(request.Lpn)) query = query.Where(q => q.HandlingUnitLpn == request.Lpn.Trim().ToUpper());

        var items = await query.OrderByDescending(q => q.Transaction.CreatedAt).ToListAsync(ct);

        var builder = new StringBuilder();
        builder.AppendLine("DataHora;SKU;LPN;TipoEvento;VariacaoQuantidade;SaldoApos;DocumentoOrigem");

        foreach (var i in items)
        {
            var dt = i.Transaction.CreatedAt.ToString("dd/MM/yyyy HH:mm:ss");
            builder.AppendLine($"\"{dt}\";\"{i.ProductSku}\";\"{i.HandlingUnitLpn ?? ""}\";\"{i.Transaction.Type}\";{i.Transaction.QuantityChange};{i.Transaction.BalanceAfter};\"{i.Transaction.SourceDocumentNumber ?? ""}\"");
        }

        var preamble = Encoding.UTF8.GetPreamble();
        var contentBytes = Encoding.UTF8.GetBytes(builder.ToString());
        var fileBytes = preamble.Concat(contentBytes).ToArray();

        var fileName = $"kardex_extrato_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv";
        return Results.File(fileBytes, "text/csv; charset=utf-8", fileName);
    }
}

public static class ExportKardexEndpoints
{
    public static void MapExportKardexEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inventory/kardex/export", async ([AsParameters] ExportKardexQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}