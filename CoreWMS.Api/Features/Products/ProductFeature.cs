using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

// ==========================================
// 1. DTOs & CONTRATOS
// ==========================================
public record ProductPackagingDto(Guid Id, Guid PackagingTypeId, string PackagingTypeCode, decimal ConversionFactor, bool IsDefaultInbound, bool IsDefaultOutbound, bool AllowFractionalPicking, decimal GrossWeight, decimal NetWeight, decimal LengthMm, decimal WidthMm, decimal HeightMm, decimal CubageM3, string? Barcode);
public record ProductDto(Guid Id, Guid CustomerId, string CustomerName, string Sku, string Description, string BaseUnit, string? BaseBarcode, string? Ncm, string? Cest, int Origin, int MaxStacking, bool RequireBatchControl, bool RequireManufactureDate, bool RequireExpirationDate, bool RequireSerialControl, int PickingStrategy, int? InboundShelfLifeToleranceDays, int? OutboundShelfLifeToleranceDays, bool IsActive, List<ProductPackagingDto> Packagings);

public record CreateProductPackagingCommand(Guid PackagingTypeId, decimal ConversionFactor, bool IsDefaultInbound, bool IsDefaultOutbound, bool AllowFractionalPicking, decimal GrossWeight, decimal NetWeight, decimal LengthMm, decimal WidthMm, decimal HeightMm, string? Barcode);
public record CreateProductCommand(Guid CustomerId, string Sku, string Description, string BaseUnit, string? BaseBarcode, string? Ncm, string? Cest, int Origin, int MaxStacking, bool RequireBatchControl, bool RequireManufactureDate, bool RequireExpirationDate, bool RequireSerialControl, int PickingStrategy, int? InboundShelfLifeToleranceDays, int? OutboundShelfLifeToleranceDays, List<CreateProductPackagingCommand> Packagings) : IRequest<IResult>;

// NOVO: Commands de Edição
public record UpdateProductPackagingCommand(Guid? Id, Guid PackagingTypeId, decimal ConversionFactor, bool IsDefaultInbound, bool IsDefaultOutbound, bool AllowFractionalPicking, decimal GrossWeight, decimal NetWeight, decimal LengthMm, decimal WidthMm, decimal HeightMm, string? Barcode);
public record UpdateProductCommand(Guid Id, string Description, string BaseUnit, string? BaseBarcode, string? Ncm, string? Cest, int Origin, int MaxStacking, bool RequireBatchControl, bool RequireManufactureDate, bool RequireExpirationDate, bool RequireSerialControl, int PickingStrategy, int? InboundShelfLifeToleranceDays, int? OutboundShelfLifeToleranceDays, List<UpdateProductPackagingCommand> Packagings) : IRequest<IResult>;

public record ListProductsQuery(Guid? CustomerId, string? Search) : IRequest<IResult>;
public record DeleteProductCommand(Guid Id) : IRequest<IResult>;

// ==========================================
// 2. VALIDADORES
// ==========================================
public class CreateProductCommandValidator : AbstractValidator<CreateProductCommand>
{
    public CreateProductCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.Sku).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(200);
        RuleFor(x => x.BaseUnit).NotEmpty().MaximumLength(10);
        RuleFor(x => x.MaxStacking).GreaterThan(0);
        RuleFor(x => x.PickingStrategy).Must(x => Enum.IsDefined(typeof(PickingStrategy), x)).WithMessage("Estratégia inválida.");
        RuleFor(x => x.Packagings).NotEmpty().WithMessage("O produto deve possuir pelo menos uma embalagem vinculada.");
    }
}

public class UpdateProductCommandValidator : AbstractValidator<UpdateProductCommand>
{
    public UpdateProductCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Description).NotEmpty().MaximumLength(200);
        RuleFor(x => x.BaseUnit).NotEmpty().MaximumLength(10);
        RuleFor(x => x.MaxStacking).GreaterThan(0);
        RuleFor(x => x.PickingStrategy).Must(x => Enum.IsDefined(typeof(PickingStrategy), x)).WithMessage("Estratégia inválida.");
        RuleFor(x => x.Packagings).NotEmpty().WithMessage("O produto deve possuir pelo menos uma embalagem vinculada.");
    }
}

