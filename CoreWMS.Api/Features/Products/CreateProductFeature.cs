using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

public record CreateProductPackagingCommand(
    Guid PackagingTypeId,
    decimal ConversionFactor,
    bool AllowFractionalPicking,
    decimal GrossWeight,
    decimal NetWeight,
    decimal LengthMm,
    decimal WidthMm,
    decimal HeightMm,
    string? Barcode
);

public record CreateProductCommand(
    Guid CustomerId, string Sku, string Description, string BaseUnit, string? BaseBarcode, string? Ncm, string? Cest, int Origin, int MaxStacking,
    bool TracksBatch, bool StrictBatch, bool TracksManufacture, bool StrictManufacture, bool TracksExpiration, bool StrictExpiration, bool TracksSerial, bool StrictSerial,
    int PickingStrategy, int PickingBaseDate, int? InboundShelfLifeToleranceDays, int? OutboundShelfLifeToleranceDays, List<CreateProductPackagingCommand> Packagings) : IRequest<IResult>;

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
        RuleFor(x => x).Must(x => x.PickingStrategy != (int)PickingStrategy.Fefo || x.TracksExpiration).WithMessage("A estratégia FEFO exige que o controle de validade esteja ativo.");
        RuleFor(x => x.Packagings).NotEmpty().WithMessage("O produto deve possuir pelo menos uma embalagem vinculada.");
    }
}

public class CreateProductHandler : IRequestHandler<CreateProductCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateProductHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

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
            var packaging = new ProductPackaging(product.Id, pack.PackagingTypeId, pack.ConversionFactor, pack.AllowFractionalPicking);
            packaging.UpdateDimensions(pack.GrossWeight, pack.NetWeight, pack.LengthMm, pack.WidthMm, pack.HeightMm, pack.Barcode);
            product.Packagings.Add(packaging);
        }

        _db.Products.Add(product);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/products/{product.Id}", new { product.Id, product.Sku });
    }
}

public static class CreateProductEndpoints
{
    public static void MapCreateProductEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/products", async (CreateProductCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Products")
           .RequireAuthorization()
           .RequirePermission(Permissions.Products.Create);
    }
}