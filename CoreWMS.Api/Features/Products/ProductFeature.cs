using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Core.Models;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

// ==========================================
// 1. DTOs & CONTRATOS
// ==========================================
public record ProductPackagingDto(Guid Id, Guid PackagingTypeId, string PackagingTypeCode, decimal ConversionFactor, bool IsDefaultInbound, bool IsDefaultOutbound, bool AllowFractionalPicking, decimal GrossWeight, decimal NetWeight, decimal LengthMm, decimal WidthMm, decimal HeightMm, decimal CubageM3, string? Barcode);

public record ProductDto(
    Guid Id, Guid CustomerId, string CustomerName, string Sku, string Description, string BaseUnit, string? BaseBarcode, string? Ncm, string? Cest, int Origin, int MaxStacking,
    bool TracksBatch, bool StrictBatch, bool TracksManufacture, bool StrictManufacture, bool TracksExpiration, bool StrictExpiration, bool TracksSerial, bool StrictSerial,
    int PickingStrategy, int PickingBaseDate, int? InboundShelfLifeToleranceDays, int? OutboundShelfLifeToleranceDays, bool IsActive, List<ProductPackagingDto> Packagings);

public record CreateProductPackagingCommand(Guid PackagingTypeId, decimal ConversionFactor, bool IsDefaultInbound, bool IsDefaultOutbound, bool AllowFractionalPicking, decimal GrossWeight, decimal NetWeight, decimal LengthMm, decimal WidthMm, decimal HeightMm, string? Barcode);

public record CreateProductCommand(
    Guid CustomerId, string Sku, string Description, string BaseUnit, string? BaseBarcode, string? Ncm, string? Cest, int Origin, int MaxStacking,
    bool TracksBatch, bool StrictBatch, bool TracksManufacture, bool StrictManufacture, bool TracksExpiration, bool StrictExpiration, bool TracksSerial, bool StrictSerial,
    int PickingStrategy, int PickingBaseDate, int? InboundShelfLifeToleranceDays, int? OutboundShelfLifeToleranceDays, List<CreateProductPackagingCommand> Packagings) : IRequest<IResult>;

public record UpdateProductPackagingCommand(Guid? Id, Guid PackagingTypeId, decimal ConversionFactor, bool IsDefaultInbound, bool IsDefaultOutbound, bool AllowFractionalPicking, decimal GrossWeight, decimal NetWeight, decimal LengthMm, decimal WidthMm, decimal HeightMm, string? Barcode);

public record UpdateProductCommand(
    Guid Id, string Description, string BaseUnit, string? BaseBarcode, string? Ncm, string? Cest, int Origin, int MaxStacking,
    bool TracksBatch, bool StrictBatch, bool TracksManufacture, bool StrictManufacture, bool TracksExpiration, bool StrictExpiration, bool TracksSerial, bool StrictSerial,
    int PickingStrategy, int PickingBaseDate, int? InboundShelfLifeToleranceDays, int? OutboundShelfLifeToleranceDays, List<UpdateProductPackagingCommand> Packagings) : IRequest<IResult>;

public record ListProductsQuery(Guid? CustomerId, string? Search, int Page = 1, int PageSize = 20) : IRequest<IResult>;

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
        RuleFor(x => x.PickingBaseDate).Must(x => Enum.IsDefined(typeof(PickingBaseDate), x)).WithMessage("Data Base inválida.");

        // Travas WMS de Negócio
        RuleFor(x => x).Must(x => x.PickingStrategy != (int)PickingStrategy.Fefo || x.TracksExpiration).WithMessage("A estratégia FEFO exige que o controle de validade esteja ativo.");
        RuleFor(x => x.Packagings).NotEmpty().WithMessage("O produto deve possuir pelo menos uma embalagem vinculada.");
        RuleFor(x => x.Packagings).Must(p => p != null && p.Count(x => x.IsDefaultInbound) == 1).WithMessage("Deve existir exatamente UMA embalagem padrão de recebimento.");
        RuleFor(x => x.Packagings).Must(p => p != null && p.Count(x => x.IsDefaultOutbound) == 1).WithMessage("Deve existir exatamente UMA embalagem padrão de expedição.");
    }
}

