using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record RollbackKardexByHandlingUnitsCommand(List<Guid> HandlingUnitIds, string? Reason = null) : IRequest<IResult>;

public class RollbackKardexByHandlingUnitsCommandValidator : AbstractValidator<RollbackKardexByHandlingUnitsCommand>
{
    public RollbackKardexByHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Informe ao menos uma HU para estorno no Kardex.");
    }
}

public class RollbackKardexByHandlingUnitsHandler : IRequestHandler<RollbackKardexByHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public RollbackKardexByHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(RollbackKardexByHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var hus = await _db.HandlingUnits
            .AsNoTracking()
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id))
            .ToListAsync(ct);

        if (!hus.Any())
            return Results.Ok(new { Message = "Nenhuma HU encontrada para processamento no Kardex." });

        // 1. Grava no Kardex a saída contábil de estorno de cada volume
        foreach (var hu in hus)
        {
            await _kardex.WriteAsync(new InventoryTransaction(
                companyId,
                hu.CustomerId,
                hu.ProductId,
                null, // HandlingUnitId nulo para desvincular do registro que será expurgado
                hu.CurrentLocationId,
                TransactionType.Inventory_Adjustment_Out,
                -hu.CurrentQuantity,
                0,
                hu.ReceiptDocumentId,
                $"ESTORNO HU {hu.Lpn} (Qualidade: {hu.QualityStatus}) - {request.Reason ?? "Estorno de Recebimento"}"
            ), ct);
        }

        // 2. Desvincula o HandlingUnitId de transações passadas do Kardex para evitar erro de Foreign Key
        await _db.InventoryTransactions
            .Where(t => t.CompanyId == companyId && t.HandlingUnitId.HasValue && request.HandlingUnitIds.Contains(t.HandlingUnitId.Value))
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.HandlingUnitId, (Guid?)null), ct);

        return Results.Ok(new { Message = "Kardex atualizado e desvinculado com sucesso." });
    }
}

public static class RollbackKardexByHandlingUnitsEndpoints
{
    public static void MapRollbackKardexByHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/kardex/rollback-by-hus", async (RollbackKardexByHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}