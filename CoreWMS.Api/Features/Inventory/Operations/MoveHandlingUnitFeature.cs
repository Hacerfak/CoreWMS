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

        var destination = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .FirstOrDefaultAsync(l => l.Id == request.DestinationLocationId, ct);

        if (destination == null || !destination.IsActive)
            return Results.BadRequest(new { Message = "Endereço de destino inválido ou inativo." });

        var query = _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id));

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(h => allowedCustomerIds.Contains(h.CustomerId));
        }

        var hus = await query.ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio encontrada." });

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId))
            .ToListAsync(ct);

        foreach (var hu in hus)
        {
            var oldStatus = hu.Status;
            hu.MoveTo(destination.Id);

            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);

            // Transição de Putaway: Sai da Doca (Received) para o Armazém/Qualidade (Stored)
            if (oldStatus == HuStatus.Received && balance != null)
            {
                var role = destination.StorageType?.Role ?? StorageRole.Storage;
                balance.AllocateFromDock(hu.CurrentQuantity, role, hu.QualityStatus);
            }

            string actionDescription = destination.StorageType?.Role == StorageRole.Storage
                ? $"ALOCAÇÃO PARA ARMAZENAMENTO {destination.FullPath}"
                : destination.StorageType?.Role == StorageRole.Quality
                ? $"ALOCAÇÃO PARA QUALIDADE/QUARENTENA {destination.FullPath}"
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