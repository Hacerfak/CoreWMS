using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record RollbackInventoryBalanceByHandlingUnitsCommand(List<Guid> HandlingUnitIds) : IRequest<IResult>;

public class RollbackInventoryBalanceByHandlingUnitsCommandValidator : AbstractValidator<RollbackInventoryBalanceByHandlingUnitsCommand>
{
    public RollbackInventoryBalanceByHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Informe ao menos uma HU para estorno de saldo.");
    }
}

public class RollbackInventoryBalanceByHandlingUnitsHandler : IRequestHandler<RollbackInventoryBalanceByHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public RollbackInventoryBalanceByHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(RollbackInventoryBalanceByHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Busca os dados de saldo e qualidade das HUs no inventário
        var hus = await _db.HandlingUnits
            .AsNoTracking()
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id))
            .Select(h => new { h.ProductId, h.CustomerId, h.CurrentQuantity, h.Status, h.QualityStatus })
            .ToListAsync(ct);

        if (!hus.Any())
            return Results.Ok(new { Message = "Nenhuma HU encontrada para estorno de saldo." });

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();
        var customerIds = hus.Select(h => h.CustomerId).Distinct().ToList();

        // 2. Localiza os saldos envolvidos
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId) && customerIds.Contains(b.CustomerId))
            .ToListAsync(ct);

        // 3. Executa a recomposição em cada balanço físico
        foreach (var hu in hus)
        {
            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);
            if (balance != null)
            {
                balance.RollbackReceipt(hu.CurrentQuantity, hu.Status, hu.QualityStatus);
            }
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Saldos de inventário estornados com sucesso." });
    }
}

public static class RollbackInventoryBalanceByHandlingUnitsEndpoints
{
    public static void MapRollbackInventoryBalanceByHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/balances/rollback-by-hus", async (RollbackInventoryBalanceByHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}