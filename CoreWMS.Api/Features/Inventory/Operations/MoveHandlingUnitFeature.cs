using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record MoveHandlingUnitCommand(List<Guid> HandlingUnitIds, Guid DestinationLocationId) : IRequest<IResult>;

public class MoveHandlingUnitCommandValidator : AbstractValidator<MoveHandlingUnitCommand>
{
    public MoveHandlingUnitCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Selecione ao menos uma Unidade de Manuseio (HU).");
        RuleFor(x => x.DestinationLocationId).NotEmpty().WithMessage("Informe o endereço de destino.");
    }
}

public class MoveHandlingUnitHandler : IRequestHandler<MoveHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public MoveHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(MoveHandlingUnitCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Busca o endereço de destino
        var destination = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .FirstOrDefaultAsync(l => l.Id == request.DestinationLocationId, ct);

        if (destination == null || !destination.IsActive)
            return Results.BadRequest(new { Message = "Endereço de destino inválido ou inativo." });

        var destinationRole = destination.StorageType?.Role ?? StorageRole.Storage;

        // 2. Busca as HUs
        var query = _db.HandlingUnits
            .Include(h => h.CurrentLocation)
                .ThenInclude(l => l!.StorageType)
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id));

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(h => allowedCustomerIds.Contains(h.CustomerId));
        }

        var hus = await query.ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio encontrada." });

        // TRAVA ESTRITA DE QUALIDADE: Volumes avariados/retidos só podem ir para Posições do tipo Qualidade
        var qualityRestrictedHus = hus.Where(h => h.QualityStatus != QualityStatus.Available).ToList();
        if (qualityRestrictedHus.Any() && destinationRole != StorageRole.Quality)
        {
            var lpns = string.Join(", ", qualityRestrictedHus.Select(h => h.Lpn));
            return Results.BadRequest(new
            {
                Message = $"Movimentação Bloqueada: As seguintes HUs possuem restrição de qualidade (Avaria/Quarentena) e só podem ser movimentadas para posições do tipo Qualidade: {lpns}."
            });
        }

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId))
            .ToListAsync(ct);

        foreach (var hu in hus)
        {
            var oldStatus = hu.Status;
            var oldQualityStatus = hu.QualityStatus;

            hu.MoveTo(destination.Id);

            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);

            // CASO A: Putaway saindo da Doca (Received -> Stored)
            if (oldStatus == HuStatus.Received && balance != null)
            {
                balance.AllocateFromDock(hu.CurrentQuantity, destinationRole, hu.QualityStatus);
            }
            // CASO B: Item livre sendo movido para uma Posição de Qualidade (Quarentena Automática)
            else if (destinationRole == StorageRole.Quality && hu.QualityStatus == QualityStatus.Available)
            {
                hu.ChangeQuality(QualityStatus.Quarantine);

                if (balance != null)
                {
                    balance.ChangeQualityForStored(hu.CurrentQuantity, QualityStatus.Available, QualityStatus.Quarantine);
                }

                await _kardex.WriteAsync(new InventoryTransaction(
                    companyId, hu.CustomerId, hu.ProductId, hu.Id,
                    destination.Id, TransactionType.Quality_Hold,
                    0, hu.CurrentQuantity, hu.ReceiptDocumentId,
                    $"QUARENTENA AUTOMÁTICA: Movimentado para posição de qualidade {destination.FullPath}"), ct);
            }

            string actionDescription = destinationRole == StorageRole.Quality
                ? $"ALOCAÇÃO / RETENÇÃO NA QUALIDADE {destination.FullPath}"
                : $"MOVIMENTAÇÃO INTERNA PARA {destination.FullPath}";

            await _kardex.WriteAsync(new InventoryTransaction(
                companyId, hu.CustomerId, hu.ProductId, hu.Id,
                destination.Id, TransactionType.Internal_Move,
                0, hu.CurrentQuantity, hu.ReceiptDocumentId, actionDescription), ct);
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao mover as HUs. Tente novamente." });
        }

        return Results.Ok(new { Message = $"{hus.Count} HU(s) movimentada(s)/alocada(s) para {destination.FullPath} com sucesso." });
    }
}

public static class MoveHandlingUnitEndpoints
{
    public static void MapMoveHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/handling-units/move", async (MoveHandlingUnitCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}