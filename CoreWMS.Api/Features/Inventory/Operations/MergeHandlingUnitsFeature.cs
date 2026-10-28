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

public record MergeHandlingUnitsCommand(
    Guid SourceHandlingUnitId,
    Guid DestinationHandlingUnitId,
    decimal Quantity
) : IRequest<IResult>;

public class MergeHandlingUnitsCommandValidator : AbstractValidator<MergeHandlingUnitsCommand>
{
    public MergeHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.SourceHandlingUnitId).NotEmpty().WithMessage("Informe a HU de origem.");
        RuleFor(x => x.DestinationHandlingUnitId).NotEmpty().WithMessage("Informe a HU de destino.");
        RuleFor(x => x.Quantity).GreaterThan(0).WithMessage("A quantidade a ser agrupada deve ser maior que zero.");
    }
}

public class MergeHandlingUnitsHandler : IRequestHandler<MergeHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public MergeHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(MergeHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (request.SourceHandlingUnitId == request.DestinationHandlingUnitId)
            return Results.BadRequest(new { Message = "A HU de origem não pode ser igual à HU de destino." });

        var sourceHu = await _db.HandlingUnits
            .Include(h => h.Product)
            .FirstOrDefaultAsync(h => h.Id == request.SourceHandlingUnitId && h.CompanyId == companyId, ct);

        var destHu = await _db.HandlingUnits
            .Include(h => h.Product)
            .FirstOrDefaultAsync(h => h.Id == request.DestinationHandlingUnitId && h.CompanyId == companyId, ct);

        if (sourceHu == null || destHu == null)
            return Results.NotFound(new { Message = "Uma ou ambas as HUs não foram encontradas." });

        if (_tenant.IsPartnerUser())
        {
            var allowed = _tenant.GetAllowedCustomerIds();
            if (!allowed.Contains(sourceHu.CustomerId) || !allowed.Contains(destHu.CustomerId))
                return Results.Forbid();
        }

        // 1. Não podem estar consumidas ou expedidas
        if (sourceHu.Status == HuStatus.Consumed || sourceHu.Status == HuStatus.Shipped)
            return Results.BadRequest(new { Message = $"A HU de origem {sourceHu.Lpn} está {sourceHu.Status} e não pode ser agrupada." });

        if (destHu.Status == HuStatus.Consumed || destHu.Status == HuStatus.Shipped)
            return Results.BadRequest(new { Message = $"A HU de destino {destHu.Lpn} está {destHu.Status} e não pode receber saldo." });

        // 2. Trava de Número de Série
        if (!string.IsNullOrWhiteSpace(sourceHu.SerialNumber) || !string.IsNullOrWhiteSpace(destHu.SerialNumber))
            return Results.BadRequest(new { Message = "HUs com controle de Número de Série não podem ser agrupadas." });

        // 3. Trava de Mesma Nota Fiscal (ReceiptDocumentId)
        if (sourceHu.ReceiptDocumentId != destHu.ReceiptDocumentId)
            return Results.BadRequest(new { Message = "As HUs devem pertencer à mesma Nota Fiscal / Ordem de Entrada para serem agrupadas." });

        // 4. Trava de Mesmo Produto
        if (sourceHu.ProductId != destHu.ProductId)
            return Results.BadRequest(new { Message = "As HUs devem pertencer ao mesmo Produto (SKU)." });

        // 5. Trava de Lote, Validade e Fabricação
        var sourceBatch = sourceHu.Batch?.Trim().ToUpper() ?? string.Empty;
        var destBatch = destHu.Batch?.Trim().ToUpper() ?? string.Empty;
        if (sourceBatch != destBatch)
            return Results.BadRequest(new { Message = $"Conflito de Lotes: Origem ({sourceBatch}) e Destino ({destBatch}) são diferentes." });

        if (sourceHu.ManufactureDate?.Date != destHu.ManufactureDate?.Date)
            return Results.BadRequest(new { Message = "As HUs possuem datas de fabricação diferentes." });

        if (sourceHu.ExpirationDate?.Date != destHu.ExpirationDate?.Date)
            return Results.BadRequest(new { Message = "As HUs possuem datas de validade diferentes." });

        // 6. Trava de Qualidade
        if (sourceHu.QualityStatus != destHu.QualityStatus)
            return Results.BadRequest(new { Message = "As HUs possuem status de qualidade divergentes." });

        // 7. Validação de Saldo
        if (request.Quantity > sourceHu.CurrentQuantity)
            return Results.BadRequest(new { Message = $"Saldo insuficiente na HU de origem {sourceHu.Lpn}. Disponível: {sourceHu.CurrentQuantity}." });

        // Execução do Agrupamento
        bool wasFullyConsumed = (request.Quantity == sourceHu.CurrentQuantity);

        sourceHu.Consume(request.Quantity);
        destHu.AddQuantity(request.Quantity);

        // Registro Kardex
        await _kardex.WriteAsync(new InventoryTransaction(
            companyId, sourceHu.CustomerId, sourceHu.ProductId, sourceHu.Id, sourceHu.CurrentLocationId,
            TransactionType.Internal_Move, -request.Quantity, sourceHu.CurrentQuantity,
            sourceHu.ReceiptDocumentId, $"AGRUPAMENTO: Transferido para HU {destHu.Lpn}"
        ), ct);

        await _kardex.WriteAsync(new InventoryTransaction(
            companyId, destHu.CustomerId, destHu.ProductId, destHu.Id, destHu.CurrentLocationId,
            TransactionType.Internal_Move, request.Quantity, destHu.CurrentQuantity,
            destHu.ReceiptDocumentId, $"AGRUPAMENTO: Recebido da HU {sourceHu.Lpn}"
        ), ct);

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = wasFullyConsumed
                ? $"Saldo total transferido com sucesso! A HU de origem {sourceHu.Lpn} foi consumida/finalizada."
                : $"Saldo de {request.Quantity} agrupado com sucesso na HU {destHu.Lpn}!",
            SourceLpn = sourceHu.Lpn,
            SourceRemaining = sourceHu.CurrentQuantity,
            SourceStatus = sourceHu.Status.ToString(),
            DestinationLpn = destHu.Lpn,
            DestinationQuantity = destHu.CurrentQuantity
        });
    }
}

public static class MergeHandlingUnitsEndpoints
{
    public static void MapMergeHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/handling-units/merge", async (MergeHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}