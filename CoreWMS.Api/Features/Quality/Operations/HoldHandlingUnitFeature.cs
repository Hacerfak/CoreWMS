using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Quality.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using CoreWMS.Api.Infrastructure.Storage;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality.Operations;

// 1. DTOs e Command
public record HoldHandlingUnitCommand(Guid HandlingUnitId, Guid ReasonId, string Notes, Guid? QualityLocationId, List<QualityImageDto>? Images) : IRequest<IResult>;

// 2. Validator
public class HoldHandlingUnitCommandValidator : AbstractValidator<HoldHandlingUnitCommand>
{
    public HoldHandlingUnitCommandValidator()
    {
        RuleFor(x => x.HandlingUnitId).NotEmpty();
        RuleFor(x => x.ReasonId).NotEmpty();
        RuleFor(x => x.Notes).NotEmpty().MaximumLength(500);
    }
}

// 3. Handler
public class HoldHandlingUnitHandler : IRequestHandler<HoldHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;
    private readonly ILocalImageStorageService _imageStorage;

    public HoldHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex, ILocalImageStorageService imageStorage)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
        _imageStorage = imageStorage;
    }

    public async Task<IResult> Handle(HoldHandlingUnitCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.HandlingUnitId && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound(new { Message = "HU não encontrada." });

        if (hu.QualityStatus == QualityStatus.Quarantine)
            return Results.BadRequest(new { Message = "HU já está bloqueada." });

        var balance = await _db.InventoryBalances.FirstOrDefaultAsync(b => b.ProductId == hu.ProductId && b.CompanyId == companyId, ct);
        if (balance == null) return Results.BadRequest(new { Message = "Saldo consolidado não encontrado." });

        // 1. Cria o Evento (Prontuário)
        var qualityEvent = new QualityEvent(companyId, hu.Id, hu.CurrentLocationId, request.ReasonId, request.Notes);

        // Processamento e compressão das imagens no disco
        if (request.Images != null && request.Images.Any())
        {
            foreach (var img in request.Images)
            {
                var (filePath, size) = await _imageStorage.CompressAndSaveImageAsync(img.FileName, img.Base64Data, ct);
                qualityEvent.AddImage(img.FileName, filePath, size);
            }
        }

        _db.QualityEvents.Add(qualityEvent);

        // 2. Modifica a Qualidade e os Baldes de Saldo
        hu.ChangeQuality(QualityStatus.Quarantine);
        balance.Quarantine(hu.CurrentQuantity);

        // 3. Move fisicamente para o endereço de Qualidade (Se informado)
        if (request.QualityLocationId.HasValue)
        {
            hu.MoveTo(request.QualityLocationId.Value);
            await _kardex.WriteAsync(new InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, request.QualityLocationId.Value, TransactionType.Internal_Move, 0, hu.CurrentQuantity, null, null), ct);
        }

        // 4. Registra auditoria financeira no Kardex
        await _kardex.WriteAsync(new InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId, TransactionType.Quality_Hold, 0, hu.CurrentQuantity, null, null), ct);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência. A HU ou o Saldo foram alterados simultaneamente." });
        }

        return Results.NoContent();
    }
}

// 4. Endpoint
public static class HoldHandlingUnitEndpoints
{
    public static void MapHoldHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/quality/hold", async (HoldHandlingUnitCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Quality")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}