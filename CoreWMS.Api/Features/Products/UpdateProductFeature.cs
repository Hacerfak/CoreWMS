using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

public record UpdateProductPackagingCommand(Guid? Id, Guid PackagingTypeId, decimal ConversionFactor, bool IsDefaultInbound, bool IsDefaultOutbound, bool AllowFractionalPicking, decimal GrossWeight, decimal NetWeight, decimal LengthMm, decimal WidthMm, decimal HeightMm, string? Barcode);

public record UpdateProductCommand(
    Guid Id, string Description, string BaseUnit, string? BaseBarcode, string? Ncm, string? Cest, int Origin, int MaxStacking,
    bool TracksBatch, bool StrictBatch, bool TracksManufacture, bool StrictManufacture, bool TracksExpiration, bool StrictExpiration, bool TracksSerial, bool StrictSerial,
    int PickingStrategy, int PickingBaseDate, int? InboundShelfLifeToleranceDays, int? OutboundShelfLifeToleranceDays, List<UpdateProductPackagingCommand> Packagings) : IRequest<IResult>;

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

public class UpdateProductHandler : IRequestHandler<UpdateProductCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdateProductHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

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

public static class UpdateProductEndpoints
{
    public static void MapUpdateProductEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/products/{id:guid}", async (Guid id, UpdateProductCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Products")
           .RequireAuthorization()
           .RequirePermission(Permissions.Products.Edit);
    }
}