// ==========================================
// 3. HANDLERS
// ==========================================
public class CreateProductHandler : IRequestHandler<CreateProductCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public CreateProductHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(CreateProductCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        if (!await _db.Customers.AnyAsync(c => c.Id == request.CustomerId && c.CompanyId == companyId, ct))
            return Results.BadRequest(new { Message = "Depositante inválido ou não pertence a esta empresa." });

        if (await _db.Products.AnyAsync(p => p.CompanyId == companyId && p.CustomerId == request.CustomerId && p.Sku == request.Sku, ct))
            return Results.BadRequest(new { Message = "Este SKU já está cadastrado para este Depositante." });

        if (!string.IsNullOrWhiteSpace(request.BaseBarcode) &&
            await _db.Products.AnyAsync(p => p.CompanyId == companyId && p.CustomerId == request.CustomerId && p.BaseBarcode == request.BaseBarcode, ct))
            return Results.BadRequest(new { Message = "Este Código de Barras Base (GTIN) já está em uso por outro produto deste Depositante." });

        var product = new Product(companyId, request.CustomerId, request.Sku, request.Description, request.BaseUnit, (PickingStrategy)request.PickingStrategy);

        product.UpdateFiscal(request.Ncm, request.Cest, request.Origin, request.BaseBarcode);
        product.UpdateRules(request.RequireBatchControl, request.RequireManufactureDate, request.RequireExpirationDate, request.RequireSerialControl, (PickingStrategy)request.PickingStrategy, request.MaxStacking, request.InboundShelfLifeToleranceDays, request.OutboundShelfLifeToleranceDays);

        foreach (var pack in request.Packagings)
        {
            var packaging = new ProductPackaging(product.Id, pack.PackagingTypeId, pack.ConversionFactor, pack.IsDefaultInbound, pack.IsDefaultOutbound, pack.AllowFractionalPicking);
            packaging.UpdateDimensions(pack.GrossWeight, pack.NetWeight, pack.LengthMm, pack.WidthMm, pack.HeightMm, pack.Barcode);
            product.Packagings.Add(packaging);
        }

        _db.Products.Add(product);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/products/{product.Id}", new { product.Id, product.Sku });
    }
}

