using System.Text;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.NfeParser;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Import;

public record ImportOutboundOrderCommand(byte[] FileBytes) : IRequest<IResult>;

public class ImportOutboundOrderHandler : IRequestHandler<ImportOutboundOrderCommand, IResult>
{
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
        catch { return Results.BadRequest(new { Message = "Arquivo inválido ou corrompido." }); }

        NfeParsedData parsedData;
        try { parsedData = _parser.ParseXml(xmlContent); }
        catch (Exception ex) { return Results.BadRequest(new { Message = $"Erro ao interpretar o XML da NF-e: {ex.Message}" }); }

        if (await _db.OutboundOrders.AnyAsync(o => o.CompanyId == companyId && o.AccessKey == parsedData.AccessKey, ct))
        {
            return Results.Conflict(new { Message = "Este pedido/NF-e já foi importado no sistema." });
        }

        var customer = await _db.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Cnpj == parsedData.IssuerCnpj, ct);

        if (customer == null)
            return Results.BadRequest(new { Message = $"O emitente do XML (CNPJ {parsedData.IssuerCnpj}) não está cadastrado como cliente nesta empresa." });

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(customer.Id))
        {
            return Results.Forbid();
        }

        var orderNumber = parsedData.AccessKey.Substring(25, 9);
        var order = new OutboundOrder(
            companyId, customer.Id, orderNumber, parsedData.AccessKey, xmlContent,
            parsedData.DestCnpj, parsedData.DestName, parsedData.DestCity, parsedData.DestState, parsedData.DestZipCode,
            parsedData.IssueDate, null
        );

        var errors = new List<string>();
        foreach (var xmlItem in parsedData.Items)
        {
            var product = await _db.Products
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.CompanyId == companyId && p.CustomerId == customer.Id && p.Sku == xmlItem.SkuCode, ct);

            if (product == null)
            {
                errors.Add($"Linha {xmlItem.LineNumber}: Produto SKU '{xmlItem.SkuCode}' não cadastrado para este Depositante.");
                continue;
            }

            var orderItem = new OutboundOrderItem(order.Id, product.Id, xmlItem.LineNumber, xmlItem.SkuCode, xmlItem.Quantity, xmlItem.UnitValue);
            order.AddItem(orderItem);
        }

        if (errors.Any())
        {
            return Results.BadRequest(new { Message = "A importação falhou pois existem produtos não mapeados no sistema.", Errors = errors });
        }

        _db.OutboundOrders.Add(order);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/outbound/orders/{order.Id}", new { order.Id, order.OrderNumber, order.DestinationName, ItemsCount = order.Items.Count });
    }
}

public static class ImportOutboundOrderEndpoints
{
    public static void MapImportOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/import-xml", async (Microsoft.AspNetCore.Http.IFormFile file, IMediator mediator) =>
        {
            if (file == null || file.Length == 0) return Results.BadRequest(new { Message = "Arquivo obrigatório." });
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