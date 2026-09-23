using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record ChangeQualityCommand(List<Guid> HandlingUnitIds, QualityStatus NewStatus, string? Reason) : IRequest<IResult>;

public class ChangeQualityCommandValidator : AbstractValidator<ChangeQualityCommand>
{
    public ChangeQualityCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Selecione ao menos uma Unidade de Manuseio (HU).");
        RuleFor(x => x.NewStatus).IsInEnum().WithMessage("Status de qualidade inválido.");
        RuleFor(x => x.Reason).MaximumLength(250).WithMessage("O motivo deve ter no máximo 250 caracteres.");
    }
}

public class ChangeQualityHandler : IRequestHandler<ChangeQualityCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public ChangeQualityHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(ChangeQualityCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id));

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(h => allowedIds.Contains(h.CustomerId));
        }

        var hus = await query.ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio (HU) válida foi encontrada." });

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId))
            .ToListAsync(ct);

        int updatedCount = 0;

        foreach (var hu in hus)
        {
            if (hu.QualityStatus == request.NewStatus) continue;

            var oldStatus = hu.QualityStatus;
            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);

            if (balance == null) continue;

            // Transição: Disponível -> Bloqueado (Quarentena, Avaria ou Falta Virtual)
            if (oldStatus == QualityStatus.Available && request.NewStatus != QualityStatus.Available)
            {
                balance.Quarantine(hu.CurrentQuantity);

                await _kardex.WriteAsync(new InventoryTransaction(
                    companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId,
                    TransactionType.Quality_Hold, 0, hu.CurrentQuantity,
                    null, $"BLOQUEIO QUALIDADE ({request.NewStatus}): {request.Reason ?? "Sem observação"}"), ct);
            }
            // Transição: Bloqueado -> Liberado (Disponível)
            else if (oldStatus != QualityStatus.Available && request.NewStatus == QualityStatus.Available)
            {
                balance.ReleaseFromQuarantine(hu.CurrentQuantity);

                await _kardex.WriteAsync(new InventoryTransaction(
                    companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId,
                    TransactionType.Quality_Release, 0, hu.CurrentQuantity,
                    null, $"LIBERAÇÃO QUALIDADE: {request.Reason ?? "Sem observação"}"), ct);
            }

            hu.ChangeQuality(request.NewStatus);
            updatedCount++;
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao atualizar a qualidade dos itens. Tente novamente." });
        }

        return Results.Ok(new
        {
            Message = $"{updatedCount} Unidade(s) de Manuseio atualizada(s) para o status '{request.NewStatus}'.",
            UpdatedCount = updatedCount
        });
    }
}

public static class ChangeQualityEndpoints
{
    public static void MapChangeQualityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/handling-units/quality", async (ChangeQualityCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}