public class UpdateProductHandler : IRequestHandler<UpdateProductCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public UpdateProductHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(UpdateProductCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var product = await _db.Products
            .Include(p => p.Packagings)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);

        if (product == null) return Results.NotFound(new { Message = "Produto não encontrado." });

        if (!string.IsNullOrWhiteSpace(request.BaseBarcode) &&
            await _db.Products.AnyAsync(p => p.CompanyId == companyId && p.CustomerId == product.CustomerId && p.BaseBarcode == request.BaseBarcode && p.Id != request.Id, ct))
            return Results.BadRequest(new { Message = "Este Código de Barras Base (GTIN) já está em uso por outro produto deste Depositante." });

        product.UpdateBasicInfo(request.Description, request.BaseUnit);
        product.UpdateFiscal(request.Ncm, request.Cest, request.Origin, request.BaseBarcode);
        product.UpdateRules(request.RequireBatchControl, request.RequireManufactureDate, request.RequireExpirationDate, request.RequireSerialControl, (PickingStrategy)request.PickingStrategy, request.MaxStacking, request.InboundShelfLifeToleranceDays, request.OutboundShelfLifeToleranceDays);

        // 1. Excluir as embalagens que o usuário removeu da tela
        var requestPackIds = request.Packagings.Where(x => x.Id.HasValue).Select(x => x.Id!.Value).ToList();
        var packsToRemove = product.Packagings.Where(p => !requestPackIds.Contains(p.Id)).ToList();

        if (packsToRemove.Any())
        {
            _db.ProductPackagings.RemoveRange(packsToRemove);
        }

        // 2. Adicionar ou Atualizar embalagens
        foreach (var packReq in request.Packagings)
        {
            if (packReq.Id.HasValue)
            {
                var existing = product.Packagings.FirstOrDefault(p => p.Id == packReq.Id.Value);
                if (existing != null)
                {
                    existing.UpdateFlagsAndFactor(packReq.ConversionFactor, packReq.IsDefaultInbound, packReq.IsDefaultOutbound, packReq.AllowFractionalPicking);
                    existing.UpdateDimensions(packReq.GrossWeight, packReq.NetWeight, packReq.LengthMm, packReq.WidthMm, packReq.HeightMm, packReq.Barcode);
                }
            }
            else
            {
                var newPack = new ProductPackaging(product.Id, packReq.PackagingTypeId, packReq.ConversionFactor, packReq.IsDefaultInbound, packReq.IsDefaultOutbound, packReq.AllowFractionalPicking);
                newPack.UpdateDimensions(packReq.GrossWeight, packReq.NetWeight, packReq.LengthMm, packReq.WidthMm, packReq.HeightMm, packReq.Barcode);
                product.Packagings.Add(newPack);
            }
        }

        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class ListProductsHandler : IRequestHandler<ListProductsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public ListProductsHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(ListProductsQuery request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var query = _db.Products
            .AsNoTracking()
            .Include(p => p.Customer)
            .Include(p => p.Packagings)
                .ThenInclude(pp => pp.PackagingType)
            .Where(p => p.CompanyId == companyId);

        if (request.CustomerId.HasValue) query = query.Where(p => p.CustomerId == request.CustomerId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.ToLower();
            query = query.Where(p => p.Sku.ToLower().Contains(s) || p.Description.ToLower().Contains(s) || (p.BaseBarcode != null && p.BaseBarcode.ToLower().Contains(s)));
        }

        var products = await query.ToListAsync(ct);

        var dtos = products.Select(p => new ProductDto(
            p.Id, p.CustomerId, p.Customer.CorporateName, p.Sku, p.Description, p.BaseUnit, p.BaseBarcode, p.Ncm, p.Cest, p.Origin, p.MaxStacking,
            p.RequireBatchControl, p.RequireManufactureDate, p.RequireExpirationDate, p.RequireSerialControl, (int)p.PickingStrategy,
            p.InboundShelfLifeToleranceDays, p.OutboundShelfLifeToleranceDays, p.IsActive,
            p.Packagings.Select(pp => new ProductPackagingDto(
                pp.Id, pp.PackagingTypeId, pp.PackagingType.Code, pp.ConversionFactor, pp.IsDefaultInbound, pp.IsDefaultOutbound,
                pp.AllowFractionalPicking, pp.GrossWeight, pp.NetWeight, pp.LengthMm, pp.WidthMm, pp.HeightMm, pp.CubageM3, pp.Barcode
            )).ToList()
        )).ToList();

        return Results.Ok(dtos);
    }
}

public class DeleteProductHandler : IRequestHandler<DeleteProductCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public DeleteProductHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(DeleteProductCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);
        if (product == null) return Results.NotFound();

        try
        {
            _db.Products.Remove(product); // A constraint Cascade apagará os ProductPackagings atrelados
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir o produto pois ele já possui histórico de estoque ou movimentações." });
        }

        return Results.NoContent();
    }
}

// ==========================================
// 4. ENDPOINTS
// ==========================================
public static class ProductEndpoints
{
    public static void MapProductEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/products").WithTags("Products").RequireAuthorization();

        group.MapPost("/", async (CreateProductCommand cmd, IMediator mediator) => await mediator.Send(cmd))
             .RequirePermission(Permissions.Products.Create);

        group.MapPut("/{id:guid}", async (Guid id, UpdateProductCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id }))
             .RequirePermission(Permissions.Products.Edit);

        group.MapGet("/", async ([AsParameters] ListProductsQuery query, IMediator mediator) => await mediator.Send(query))
             .RequirePermission(Permissions.Products.View);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteProductCommand(id)))
             .RequirePermission(Permissions.Products.Delete);
    }
}