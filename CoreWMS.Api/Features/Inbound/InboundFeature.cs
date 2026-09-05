using System.Text;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Parsers;
using CoreWMS.Api.Infrastructure.Printing;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Products;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound;

// ==========================================
// 1. DTOs & CONTRATOS
// ==========================================
public record InboundOrderDto(Guid Id, string AccessKey, string Number, string IssuerName, DateTime IssueDate, string Status, bool HasDivergence);
public record UploadNfeXmlCommand(byte[] XmlBytes) : IRequest<IResult>;
public record ReviewInboundItemCommand(Guid OrderItemId, string Sku, string Description, string BaseUnit, List<CreateProductPackagingCommand> Packagings) : IRequest<IResult>;
public record AssignDockToItemCommand(Guid OrderItemId, Guid DockLocationId) : IRequest<IResult>;
public record StartItemReceivingCommand(Guid OrderItemId) : IRequest<IResult>;
public record FinishItemReceivingCommand(Guid OrderItemId, string ServiceType, Guid ProductPackagingId, int FullVolumesCount, decimal PartialVolumeQty, decimal DamagedQty, decimal MissingQty, decimal OverageQty) : IRequest<IResult>;
public record ListInboundOrdersQuery() : IRequest<IResult>;

// Atualizado: Novos campos de Status, Operador, Doca e Qualidade
public record InboundOrderItemDto(
    Guid Id, Guid? ProductId, string SkuOriginal, string? BarcodeOriginal, string DescriptionOriginal,
    string UnitOriginal, decimal ExpectedQty, decimal UnitValue, decimal TotalValue,
    string? Ncm, string? Cest, string? BatchOriginal, DateTime? ManufactureDateOriginal, DateTime? ExpirationDateOriginal,
    int Status, string? AssignedUserName, Guid? DockLocationId,
    decimal GoodQty, decimal DamagedQty, decimal MissingQty, decimal OverageQty
);

// Atualizado: Novo campo HasDivergence
public record InboundOrderDetailDto(
    Guid Id, string AccessKey, string Number, string Series, string IssuerCnpj,
    string IssuerName, DateTime IssueDate, string Status, bool HasDivergence, List<InboundOrderItemDto> Items
);

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

    public UploadNfeXmlHandler(ApplicationDbContext db, IHttpContextAccessor http, INfeXmlParserService parser) { _db = db; _http = http; _parser = parser; }

    public async Task<IResult> Handle(UploadNfeXmlCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();
        var xmlContent = Encoding.UTF8.GetString(request.XmlBytes);
        var parsedNfe = _parser.Parse(xmlContent);

        // VALIDAÇÃO FISCAL
        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company == null || company.Cnpj != parsedNfe.DestinatarioCnpj)
            return Results.BadRequest(new { Message = $"Bloqueado: O XML é destinado ao CNPJ {parsedNfe.DestinatarioCnpj}, diferente da empresa atual ({company?.Cnpj})." });

        if (await _db.InboundOrders.AnyAsync(o => o.CompanyId == companyId && o.AccessKey == parsedNfe.AccessKey, ct))
            return Results.BadRequest(new { Message = "NF-e já importada." });

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Cnpj == parsedNfe.EmitenteCnpj, ct);
        if (customer == null)
        {
            customer = new Customer(companyId, parsedNfe.EmitenteCnpj, parsedNfe.EmitenteNome, null, null, null, 1, null, null, null, null, null, 0, null, "RS", null, null, null, false, false, false, false, false);
            _db.Customers.Add(customer);
            await _db.SaveChangesAsync(ct);
        }

        var orderItems = new List<InboundOrderItem>();
        bool allProductsFound = true;
        var customerProducts = await _db.Products.Where(p => p.CompanyId == companyId && p.CustomerId == customer.Id).Select(p => new { p.Id, p.Sku, p.BaseBarcode }).ToListAsync(ct);

        foreach (var item in parsedNfe.Items)
        {
            var matchedProduct = customerProducts.FirstOrDefault(p => p.Sku.Equals(item.cProd, StringComparison.OrdinalIgnoreCase) || (!string.IsNullOrEmpty(item.cEAN) && p.BaseBarcode == item.cEAN));
            var orderItem = new InboundOrderItem(Guid.Empty, item.cProd, item.cEAN, item.xProd, item.uCom, item.qCom, item.vUnCom, item.vProd, item.NCM, item.CEST, item.nLote, item.dFab, item.dVal);

            if (matchedProduct != null) orderItem.LinkProduct(matchedProduct.Id);
            else allProductsFound = false;

            orderItems.Add(orderItem);
        }

        var initialStatus = allProductsFound ? InboundOrderStatus.AwaitingDock : InboundOrderStatus.PendingReview;

        var inboundOrder = new InboundOrder(companyId, customer.Id, parsedNfe.AccessKey, parsedNfe.nNF, parsedNfe.serie, parsedNfe.dhEmi, parsedNfe.EmitenteCnpj, parsedNfe.EmitenteNome, xmlContent, initialStatus);

        foreach (var item in orderItems) inboundOrder.Items.Add(item);

        _db.InboundOrders.Add(inboundOrder);
        inboundOrder.CheckAndUpdateStatus();
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/inbound/{inboundOrder.Id}", new
        {
            inboundOrder.Id,
            Message = allProductsFound
                ? "NF-e importada! Todos os itens vinculados, pronta para indicação de doca."
                : "NF-e importada. Existem produtos novos aguardando revisão."
        });
    }
}

