using System.Text;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Parsers;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound;

// ==========================================
// 1. DTOs & CONTRATOS
// ==========================================
public record InboundOrderDto(Guid Id, string AccessKey, string Number, string IssuerName, DateTime IssueDate, string Status);
public record UploadNfeXmlCommand(byte[] XmlBytes) : IRequest<IResult>;
public record ListInboundOrdersQuery() : IRequest<IResult>;

public record InboundOrderItemDto(Guid Id, Guid? ProductId, string SkuOriginal, string? BarcodeOriginal, string DescriptionOriginal, string UnitOriginal, decimal ExpectedQty, decimal UnitValue, decimal TotalValue, string? Ncm, string? Cest, string? BatchOriginal, DateTime? ManufactureDateOriginal, DateTime? ExpirationDateOriginal);
public record InboundOrderDetailDto(Guid Id, string AccessKey, string Number, string Series, string IssuerCnpj, string IssuerName, DateTime IssueDate, string Status, List<InboundOrderItemDto> Items);

public record GetInboundOrderByIdQuery(Guid Id) : IRequest<IResult>;

// ==========================================
// 2. VALIDADORES
// ==========================================
public class UploadNfeXmlCommandValidator : AbstractValidator<UploadNfeXmlCommand>
{
    public UploadNfeXmlCommandValidator()
    {
        RuleFor(x => x.XmlBytes).NotEmpty().WithMessage("O arquivo XML é obrigatório.");
    }
}

// ==========================================
// 3. HANDLERS
// ==========================================
public class UploadNfeXmlHandler : IRequestHandler<UploadNfeXmlCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly INfeXmlParserService _parser;

    public UploadNfeXmlHandler(ApplicationDbContext db, IHttpContextAccessor http, INfeXmlParserService parser)
    {
        _db = db;
        _http = http;
        _parser = parser;
    }

    public async Task<IResult> Handle(UploadNfeXmlCommand request, CancellationToken ct)
    {
        // 1. Valida o Contexto da Empresa (Tenant)
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        // 2. Extrai e faz o Parse do XML
        var xmlContent = Encoding.UTF8.GetString(request.XmlBytes);
        ParsedNfeDto parsedNfe;
        try
        {
            parsedNfe = _parser.Parse(xmlContent);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = "Falha ao ler o XML. " + ex.Message });
        }

        // 3. Verifica se a NF-e já foi importada nesta empresa
        if (await _db.InboundOrders.AnyAsync(o => o.CompanyId == companyId && o.AccessKey == parsedNfe.AccessKey, ct))
            return Results.BadRequest(new { Message = $"A NF-e {parsedNfe.nNF} já foi importada no sistema." });

        // 4. Resolve o Depositante (Customer) pelo Emitente do XML
        // Nota: Assumimos que o Emitente é o dono da mercadoria. Se não existir, cadastra automaticamente!
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Cnpj == parsedNfe.EmitenteCnpj, ct);
        if (customer == null)
        {
            customer = new Customer(
                companyId, parsedNfe.EmitenteCnpj, parsedNfe.EmitenteNome, null, null, null,
                1, null, null, null, null, null, 0, null, "RS", null, null, null,
                false, false, false, false, false);

            _db.Customers.Add(customer);
            await _db.SaveChangesAsync(ct); // Salva para gerar o Id que usaremos nos itens
        }

        // 5. Verifica os Produtos e cruza com o Catálogo do WMS
        bool allProductsFound = true;
        var orderItems = new List<InboundOrderItem>();

        // Busca em memória todos os SKUs e EANs deste cliente para não fazer query dentro do loop
        var customerProducts = await _db.Products
            .Where(p => p.CompanyId == companyId && p.CustomerId == customer.Id)
            .Select(p => new { p.Id, p.Sku, p.BaseBarcode })
            .ToListAsync(ct);

        foreach (var item in parsedNfe.Items)
        {
            // Tenta encontrar o produto pelo cProd (SKU) ou cEAN (GTIN)
            var matchedProduct = customerProducts.FirstOrDefault(p =>
                p.Sku.Equals(item.cProd, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrEmpty(item.cEAN) && p.BaseBarcode == item.cEAN));

            var orderItem = new InboundOrderItem(
                Guid.Empty, // Será preenchido pelo EF ao adicionar na ordem
                item.cProd, item.cEAN, item.xProd, item.uCom, item.qCom,
                item.vUnCom, item.vProd, item.NCM, item.CEST,
                item.nLote, item.dFab, item.dVal
            );

            if (matchedProduct != null)
            {
                orderItem.LinkProduct(matchedProduct.Id);
            }
            else
            {
                allProductsFound = false; // Faltou pelo menos um produto
            }

            orderItems.Add(orderItem);
        }

        // 6. Define o Status Inteligente
        var status = allProductsFound ? InboundOrderStatus.AwaitingDock : InboundOrderStatus.PendingReview;

        // 7. Cria a Ordem de Recebimento
        var inboundOrder = new InboundOrder(
            companyId, customer.Id, parsedNfe.AccessKey, parsedNfe.nNF, parsedNfe.serie,
            parsedNfe.dhEmi, parsedNfe.EmitenteCnpj, parsedNfe.EmitenteNome, xmlContent, status
        );

        foreach (var item in orderItems)
        {
            inboundOrder.Items.Add(item);
        }

        _db.InboundOrders.Add(inboundOrder);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/inbound/{inboundOrder.Id}", new
        {
            inboundOrder.Id,
            inboundOrder.AccessKey,
            inboundOrder.Number,
            Status = status.ToString(),
            Message = allProductsFound ? "NF-e importada e pronta para Doca." : "NF-e importada. Existem produtos aguardando revisão/cadastro."
        });
    }
}

