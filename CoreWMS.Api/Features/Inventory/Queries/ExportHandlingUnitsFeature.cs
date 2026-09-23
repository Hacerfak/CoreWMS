using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ExportHandlingUnitsQuery(Guid? CustomerId, Guid? ProductId, string? Lpn, Guid? LocationId, int? Status) : IRequest<IResult>;

public class ExportHandlingUnitsHandler : IRequestHandler<ExportHandlingUnitsQuery, IResult>
{
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

        if (request.CustomerId.HasValue) q = q.Where(h => h.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) q = q.Where(h => h.ProductId == request.ProductId);
        if (request.LocationId.HasValue) q = q.Where(h => h.CurrentLocationId == request.LocationId);
        if (request.Status.HasValue) q = q.Where(h => h.Status == (HuStatus)request.Status.Value);
        if (!string.IsNullOrWhiteSpace(request.Lpn)) q = q.Where(h => h.Lpn.Contains(request.Lpn.Trim().ToUpper()));

        var hus = await q.OrderByDescending(h => h.UpdatedAt ?? h.CreatedAt).ToListAsync(ct);

        var builder = new StringBuilder();
        builder.AppendLine("LPN;Depositante;SKU;TipoVolume;Endereco;Lote;DataFabricacao;DataValidade;NumeroSerie;QtdInicial;QtdAtual;Status;Qualidade");

        foreach (var h in hus)
        {
            var mfg = h.ManufactureDate?.ToString("dd/MM/yyyy") ?? "";
            var exp = h.ExpirationDate?.ToString("dd/MM/yyyy") ?? "";
            var loc = h.CurrentLocation?.FullPath ?? "Em Transito";

            builder.AppendLine($"\"{h.Lpn}\";\"{h.Customer.CorporateName}\";\"{h.Product.Sku}\";\"{h.PackagingType.Code}\";\"{loc}\";\"{h.Batch ?? ""}\";\"{mfg}\";\"{exp}\";\"{h.SerialNumber ?? ""}\";{h.InitialQuantity};{h.CurrentQuantity};\"{h.Status}\";\"{h.QualityStatus}\"");
        }

        var preamble = Encoding.UTF8.GetPreamble();
        var contentBytes = Encoding.UTF8.GetBytes(builder.ToString());
        var fileBytes = preamble.Concat(contentBytes).ToArray();

        var fileName = $"unidades_manuseio_hus_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv";
        return Results.File(fileBytes, "text/csv; charset=utf-8", fileName);
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