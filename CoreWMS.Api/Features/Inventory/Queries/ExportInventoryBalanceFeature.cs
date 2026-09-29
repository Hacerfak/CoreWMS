using System.Globalization;
using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ExportInventoryBalanceQuery(
    Guid? CustomerId,
    string? Sku,
    string? NfeNumber,
    Guid? ProductId
) : IRequest<IResult>;

public class ExportInventoryBalanceHandler : IRequestHandler<ExportInventoryBalanceQuery, IResult>
{
    private static readonly CultureInfo PtBrCulture = CultureInfo.GetCultureInfo("pt-BR");

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

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(b => allowedCustomerIds.Contains(b.CustomerId));
        }

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

        var balances = await q.OrderBy(b => b.Product.Sku).ToListAsync(ct);

        var builder = new StringBuilder();
        builder.AppendLine("CnpjDepositante;Depositante;SKU;UnidadeBase;DescricaoProduto;EsperadoNfe;NaDoca;Disponivel;Alocado;Quarentena;FisicoTotal");

        foreach (var b in balances)
        {
            var cnpjCell = string.IsNullOrWhiteSpace(b.Customer.Cnpj) ? "" : $"'{b.Customer.Cnpj.Trim()}";
            builder.AppendLine($"{cnpjCell};\"{b.Customer.CorporateName}\";\"{b.Product.Sku}\";\"{b.Product.BaseUnit}\";\"{b.Product.Description}\";{b.TotalExpected.ToString("0.00######", PtBrCulture)};{b.TotalDock.ToString("0.00######", PtBrCulture)};{b.TotalAvailable.ToString("0.00######", PtBrCulture)};{b.TotalAllocated.ToString("0.00######", PtBrCulture)};{b.TotalQuarantine.ToString("0.00######", PtBrCulture)};{b.TotalPhysical.ToString("0.00######", PtBrCulture)}");
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