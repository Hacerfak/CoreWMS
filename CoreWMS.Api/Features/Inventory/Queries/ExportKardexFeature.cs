using System.Globalization;
using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ExportKardexQuery(
    Guid? CustomerId,
    string? Sku,
    string? Lpn,
    string? Batch,
    string? NfeNumber,
    Guid? ProductId,
    Guid? LocationId = null,
    int? Status = null,
    int? QualityStatus = null,
    DateTime? StartDate = null,
    DateTime? EndDate = null
) : IRequest<IResult>;

public class ExportKardexHandler : IRequestHandler<ExportKardexQuery, IResult>
{
    private static readonly CultureInfo PtBrCulture = CultureInfo.GetCultureInfo("pt-BR");
    private static readonly TimeZoneInfo BrasiliaTimeZone = GetBrasiliaTimeZone();

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
                    join c in _db.Customers.AsNoTracking() on t.CustomerId equals c.Id
                    join p in _db.Products.AsNoTracking() on t.ProductId equals p.Id
                    join h in _db.HandlingUnits.AsNoTracking() on t.HandlingUnitId equals h.Id into hGroup
                    from hu in hGroup.DefaultIfEmpty()
                    join l in _db.Locations.AsNoTracking() on t.LocationId equals l.Id into lGroup
                    from loc in lGroup.DefaultIfEmpty()
                    select new
                    {
                        Transaction = t,
                        HandlingUnit = hu,
                        CustomerCnpj = c.Cnpj,
                        CustomerName = c.CorporateName,
                        ProductSku = p.Sku,
                        ProductDescription = p.Description,
                        HandlingUnitLpn = hu != null ? hu.Lpn : null,
                        HandlingUnitBatch = hu != null ? hu.Batch : null,
                        HandlingUnitExpirationDate = hu != null ? hu.ExpirationDate : null,
                        LocationPath = loc != null ? loc.FullPath : null
                    };

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(q => allowedCustomerIds.Contains(q.Transaction.CustomerId));
        }

        if (request.CustomerId.HasValue)
            query = query.Where(q => q.Transaction.CustomerId == request.CustomerId.Value);

        if (request.ProductId.HasValue)
            query = query.Where(q => q.Transaction.ProductId == request.ProductId.Value);

        if (request.LocationId.HasValue)
            query = query.Where(q => q.Transaction.LocationId == request.LocationId.Value);

        if (request.Status.HasValue)
        {
            var statusEnum = (HuStatus)request.Status.Value;
            query = query.Where(q => q.HandlingUnit != null && q.HandlingUnit.Status == statusEnum);
        }

        if (request.QualityStatus.HasValue)
        {
            var qualityEnum = (QualityStatus)request.QualityStatus.Value;
            query = query.Where(q => q.HandlingUnit != null && q.HandlingUnit.QualityStatus == qualityEnum);
        }

        if (!string.IsNullOrWhiteSpace(request.Lpn))
        {
            var lpnTerm = request.Lpn.Trim();
            query = query.Where(q => q.HandlingUnitLpn != null && EF.Functions.ILike(q.HandlingUnitLpn, $"%{lpnTerm}%"));
        }

        if (!string.IsNullOrWhiteSpace(request.Sku))
        {
            var skuTerm = request.Sku.Trim();
            query = query.Where(q => EF.Functions.ILike(q.ProductSku, $"%{skuTerm}%") || EF.Functions.ILike(q.ProductDescription, $"%{skuTerm}%"));
        }

        if (!string.IsNullOrWhiteSpace(request.Batch))
        {
            var batchTerm = request.Batch.Trim();
            query = query.Where(q => q.HandlingUnitBatch != null && EF.Functions.ILike(q.HandlingUnitBatch, $"%{batchTerm}%"));
        }

        if (!string.IsNullOrWhiteSpace(request.NfeNumber))
        {
            var term = request.NfeNumber.Trim();
            var inboundOrderIds = await _db.InboundOrders
                .AsNoTracking()
                .Where(o => o.CompanyId == companyId && (EF.Functions.ILike(o.AccessKey, $"%{term}%") || o.AccessKey.Contains(term)))
                .Select(o => o.Id)
                .ToListAsync(ct);

            query = query.Where(q =>
                (q.Transaction.SourceDocumentNumber != null && EF.Functions.ILike(q.Transaction.SourceDocumentNumber, $"%{term}%")) ||
                (q.HandlingUnit != null && q.HandlingUnit.ReceiptDocumentId.HasValue && inboundOrderIds.Contains(q.HandlingUnit.ReceiptDocumentId.Value)) ||
                (q.Transaction.SourceDocumentId.HasValue && inboundOrderIds.Contains(q.Transaction.SourceDocumentId.Value))
            );
        }

        if (request.StartDate.HasValue)
        {
            var startDate = request.StartDate.Value;
            var startUtc = startDate.Kind == DateTimeKind.Utc && startDate.TimeOfDay > TimeSpan.Zero
                ? startDate
                : DateTime.SpecifyKind(startDate.Date, DateTimeKind.Utc);
            query = query.Where(q => q.Transaction.CreatedAt >= startUtc);
        }

        if (request.EndDate.HasValue)
        {
            var endDate = request.EndDate.Value;
            var endUtc = endDate.Kind == DateTimeKind.Utc && endDate.TimeOfDay > TimeSpan.Zero
                ? endDate
                : DateTime.SpecifyKind(endDate.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
            query = query.Where(q => q.Transaction.CreatedAt <= endUtc);
        }

        var items = await query.OrderByDescending(q => q.Transaction.CreatedAt).ToListAsync(ct);

        var builder = new StringBuilder();
        builder.AppendLine("DataHora;CnpjDepositante;Depositante;SKU;DescricaoProduto;LPN;Lote;DataValidade;TipoEvento;VariacaoQuantidade;SaldoApos;Endereco;DocumentoOrigem");

        foreach (var i in items)
        {
            var localCreatedAt = TimeZoneInfo.ConvertTimeFromUtc(i.Transaction.CreatedAt, BrasiliaTimeZone);
            var dtStr = localCreatedAt.ToString("dd/MM/yyyy HH:mm:ss");

            var cnpjCell = string.IsNullOrWhiteSpace(i.CustomerCnpj) ? "" : $"'{i.CustomerCnpj.Trim()}";
            var expStr = i.HandlingUnitExpirationDate?.ToString("dd/MM/yyyy") ?? "";
            var changeQtyStr = i.Transaction.QuantityChange.ToString("0.00######", PtBrCulture);
            var balanceAfterStr = i.Transaction.BalanceAfter.ToString("0.00######", PtBrCulture);

            builder.AppendLine($"\"{dtStr}\";{cnpjCell};\"{i.CustomerName}\";\"{i.ProductSku}\";\"{i.ProductDescription}\";\"{i.HandlingUnitLpn ?? ""}\";\"{i.HandlingUnitBatch ?? ""}\";\"{expStr}\";\"{i.Transaction.Type}\";{changeQtyStr};{balanceAfterStr};\"{i.LocationPath ?? ""}\";\"{i.Transaction.SourceDocumentNumber ?? ""}\"");
        }

        var preamble = Encoding.UTF8.GetPreamble();
        var contentBytes = Encoding.UTF8.GetBytes(builder.ToString());
        var fileBytes = preamble.Concat(contentBytes).ToArray();

        var fileName = $"kardex_extrato_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv";
        return Results.File(fileBytes, "text/csv; charset=utf-8", fileName);
    }

    private static TimeZoneInfo GetBrasiliaTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time");
        }
        catch
        {
            return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
        }
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
           .RequirePermission(Permissions.Inventory.Export);
    }
}