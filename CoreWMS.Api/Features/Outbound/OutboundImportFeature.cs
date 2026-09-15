using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.NfeParser;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound;

// ==========================================
// 1. COMMAND
// ==========================================
public record ImportOutboundOrderCommand(byte[] FileBytes) : IRequest<IResult>;

// ==========================================
// 2. HANDLER
// ==========================================
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

        // 1. Decodifica e faz o Parse do XML
        string xmlContent;
        try
        {
            xmlContent = Encoding.UTF8.GetString(request.FileBytes);
        }
        catch (Exception)
        {
            return Results.BadRequest(new { Message = "Arquivo inválido ou corrompido." });
        }

        NfeParsedData parsedData;
        try
        {
            parsedData = _parser.ParseXml(xmlContent);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = $"Erro ao interpretar o XML da NF-e: {ex.Message}" });
        }

        // 2. Valida se a Ordem já foi importada
        if (await _db.OutboundOrders.AnyAsync(o => o.CompanyId == companyId && o.AccessKey == parsedData.AccessKey, ct))
        {
            return Results.Conflict(new { Message = "Este pedido/NF-e já foi importado no sistema." });
        }

        // 3. Valida o Depositante (Emitente do XML na saída)
        var customer = await _db.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Cnpj == parsedData.IssuerCnpj, ct);

        if (customer == null)
            return Results.BadRequest(new { Message = $"O emitente do XML (CNPJ {parsedData.IssuerCnpj}) não está cadastrado como cliente nesta empresa." });

        // Trava de Viseira B2B: Se for parceiro, ele só pode importar XML dele mesmo!
        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(customer.Id))
        {
            return Results.Forbid();
        }

        // 4. Cria a Entidade Principal (Cabeçalho)
        var orderNumber = parsedData.AccessKey.Substring(25, 9); // O número da nota fiscal embutido na chave

        var order = new OutboundOrder(
            companyId,
            customer.Id,
            orderNumber,
            parsedData.AccessKey,
            xmlContent,
            parsedData.DestCnpj,
            parsedData.DestName,
            parsedData.DestCity,
            parsedData.DestState,
            parsedData.DestZipCode,
            parsedData.IssueDate,
            null // ExpectedShipDate ficará nulo por enquanto até implementarmos roteirização
        );

        // 5. Valida os Produtos e Cria os Itens da Ordem
        var errors = new List<string>();

        foreach (var xmlItem in parsedData.Items)
        {
            // Tenta achar o produto pelo SKU enviado no XML
            var product = await _db.Products
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.CompanyId == companyId && p.CustomerId == customer.Id && p.Sku == xmlItem.SkuCode, ct);

            if (product == null)
            {
                errors.Add($"Linha {xmlItem.LineNumber}: Produto SKU '{xmlItem.SkuCode}' não cadastrado para este Depositante.");
                continue;
            }

            var orderItem = new OutboundOrderItem(
                order.Id,
                product.Id,
                xmlItem.LineNumber,
                xmlItem.SkuCode,
                xmlItem.Quantity,
                xmlItem.UnitValue
            );

            order.AddItem(orderItem);
        }

        if (errors.Any())
        {
            // Aborta a importação se algum produto do XML for desconhecido
            return Results.BadRequest(new
            {
                Message = "A importação falhou pois existem produtos não mapeados no sistema.",
                Errors = errors
            });
        }

        _db.OutboundOrders.Add(order);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/outbound/orders/{order.Id}", new
        {
            order.Id,
            order.OrderNumber,
            order.DestinationName,
            ItemsCount = order.Items.Count
        });
    }
}

// ==========================================
// 3. ENDPOINT
// ==========================================
public static class OutboundImportEndpoints
{
    public static void MapOutboundImportEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/import-xml", async (IFormFile file, IMediator mediator) =>
        {
            if (file == null || file.Length == 0)
                return Results.BadRequest(new { Message = "Arquivo obrigatório." });

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);

            return await mediator.Send(new ImportOutboundOrderCommand(ms.ToArray()));
        })
        .WithTags("Outbound")
        .RequireAuthorization()
        .RequirePermission(Permissions.Outbound.Import) // Garanta que a constante existe no Identity/Constants/Permissions.cs
        .DisableAntiforgery();
    }
}