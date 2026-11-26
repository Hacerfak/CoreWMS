using System.Globalization;
using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ExportInventoryBalanceQuery(
    Guid? CustomerId,
    string? Sku,
    string? NfeNumber,
    Guid? ProductId,
    string? Lpn = null,
    string? Batch = null,
    Guid? LocationId = null,
    int? Status = null,
    int? QualityStatus = null,
    DateTime? StartDate = null,
    DateTime? EndDate = null
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

        if (request.CustomerId.HasValue) q = q.Where(b => b.CustomerId == request.CustomerId.Value);
        if (request.ProductId.HasValue) q = q.Where(b => b.ProductId == request.ProductId.Value);

        if (!string.IsNullOrWhiteSpace(request.Sku))
        {
            var skuTerm = request.Sku.Trim();
            q = q.Where(b => EF.Functions.ILike(b.Product.Sku, $"%{skuTerm}%") || EF.Functions.ILike(b.Product.Description, $"%{skuTerm}%"));
        }

        List<Guid>? nfeOrderIds = null;
        if (!string.IsNullOrWhiteSpace(request.NfeNumber))
        {
            var term = request.NfeNumber.Trim();
            nfeOrderIds = await _db.InboundOrders
                .AsNoTracking()
                .Where(o => o.CompanyId == companyId && (EF.Functions.ILike(o.AccessKey, $"%{term}%") || o.AccessKey.Contains(term)))
                .Select(o => o.Id)
                .ToListAsync(ct);
        }

        DateTime? startUtc = request.StartDate.HasValue
            ? DateTime.SpecifyKind(request.StartDate.Value.Date, DateTimeKind.Utc)
            : null;

        DateTime? endUtc = null;
        if (request.EndDate.HasValue)
        {
            var endDate = request.EndDate.Value;
            endUtc = endDate.Kind == DateTimeKind.Utc && endDate.TimeOfDay > TimeSpan.Zero
                ? endDate
                : DateTime.SpecifyKind(endDate.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
        }

        bool hasHuDetailFilters =
            nfeOrderIds != null ||
            !string.IsNullOrWhiteSpace(request.Lpn) ||
            !string.IsNullOrWhiteSpace(request.Batch) ||
            request.LocationId.HasValue ||
            request.Status.HasValue ||
            request.QualityStatus.HasValue ||
            startUtc.HasValue ||
            endUtc.HasValue;

        if (hasHuDetailFilters)
        {
            var lpnTerm = request.Lpn?.Trim();
            var batchTerm = request.Batch?.Trim();
            var statusEnum = request.Status.HasValue ? (HuStatus)request.Status.Value : (HuStatus?)null;
            var qualityEnum = request.QualityStatus.HasValue ? (QualityStatus)request.QualityStatus.Value : (QualityStatus?)null;

            q = q.Where(b => _db.HandlingUnits.Any(h =>
                h.CompanyId == companyId &&
                h.CustomerId == b.CustomerId &&
                h.ProductId == b.ProductId &&
                (nfeOrderIds == null || (h.ReceiptDocumentId.HasValue && nfeOrderIds.Contains(h.ReceiptDocumentId.Value))) &&
                (string.IsNullOrWhiteSpace(lpnTerm) || EF.Functions.ILike(h.Lpn, $"%{lpnTerm}%")) &&
                (string.IsNullOrWhiteSpace(batchTerm) || (h.Batch != null && EF.Functions.ILike(h.Batch, $"%{batchTerm}%"))) &&
                (!request.LocationId.HasValue || h.CurrentLocationId == request.LocationId.Value) &&
                (!statusEnum.HasValue || h.Status == statusEnum.Value) &&
                (!qualityEnum.HasValue || h.QualityStatus == qualityEnum.Value) &&
                (!startUtc.HasValue || h.CreatedAt >= startUtc.Value) &&
                (!endUtc.HasValue || h.CreatedAt <= endUtc.Value)
            ));
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
           .RequirePermission(Permissions.Inventory.Export);
    }
}