public class ReviewInboundItemHandler : IRequestHandler<ReviewInboundItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public ReviewInboundItemHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ReviewInboundItemCommand request, CancellationToken ct)
    {
        var item = await _db.InboundOrderItems.Include(i => i.InboundOrder).FirstOrDefaultAsync(i => i.Id == request.OrderItemId, ct);
        if (item == null) return Results.NotFound();

        var product = new Product(item.InboundOrder.CompanyId, item.InboundOrder.CustomerId, request.Sku, request.Description, request.BaseUnit, CoreWMS.Api.Features.Products.Enums.PickingStrategy.Fifo);
        product.UpdateFiscal(item.Ncm, item.Cest, 0, item.BarcodeOriginal);

        foreach (var pack in request.Packagings)
        {
            var packaging = new ProductPackaging(product.Id, pack.PackagingTypeId, pack.ConversionFactor, pack.IsDefaultInbound, pack.IsDefaultOutbound, pack.AllowFractionalPicking);
            packaging.UpdateDimensions(pack.GrossWeight, pack.NetWeight, pack.LengthMm, pack.WidthMm, pack.HeightMm, pack.Barcode);
            product.Packagings.Add(packaging);
        }

        _db.Products.Add(product);
        item.LinkProduct(product.Id);
        item.InboundOrder.CheckAndUpdateStatus();
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Produto revisado com sucesso." });
    }
}

public class AssignDockToItemHandler : IRequestHandler<AssignDockToItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public AssignDockToItemHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(AssignDockToItemCommand request, CancellationToken ct)
    {
        var item = await _db.InboundOrderItems.Include(i => i.InboundOrder).FirstOrDefaultAsync(i => i.Id == request.OrderItemId, ct);
        if (item == null) return Results.NotFound();

        var location = await _db.Locations.FirstOrDefaultAsync(l => l.Id == request.DockLocationId, ct);
        item.AssignDock(location!.Id);
        item.InboundOrder.CheckAndUpdateStatus();
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Doca atribuída." });
    }
}

public class StartItemReceivingHandler : IRequestHandler<StartItemReceivingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    public StartItemReceivingHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(StartItemReceivingCommand request, CancellationToken ct)
    {
        var userId = Guid.Parse(_http.HttpContext?.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
        var userName = _http.HttpContext?.User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "Operador";
        var item = await _db.InboundOrderItems.Include(i => i.InboundOrder).FirstOrDefaultAsync(i => i.Id == request.OrderItemId, ct);
        item!.StartReceiving(userId, userName);
        item.InboundOrder.CheckAndUpdateStatus();
        await _db.SaveChangesAsync(ct);
        return Results.Ok();
    }
}

