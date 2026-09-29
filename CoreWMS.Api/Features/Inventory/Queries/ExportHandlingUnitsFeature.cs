using System.Globalization;
using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ExportHandlingUnitsQuery(
    Guid? CustomerId,
    Guid? ProductId,
    Guid? ReceiptDocumentId,
    string? Lpn,
    string? Sku,
    string? Batch,
    string? NfeNumber,
    Guid? LocationId,
    int? Status,
    int? QualityStatus,
    DateTime? StartDate,
    DateTime? EndDate
) : IRequest<IResult>;

public class ExportHandlingUnitsHandler : IRequestHandler<ExportHandlingUnitsQuery, IResult>
{
    private static readonly CultureInfo PtBrCulture = CultureInfo.GetCultureInfo("pt-BR");
    private static readonly TimeZoneInfo BrasiliaTimeZone = GetBrasiliaTimeZone();

    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ExportHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ExportHandlingUnitsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var q = _db.HandlingUnits.AsNoTracking()
            .Include(h => h.Customer)
            .Include(h => h.Product)
            .Include(h => h.PackagingType)
            .Include(h => h.CurrentLocation)
            .Where(h => h.CompanyId == companyId);

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(h => allowedCustomerIds.Contains(h.CustomerId));
        }

        // 1. Filtros Chave
        if (request.CustomerId.HasValue) q = q.Where(h => h.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) q = q.Where(h => h.ProductId == request.ProductId);
        if (request.ReceiptDocumentId.HasValue) q = q.Where(h => h.ReceiptDocumentId == request.ReceiptDocumentId);
        if (request.LocationId.HasValue) q = q.Where(h => h.CurrentLocationId == request.LocationId);
        if (request.Status.HasValue) q = q.Where(h => h.Status == (HuStatus)request.Status.Value);
        if (request.QualityStatus.HasValue) q = q.Where(h => h.QualityStatus == (QualityStatus)request.QualityStatus.Value);

        // 2. Filtros de Texto
        if (!string.IsNullOrWhiteSpace(request.Lpn))
            q = q.Where(h => EF.Functions.ILike(h.Lpn, $"%{request.Lpn.Trim()}%"));

        if (!string.IsNullOrWhiteSpace(request.Sku))
            q = q.Where(h => EF.Functions.ILike(h.Product.Sku, $"%{request.Sku.Trim()}%") || EF.Functions.ILike(h.Product.Description, $"%{request.Sku.Trim()}%"));

        if (!string.IsNullOrWhiteSpace(request.Batch))
            q = q.Where(h => h.Batch != null && EF.Functions.ILike(h.Batch, $"%{request.Batch.Trim()}%"));

        if (!string.IsNullOrWhiteSpace(request.NfeNumber))
        {
            var term = request.NfeNumber.Trim();
            var inboundOrderIds = await _db.InboundOrders
                .AsNoTracking()
                .Where(o => o.CompanyId == companyId && (EF.Functions.ILike(o.AccessKey, $"%{term}%") || o.AccessKey.Contains(term)))
                .Select(o => o.Id)
                .ToListAsync(ct);

            q = q.Where(h => h.ReceiptDocumentId.HasValue && inboundOrderIds.Contains(h.ReceiptDocumentId.Value));
        }

        // 3. Filtro por Período de Entrada (00:00:00 às 23:59:59)
        if (request.StartDate.HasValue)
        {
            var startUtc = DateTime.SpecifyKind(request.StartDate.Value.Date, DateTimeKind.Utc);
            q = q.Where(h => h.CreatedAt >= startUtc);
        }

        if (request.EndDate.HasValue)
        {
            var endDate = request.EndDate.Value;
            var endUtc = endDate.Kind == DateTimeKind.Utc && endDate.TimeOfDay > TimeSpan.Zero
                ? endDate
                : DateTime.SpecifyKind(endDate.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);

            q = q.Where(h => h.CreatedAt <= endUtc);
        }

        var hus = await q.OrderByDescending(h => h.CreatedAt).ToListAsync(ct);

        // Mapa de NF-e
        var receiptIds = hus.Where(h => h.ReceiptDocumentId.HasValue).Select(h => h.ReceiptDocumentId!.Value).Distinct().ToList();
        var inboundOrdersMap = await _db.InboundOrders
            .AsNoTracking()
            .Where(o => receiptIds.Contains(o.Id))
            .ToDictionaryAsync(o => o.Id, o => o.AccessKey, ct);

        var builder = new StringBuilder();
        builder.AppendLine("LPN;CnpjDepositante;Depositante;SKU;UnidadeBase;DescricaoProduto;TipoVolume;DataEntrada;NumeroNFe;SerieNFe;ChaveAcesso;Endereco;Lote;DataFabricacao;DataValidade;NumeroSerie;QtdInicial;QtdAtual;ValorUnitario;ValorTotalHU;Status;Qualidade");

        foreach (var h in hus)
        {
            // Conversão de UTC para Brasília (UTC-3)
            var localCreatedAt = TimeZoneInfo.ConvertTimeFromUtc(h.CreatedAt, BrasiliaTimeZone);
            var createdAtStr = localCreatedAt.ToString("dd/MM/yyyy HH:mm:ss");

            var mfg = h.ManufactureDate?.ToString("dd/MM/yyyy") ?? "";
            var exp = h.ExpirationDate?.ToString("dd/MM/yyyy") ?? "";
            var loc = h.CurrentLocation?.FullPath ?? "Em Transito";

            string? accessKey = h.ReceiptDocumentId.HasValue && inboundOrdersMap.TryGetValue(h.ReceiptDocumentId.Value, out var key) ? key : null;
            string nfeNum = "";
            string nfeSerie = "";

            if (!string.IsNullOrEmpty(accessKey) && accessKey.Length >= 34)
            {
                nfeSerie = int.Parse(accessKey.Substring(22, 3)).ToString();
                nfeNum = int.Parse(accessKey.Substring(25, 9)).ToString();
            }

            // Apóstrofo sem aspas duplas envolventes no CSV
            var cnpjCell = string.IsNullOrWhiteSpace(h.Customer.Cnpj) ? "" : $"'{h.Customer.Cnpj.Trim()}";
            var accessKeyCell = string.IsNullOrWhiteSpace(accessKey) ? "" : $"'{accessKey.Trim()}";

            decimal totalValue = h.CurrentQuantity * h.UnitValue;
            var initialQtyStr = h.InitialQuantity.ToString("0.00######", PtBrCulture);
            var currentQtyStr = h.CurrentQuantity.ToString("0.00######", PtBrCulture);
            var unitValStr = h.UnitValue.ToString("0.00######", PtBrCulture);
            var totalValStr = totalValue.ToString("0.00######", PtBrCulture);

            builder.AppendLine($"\"{h.Lpn}\";{cnpjCell};\"{h.Customer.CorporateName}\";\"{h.Product.Sku}\";\"{h.Product.BaseUnit}\";\"{h.Product.Description}\";\"{h.PackagingType.Code}\";\"{createdAtStr}\";\"{nfeNum}\";\"{nfeSerie}\";{accessKeyCell};\"{loc}\";\"{h.Batch ?? ""}\";\"{mfg}\";\"{exp}\";\"{h.SerialNumber ?? ""}\";{initialQtyStr};{currentQtyStr};{unitValStr};{totalValStr};\"{h.Status}\";\"{h.QualityStatus}\"");
        }

        var preamble = Encoding.UTF8.GetPreamble();
        var contentBytes = Encoding.UTF8.GetBytes(builder.ToString());
        var fileBytes = preamble.Concat(contentBytes).ToArray();

        var fileName = $"unidades_manuseio_hus_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv";
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

public static class ExportHandlingUnitsEndpoints
{
    public static void MapExportHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inventory/handling-units/export", async ([AsParameters] ExportHandlingUnitsQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}