public class ListInboundOrdersHandler : IRequestHandler<ListInboundOrdersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public ListInboundOrdersHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(ListInboundOrdersQuery request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var orders = await _db.InboundOrders
            .Where(o => o.CompanyId == companyId)
            .OrderByDescending(o => o.IssueDate)
            .Select(o => new InboundOrderDto(o.Id, o.AccessKey, o.Number, o.IssuerName, o.IssueDate, o.Status.ToString()))
            .ToListAsync(ct);

        return Results.Ok(orders);
    }
}

public class GetInboundOrderByIdHandler : IRequestHandler<GetInboundOrderByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public GetInboundOrderByIdHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(GetInboundOrderByIdQuery request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var order = await _db.InboundOrders
            .AsNoTracking()
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.Id && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Recebimento não encontrado." });

        var dto = new InboundOrderDetailDto(
            order.Id, order.AccessKey, order.Number, order.Series, order.IssuerCnpj, order.IssuerName, order.IssueDate, order.Status.ToString(),
            order.Items.Select(i => new InboundOrderItemDto(
                i.Id, i.ProductId, i.SkuOriginal, i.BarcodeOriginal, i.DescriptionOriginal, i.UnitOriginal, i.ExpectedQty,
                i.UnitValue, i.TotalValue, i.Ncm, i.Cest, i.BatchOriginal, i.ManufactureDateOriginal, i.ExpirationDateOriginal
            )).ToList()
        );

        return Results.Ok(dto);
    }
}

// ==========================================
// 4. ENDPOINTS
// ==========================================
public static class InboundEndpoints
{
    public static void MapInboundEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inbound").WithTags("Inbound").RequireAuthorization();

        // O Upload exige permissão de Gestão do Inbound (Gerente/Backoffice)
        group.MapPost("/upload-xml", async (IFormFile xmlFile, IMediator mediator) =>
        {
            if (xmlFile == null || xmlFile.Length == 0) return Results.BadRequest(new { Message = "Arquivo XML obrigatório." });

            using var ms = new MemoryStream();
            await xmlFile.CopyToAsync(ms);

            return await mediator.Send(new UploadNfeXmlCommand(ms.ToArray()));

        }).RequirePermission(Permissions.Inbound.UploadXml).DisableAntiforgery();

        // A listagem base pede apenas visualização (View)
        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListInboundOrdersQuery()))
             .RequirePermission(Permissions.Inbound.View);

        // Adicione a rota de GET by ID
        group.MapGet("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new GetInboundOrderByIdQuery(id)))
             .RequirePermission(Permissions.Inbound.View);
    }
}