public class FinishItemReceivingHandler : IRequestHandler<FinishItemReceivingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly IPrintService _printService;

    public FinishItemReceivingHandler(ApplicationDbContext db, IHttpContextAccessor http, IPrintService printService) { _db = db; _http = http; _printService = printService; }

    public async Task<IResult> Handle(FinishItemReceivingCommand request, CancellationToken ct)
    {
        var userId = Guid.Parse(_http.HttpContext?.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
        var companyId = Guid.Parse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString()!);

        var item = await _db.InboundOrderItems.Include(i => i.InboundOrder).FirstOrDefaultAsync(i => i.Id == request.OrderItemId && i.InboundOrder.CompanyId == companyId, ct);
        if (item == null || item.AssignedUserId != userId) return Results.BadRequest(new { Message = "Sessão inválida." });

        var packaging = await _db.ProductPackagings.FirstOrDefaultAsync(p => p.Id == request.ProductPackagingId, ct);
        var goodQty = (request.FullVolumesCount * packaging!.ConversionFactor) + request.PartialVolumeQty;

        if ((goodQty + request.DamagedQty + request.MissingQty) != item.ExpectedQty)
            return Results.BadRequest(new { Message = "A soma (Bons + Avarias + Faltas) não fecha com a NF-e." });

        var hus = new List<HandlingUnit>();
        for (int i = 0; i < request.FullVolumesCount; i++)
        {
            var hu = new HandlingUnit(companyId, $"LPN{DateTime.UtcNow:yyMMddHHmmss}{Guid.NewGuid().ToString()[..4].ToUpper()}", item.ProductId!.Value, packaging.Id, packaging.ConversionFactor, item.InboundOrderId, item.Id, item.BatchOriginal, item.ManufactureDateOriginal, item.ExpirationDateOriginal, HandlingUnitQuality.Good);
            hu.MoveToLocation(item.DockLocationId!.Value);
            hus.Add(hu);
        }
        if (request.PartialVolumeQty > 0)
        {
            var hu = new HandlingUnit(companyId, $"LPN{DateTime.UtcNow:yyMMddHHmmss}{Guid.NewGuid().ToString()[..4].ToUpper()}", item.ProductId!.Value, packaging.Id, request.PartialVolumeQty, item.InboundOrderId, item.Id, item.BatchOriginal, item.ManufactureDateOriginal, item.ExpirationDateOriginal, HandlingUnitQuality.Good);
            hu.MoveToLocation(item.DockLocationId!.Value);
            hus.Add(hu);
        }
        if (request.DamagedQty > 0)
        {
            var hu = new HandlingUnit(companyId, $"LPN-AVR{DateTime.UtcNow:yyMMddHHmmss}", item.ProductId!.Value, packaging.Id, request.DamagedQty, item.InboundOrderId, item.Id, item.BatchOriginal, item.ManufactureDateOriginal, item.ExpirationDateOriginal, HandlingUnitQuality.Damaged);
            hu.MoveToLocation(item.DockLocationId!.Value);
            hus.Add(hu);
        }
        if (request.MissingQty > 0)
        {
            var hu = new HandlingUnit(companyId, $"LPN-FLT{DateTime.UtcNow:yyMMddHHmmss}", item.ProductId!.Value, null, request.MissingQty, item.InboundOrderId, item.Id, item.BatchOriginal, item.ManufactureDateOriginal, item.ExpirationDateOriginal, HandlingUnitQuality.Missing);
            hus.Add(hu); // Falta não tem localização física
        }

        item.FinishReceiving(request.ServiceType, goodQty, request.DamagedQty, request.MissingQty, request.OverageQty);
        item.InboundOrder.CheckAndUpdateStatus();

        _db.HandlingUnits.AddRange(hus);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "LPNs gerados." });
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
            .Select(o => new InboundOrderDto(o.Id, o.AccessKey, o.Number, o.IssuerName, o.IssueDate, o.Status.ToString(), o.HasDivergence))
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
            order.Id, order.AccessKey, order.Number, order.Series, order.IssuerCnpj, order.IssuerName, order.IssueDate, order.Status.ToString(), order.HasDivergence,
            order.Items.Select(i => new InboundOrderItemDto(
                i.Id, i.ProductId, i.SkuOriginal, i.BarcodeOriginal, i.DescriptionOriginal, i.UnitOriginal, i.ExpectedQty,
                i.UnitValue, i.TotalValue, i.Ncm, i.Cest, i.BatchOriginal, i.ManufactureDateOriginal, i.ExpirationDateOriginal,
                (int)i.Status, i.AssignedUserName, i.DockLocationId, i.GoodQty, i.DamagedQty, i.MissingQty, i.OverageQty
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

        group.MapPost("/upload-xml", async (IFormFile xmlFile, IMediator mediator) => { using var ms = new MemoryStream(); await xmlFile.CopyToAsync(ms); return await mediator.Send(new UploadNfeXmlCommand(ms.ToArray())); }).RequirePermission(Permissions.Inbound.UploadXml).DisableAntiforgery();
        group.MapPost("/review-item", async (ReviewInboundItemCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Inbound.ReviewProducts);
        group.MapPost("/items/{id:guid}/assign-dock", async (Guid id, AssignDockToItemCommand cmd, IMediator mediator) => await mediator.Send(cmd with { OrderItemId = id })).RequirePermission(Permissions.Inbound.AssignDock);
        group.MapPost("/items/{id:guid}/start", async (Guid id, IMediator mediator) => await mediator.Send(new StartItemReceivingCommand(id))).RequirePermission(Permissions.Inbound.ExecuteChecking);
        group.MapPost("/items/finish", async (FinishItemReceivingCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Inbound.ExecuteChecking);
        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListInboundOrdersQuery())).RequirePermission(Permissions.Inbound.View);
        group.MapGet("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new GetInboundOrderByIdQuery(id))).RequirePermission(Permissions.Inbound.View);
    }
}