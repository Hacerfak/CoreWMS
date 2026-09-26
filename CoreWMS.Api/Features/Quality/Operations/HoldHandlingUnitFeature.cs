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

public record HoldHandlingUnitCommand(
    List<Guid> HandlingUnitIds,
    QualityStatus NewStatus,
    Guid ReasonId,
    string Notes,
    Guid? QualityLocationId,
    List<QualityImageDto>? Images
) : IRequest<IResult>;

public class HoldHandlingUnitCommandValidator : AbstractValidator<HoldHandlingUnitCommand>
{
    public HoldHandlingUnitCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Selecione ao menos uma Unidade de Manuseio (HU).");
        RuleFor(x => x.NewStatus).IsInEnum().WithMessage("Status de qualidade inválido.");
        RuleFor(x => x.ReasonId).NotEmpty().WithMessage("Informe o motivo da ocorrência.");
        RuleFor(x => x.Notes).NotEmpty().MaximumLength(500).WithMessage("Informe as observações do bloqueio.");
    }
}

public class HoldHandlingUnitHandler : IRequestHandler<HoldHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;
    private readonly ILocalImageStorageService _imageStorage;

    public HoldHandlingUnitHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        KardexChannel kardex,
        ILocalImageStorageService imageStorage)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
        _imageStorage = imageStorage;
    }

    public async Task<IResult> Handle(HoldHandlingUnitCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.HandlingUnits
            .Include(h => h.CurrentLocation)
            .Where(h => request.HandlingUnitIds.Contains(h.Id) && h.CompanyId == companyId);

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(h => allowedCustomerIds.Contains(h.CustomerId));
        }

        var hus = await query.ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio (HU) encontrada." });

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId))
            .ToListAsync(ct);

        // 1. Processa e comprima as fotos no disco UMA ÚNICA VEZ para o lote
        var processedImages = new List<(string FileName, string FilePath, long FileSize)>();
        if (request.Images != null && request.Images.Any())
        {
            foreach (var img in request.Images)
            {
                if (!string.IsNullOrWhiteSpace(img.Base64Data))
                {
                    var (filePath, size) = await _imageStorage.CompressAndSaveImageAsync(img.FileName, img.Base64Data, ct);
                    processedImages.Add((img.FileName, filePath, size));
                }
            }
        }

        int updatedCount = 0;

        foreach (var hu in hus)
        {
            if (hu.QualityStatus == request.NewStatus) continue;

            var oldQualityStatus = hu.QualityStatus;
            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);

            // 2. Cria o Prontuário de Qualidade (QualityEvent) para cada HU reaproveitando os arquivos
            var qualityEvent = new QualityEvent(companyId, hu.Id, hu.CurrentLocationId, request.ReasonId, request.Notes);

            foreach (var (fileName, filePath, size) in processedImages)
            {
                qualityEvent.AddImage(fileName, filePath, size);
            }
            _db.QualityEvents.Add(qualityEvent);

            // 3. Atualiza o status de qualidade na HU e no Balanço
            hu.ChangeQuality(request.NewStatus);

            if (hu.Status != HuStatus.Received && balance != null)
            {
                balance.ChangeQualityForStored(hu.CurrentQuantity, oldQualityStatus, request.NewStatus);
            }

            // 4. Move fisicamente para a posição de qualidade se especificada
            if (request.QualityLocationId.HasValue && request.QualityLocationId.Value != hu.CurrentLocationId)
            {
                hu.MoveTo(request.QualityLocationId.Value);

                await _kardex.WriteAsync(new InventoryTransaction(
                    companyId, hu.CustomerId, hu.ProductId, hu.Id,
                    request.QualityLocationId.Value, TransactionType.Internal_Move,
                    0, hu.CurrentQuantity, hu.ReceiptDocumentId,
                    $"TRANSPORTE DE AVARIA/QUARENTENA PARA POSIÇÃO {request.QualityLocationId}"), ct);
            }

            // 5. Registra auditoria no Kardex
            await _kardex.WriteAsync(new InventoryTransaction(
                companyId, hu.CustomerId, hu.ProductId, hu.Id,
                hu.CurrentLocationId, TransactionType.Quality_Hold,
                0, hu.CurrentQuantity, hu.ReceiptDocumentId,
                $"REGISTRO DE BLOQUEIO ({oldQualityStatus} -> {request.NewStatus}): {request.Notes}"), ct);

            updatedCount++;
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao registrar a avaria/bloqueio. Tente novamente." });
        }

        return Results.Ok(new { Message = $"{updatedCount} HU(s) atualizada(s) para o status '{request.NewStatus}'." });
    }
}

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