public class ListProductsQueryValidator : AbstractValidator<ListProductsQuery>
{
    public ListProductsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100).WithMessage("O tamanho da página deve ser entre 1 e 100.");
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
        RuleFor(x => x.PickingBaseDate).Must(x => Enum.IsDefined(typeof(PickingBaseDate), x)).WithMessage("Data Base inválida.");
        RuleFor(x => x).Must(x => x.PickingStrategy != (int)PickingStrategy.Fefo || x.TracksExpiration).WithMessage("A estratégia FEFO exige que o controle de validade esteja ativo.");
        RuleFor(x => x.Packagings).NotEmpty().WithMessage("O produto deve possuir pelo menos uma embalagem vinculada.");
        RuleFor(x => x.Packagings).Must(p => p != null && p.Count(x => x.IsDefaultInbound) == 1).WithMessage("Deve existir exatamente UMA embalagem padrão de recebimento.");
        RuleFor(x => x.Packagings).Must(p => p != null && p.Count(x => x.IsDefaultOutbound) == 1).WithMessage("Deve existir exatamente UMA embalagem padrão de expedição.");
    }
}

// ==========================================
// 3. HANDLERS
// ==========================================
public class CreateProductHandler : IRequestHandler<CreateProductCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateProductHandler(ApplicationDbContext db, ITenantProvider tenant) { _db = db; _tenant = tenant; }

    public async Task<IResult> Handle(CreateProductCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (!await _db.Customers.AnyAsync(c => c.Id == request.CustomerId && c.CompanyId == companyId, ct))
            return Results.BadRequest(new { Message = "Depositante inválido ou não pertence a esta empresa." });

        if (await _db.Products.AnyAsync(p => p.CompanyId == companyId && p.CustomerId == request.CustomerId && p.Sku == request.Sku, ct))
            return Results.BadRequest(new { Message = "Este SKU já está cadastrado para este Depositante." });

        if (!string.IsNullOrWhiteSpace(request.BaseBarcode) &&
            await _db.Products.AnyAsync(p => p.CompanyId == companyId && p.CustomerId == request.CustomerId && p.BaseBarcode == request.BaseBarcode, ct))
            return Results.BadRequest(new { Message = "Este Código de Barras Base (GTIN) já está em uso por outro produto deste Depositante." });

        // Validação Proativa do Código de Barras da Embalagem (Global para a CompanyId)
        foreach (var packReq in request.Packagings)
        {
            if (!string.IsNullOrWhiteSpace(packReq.Barcode) &&
                await _db.ProductPackagings.AnyAsync(pp => pp.Product.CompanyId == companyId && pp.Barcode == packReq.Barcode, ct))
            {
                return Results.BadRequest(new { Message = $"O código de barras de embalagem {packReq.Barcode} já está em uso no sistema." });
            }
        }

        var product = new Product(companyId, request.CustomerId, request.Sku, request.Description, request.BaseUnit);
        product.UpdateFiscal(request.Ncm, request.Cest, request.Origin, request.BaseBarcode);
        product.UpdateRules(
            request.TracksBatch, request.StrictBatch, request.TracksManufacture, request.StrictManufacture, request.TracksExpiration, request.StrictExpiration, request.TracksSerial, request.StrictSerial,
            (PickingStrategy)request.PickingStrategy, (PickingBaseDate)request.PickingBaseDate, request.MaxStacking, request.InboundShelfLifeToleranceDays, request.OutboundShelfLifeToleranceDays);

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
    private readonly ITenantProvider _tenant;

    public UpdateProductHandler(ApplicationDbContext db, ITenantProvider tenant) { _db = db; _tenant = tenant; }

    public async Task<IResult> Handle(UpdateProductCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var product = await _db.Products
            .Include(p => p.Packagings)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);

        if (product == null) return Results.NotFound(new { Message = "Produto não encontrado." });

        if (!string.IsNullOrWhiteSpace(request.BaseBarcode) &&
            await _db.Products.AnyAsync(p => p.CompanyId == companyId && p.CustomerId == product.CustomerId && p.BaseBarcode == request.BaseBarcode && p.Id != request.Id, ct))
            return Results.BadRequest(new { Message = "Este Código de Barras Base (GTIN) já está em uso por outro produto deste Depositante." });

        // Validação Proativa do Código de Barras da Embalagem
        foreach (var packReq in request.Packagings)
        {
            if (!string.IsNullOrWhiteSpace(packReq.Barcode) &&
                await _db.ProductPackagings.AnyAsync(pp => pp.Product.CompanyId == companyId && pp.Barcode == packReq.Barcode && pp.Id != packReq.Id, ct))
            {
                return Results.BadRequest(new { Message = $"O código de barras de embalagem {packReq.Barcode} já está em uso no sistema." });
            }
        }

        product.UpdateBasicInfo(request.Description, request.BaseUnit);
        product.UpdateFiscal(request.Ncm, request.Cest, request.Origin, request.BaseBarcode);
        product.UpdateRules(
            request.TracksBatch, request.StrictBatch, request.TracksManufacture, request.StrictManufacture, request.TracksExpiration, request.StrictExpiration, request.TracksSerial, request.StrictSerial,
            (PickingStrategy)request.PickingStrategy, (PickingBaseDate)request.PickingBaseDate, request.MaxStacking, request.InboundShelfLifeToleranceDays, request.OutboundShelfLifeToleranceDays);

        var requestPackIds = request.Packagings.Where(x => x.Id.HasValue).Select(x => x.Id!.Value).ToList();
        var packsToRemove = product.Packagings.Where(p => !requestPackIds.Contains(p.Id)).ToList();

        if (packsToRemove.Any())
        {
            foreach (var pack in packsToRemove)
            {
                product.Packagings.Remove(pack);
                _db.ProductPackagings.Remove(pack);
            }
        }

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
    private readonly ITenantProvider _tenant;

    public ListProductsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListProductsQuery request, CancellationToken ct)
    {
        // Extração limpa do Tenant
        var companyId = _tenant.GetCompanyId();

        // Query Base com AsNoTracking e Includes otimizados
        var query = _db.Products
            .AsNoTracking()
            .Include(p => p.Customer)
            .Include(p => p.Packagings)
                .ThenInclude(pp => pp.PackagingType)
            .Where(p => p.CompanyId == companyId);

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(p => allowedIds.Contains(p.CustomerId));
        }

        // Filtros
        if (request.CustomerId.HasValue)
            query = query.Where(p => p.CustomerId == request.CustomerId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = $"%{request.Search.Trim()}%"; // <-- Ajustado para o ILike
            query = query.Where(p => EF.Functions.ILike(p.Sku, s) ||
                                     EF.Functions.ILike(p.Description, s) ||
                                     (p.BaseBarcode != null && EF.Functions.ILike(p.BaseBarcode, s)));
        }

        // Execução Paralela: Count e Paginação
        var totalTask = query.CountAsync(ct);

        var itemsTask = query
            .OrderBy(p => p.Sku) // Ordenação explícita essencial para paginação
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        // Projeção na memória (Mapster/DTO)
        var dtos = itemsTask.Result.Select(p => new ProductDto(
            p.Id, p.CustomerId, p.Customer.CorporateName, p.Sku, p.Description, p.BaseUnit, p.BaseBarcode, p.Ncm, p.Cest, p.Origin, p.MaxStacking,
            p.TracksBatch, p.StrictBatch, p.TracksManufacture, p.StrictManufacture, p.TracksExpiration, p.StrictExpiration, p.TracksSerial, p.StrictSerial,
            (int)p.PickingStrategy, (int)p.PickingBaseDate, p.InboundShelfLifeToleranceDays, p.OutboundShelfLifeToleranceDays, p.IsActive,
            p.Packagings.Select(pp => new ProductPackagingDto(
                pp.Id, pp.PackagingTypeId, pp.PackagingType.Code, pp.ConversionFactor, pp.IsDefaultInbound, pp.IsDefaultOutbound,
                pp.AllowFractionalPicking, pp.GrossWeight, pp.NetWeight, pp.LengthMm, pp.WidthMm, pp.HeightMm, pp.CubageM3, pp.Barcode
            )).ToList()
        )).ToList();

        var response = new PaginatedResult<ProductDto>(dtos, totalTask.Result, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public class DeleteProductHandler : IRequestHandler<DeleteProductCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteProductHandler(ApplicationDbContext db, ITenantProvider tenant) { _db = db; _tenant = tenant; }

    public async Task<IResult> Handle(DeleteProductCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);
        if (product == null) return Results.NotFound();

        try
        {
            _db.Products.Remove(product);
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