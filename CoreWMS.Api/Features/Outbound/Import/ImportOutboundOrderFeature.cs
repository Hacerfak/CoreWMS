using System.Text;
using System.Xml.Linq;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.NfeParser;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Import;

public record ImportOutboundOrderCommand(byte[] FileBytes) : IRequest<IResult>;

public class ImportOutboundOrderHandler : IRequestHandler<ImportOutboundOrderCommand, IResult>
{
    private static readonly XNamespace Ns = "http://www.portalfiscal.inf.br/nfe";
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly INfeParserService _parser;

    public ImportOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant, INfeParserService parser)
    {
        _db = db;
        _tenant = tenant;
        _parser = parser;
    }

    public async Task<IResult> Handle(ImportOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        string xmlContent;
        try { xmlContent = Encoding.UTF8.GetString(request.FileBytes); }
        catch { return Results.BadRequest(new { Message = "Arquivo XML inválido ou corrompido." }); }

        NfeParsedData parsedData;
        try { parsedData = _parser.ParseXml(xmlContent); }
        catch (Exception ex) { return Results.BadRequest(new { Message = $"Erro ao interpretar o XML da NF-e: {ex.Message}" }); }

        if (await _db.OutboundOrders.AnyAsync(o => o.CompanyId == companyId && o.AccessKey == parsedData.AccessKey, ct))
        {
            return Results.Conflict(new { Message = "Este pedido/NF-e já foi importado anteriormente no sistema." });
        }

        var customer = await _db.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Cnpj == parsedData.IssuerCnpj, ct);

        if (customer == null)
        {
            return Results.BadRequest(new { Message = $"O emitente da NF-e (CNPJ {parsedData.IssuerCnpj}) não está cadastrado como cliente depositante nesta empresa." });
        }

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(customer.Id))
        {
            return Results.Forbid();
        }

        var doc = XDocument.Parse(xmlContent);
        var infNfe = doc.Descendants(Ns + "infNFe").FirstOrDefault();
        var ide = infNfe?.Element(Ns + "ide");

        string? invoiceNumber = ide?.Element(Ns + "nNF")?.Value;
        string? invoiceSerie = ide?.Element(Ns + "serie")?.Value;
        string? additionalNotes = infNfe?.Element(Ns + "infAdic")?.Element(Ns + "infCpl")?.Value;

        var orderNumber = !string.IsNullOrWhiteSpace(invoiceNumber)
            ? invoiceNumber.TrimStart('0')
            : (parsedData.AccessKey.Length >= 34 ? parsedData.AccessKey.Substring(25, 9).TrimStart('0') : $"OUT-{DateTime.UtcNow:yyyyMMdd}-{new Random().Next(1000, 9999)}");

        bool isReturnToCustomer = parsedData.Recipient.CnpjCpf == customer.Cnpj;

        // Instanciação da Ordem com o payload completo da SEFAZ
        var order = new OutboundOrder(
            companyId,
            customer.Id,
            orderNumber,
            invoiceNumber,
            invoiceSerie,
            parsedData.AccessKey,
            xmlContent,
            isReturnToCustomer,
            parsedData.Recipient.CnpjCpf,
            parsedData.Recipient.Name,
            parsedData.Recipient.StateRegistration,
            parsedData.Recipient.IeIndicator,
            parsedData.Recipient.Street,
            parsedData.Recipient.Number,
            parsedData.Recipient.Complement,
            parsedData.Recipient.Neighborhood,
            parsedData.Recipient.CityCode,
            parsedData.Recipient.CityName,
            parsedData.Recipient.State,
            parsedData.Recipient.ZipCode,
            parsedData.CarrierCnpjCpf,
            parsedData.CarrierName,
            parsedData.CarrierIe,
            parsedData.VehiclePlate,
            parsedData.VehiclePlateState,
            parsedData.FreightModality,
            additionalNotes,
            parsedData.IssueDate,
            expectedShipDate: parsedData.IssueDate
        );

        var existingProducts = await _db.Products
            .AsNoTracking()
            .Where(p => p.CompanyId == companyId && p.CustomerId == customer.Id)
            .ToListAsync(ct);

        var errors = new List<string>();

        foreach (var xmlItem in parsedData.Items)
        {
            var product = existingProducts.FirstOrDefault(p =>
                p.Sku.Equals(xmlItem.SkuCode, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrWhiteSpace(xmlItem.Barcode) && p.BaseBarcode == xmlItem.Barcode)
            );

            if (product == null)
            {
                errors.Add($"Item #{xmlItem.LineNumber}: SKU '{xmlItem.SkuCode}' (GTIN: {xmlItem.Barcode ?? "N/I"}) não está cadastrado para o depositante {customer.CorporateName}.");
                continue;
            }

            var orderItem = new OutboundOrderItem(
                order.Id,
                product.Id,
                xmlItem.LineNumber,
                product.Sku,
                xmlItem.Quantity,
                xmlItem.UnitValue
            );

            order.AddItem(orderItem);
        }

        if (errors.Any())
        {
            return Results.BadRequest(new
            {
                Message = "A importação do pedido falhou pois existem produtos não cadastrados para este Depositante.",
                Errors = errors
            });
        }

        _db.OutboundOrders.Add(order);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/outbound/orders/{order.Id}", new
        {
            order.Id,
            order.OrderNumber,
            CustomerName = customer.CorporateName,
            DestinationName = order.DestinationName,
            ItemsCount = order.Items.Count,
            Message = "Pedido de saída importado com sucesso a partir do XML de venda."
        });
    }
}

public static class ImportOutboundOrderEndpoints
{
    public static void MapImportOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/import-xml", async (Microsoft.AspNetCore.Http.IFormFile file, IMediator mediator) =>
        {
            if (file == null || file.Length == 0) return Results.BadRequest(new { Message = "Arquivo XML obrigatório." });
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            return await mediator.Send(new ImportOutboundOrderCommand(ms.ToArray()));
        })
        .WithTags("Outbound")
        .RequireAuthorization()
        .RequirePermission(Permissions.Outbound.Import)
        .DisableAntiforgery();
    }
}