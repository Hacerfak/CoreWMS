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

        // 1. Valida se o pedido/NF-e já foi importado no WMS
        if (await _db.OutboundOrders.AnyAsync(o => o.CompanyId == companyId && o.AccessKey == parsedData.AccessKey, ct))
        {
            return Results.Conflict(new { Message = "Este pedido/NF-e já foi importado anteriormente no sistema." });
        }

        // 2. REGRA CRÍTICA: O emitente da nota DEVE ser um Depositante cadastrado na empresa
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

        // 3. Extração detalhada do XML (Ide, Transportadora, Veículo e Observações Fiscais)
        var doc = XDocument.Parse(xmlContent);
        var infNfe = doc.Descendants(Ns + "infNFe").FirstOrDefault();
        var ide = infNfe?.Element(Ns + "ide");
        var transp = infNfe?.Element(Ns + "transp");

        string? invoiceNumber = ide?.Element(Ns + "nNF")?.Value;
        string? invoiceSerie = ide?.Element(Ns + "serie")?.Value;

        string? carrierCnpjCpf = null;
        string? carrierName = null;
        string? vehiclePlate = null;
        string? vehiclePlateState = null;

        var transporta = transp?.Element(Ns + "transporta");
        if (transporta != null)
        {
            carrierCnpjCpf = transporta.Element(Ns + "CNPJ")?.Value ?? transporta.Element(Ns + "CPF")?.Value;
            carrierName = transporta.Element(Ns + "xNome")?.Value;
        }

        var veicTransp = transp?.Element(Ns + "veicTransp");
        if (veicTransp != null)
        {
            vehiclePlate = veicTransp.Element(Ns + "placa")?.Value;
            vehiclePlateState = veicTransp.Element(Ns + "UF")?.Value;
        }

        var additionalNotes = infNfe?.Element(Ns + "infAdic")?.Element(Ns + "infCpl")?.Value;

        // Número da Ordem de Saída
        var orderNumber = !string.IsNullOrWhiteSpace(invoiceNumber)
            ? invoiceNumber.TrimStart('0')
            : (parsedData.AccessKey.Length >= 34 ? parsedData.AccessKey.Substring(25, 9).TrimStart('0') : $"OUT-{DateTime.UtcNow:yyyyMMdd}-{new Random().Next(1000, 9999)}");

        bool isReturnToCustomer = parsedData.DestCnpj == customer.Cnpj;

        // 4. Instanciação da Ordem de Saída com todos os dados fiscais e logísticos
        var order = new OutboundOrder(
            companyId,
            customer.Id,
            orderNumber,
            invoiceNumber,
            invoiceSerie,
            parsedData.AccessKey,
            xmlContent,
            isReturnToCustomer,
            parsedData.DestCnpj,
            parsedData.DestName,
            parsedData.DestCity,
            parsedData.DestState,
            parsedData.DestZipCode,
            carrierCnpjCpf,
            carrierName,
            vehiclePlate,
            vehiclePlateState,
            additionalNotes,
            parsedData.IssueDate,
            expectedShipDate: parsedData.IssueDate
        );

        // 5. Mapeamento e Validação dos Produtos
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