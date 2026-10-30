using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record SplitHuItemDto(decimal Quantity, Guid? PackagingTypeId);

public record SplitHandlingUnitCommand(
    Guid SourceHandlingUnitId,
    List<SplitHuItemDto> NewHandlingUnits
) : IRequest<IResult>;

public class SplitHandlingUnitCommandValidator : AbstractValidator<SplitHandlingUnitCommand>
{
    public SplitHandlingUnitCommandValidator()
    {
        RuleFor(x => x.SourceHandlingUnitId).NotEmpty().WithMessage("Informe a HU de origem.");
        RuleFor(x => x.NewHandlingUnits).NotEmpty().WithMessage("Defina ao menos uma nova HU de destino para o transbordo.");
        RuleForEach(x => x.NewHandlingUnits).ChildRules(item =>
        {
            item.RuleFor(i => i.Quantity).GreaterThan(0).WithMessage("A quantidade de cada nova HU deve ser maior que zero.");
        });
    }
}

public class SplitHandlingUnitHandler : IRequestHandler<SplitHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public SplitHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant, IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(SplitHandlingUnitCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var sourceHu = await _db.HandlingUnits
            .Include(h => h.Product)
            .FirstOrDefaultAsync(h => h.Id == request.SourceHandlingUnitId && h.CompanyId == companyId, ct);

        if (sourceHu == null)
            return Results.NotFound(new { Message = "HU de origem não encontrada." });

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(sourceHu.CustomerId))
            return Results.Forbid();

        // 1. Validação de status ativo
        if (sourceHu.Status == HuStatus.Consumed || sourceHu.Status == HuStatus.Shipped)
            return Results.BadRequest(new { Message = $"A HU {sourceHu.Lpn} está {sourceHu.Status} e não pode ser transbordada." });

        // 2. Trava de Número de Série
        if (!string.IsNullOrWhiteSpace(sourceHu.SerialNumber))
            return Results.BadRequest(new { Message = "HUs com controle de Número de Série não podem sofrer transbordo." });

        decimal totalToTransfer = request.NewHandlingUnits.Sum(x => x.Quantity);

        // 3. Regra estrita: O transbordo não pode transferir o saldo total da origem
        if (totalToTransfer >= sourceHu.CurrentQuantity)
        {
            return Results.BadRequest(new
            {
                Message = $"Transbordo Recusado: Não é permitido transferir o saldo total ({sourceHu.CurrentQuantity}) da HU de origem. Para transferir todo o saldo utilize o Agrupamento."
            });
        }

        // Subtrai quantidade da origem
        sourceHu.Consume(totalToTransfer);

        var createdHus = new List<HandlingUnit>();
        var kardexMovements = new List<RecordKardexMovementItemDto>();

        foreach (var item in request.NewHandlingUnits)
        {
            // Gera o LPN seguindo o padrão Base36 de 10 caracteres
            string newLpn = GenerateShortLpn();

            var packagingId = item.PackagingTypeId.HasValue && item.PackagingTypeId.Value != Guid.Empty
                ? item.PackagingTypeId.Value
                : sourceHu.PackagingTypeId;

            var newHu = new HandlingUnit(
                newLpn,
                companyId,
                sourceHu.CustomerId,
                sourceHu.ProductId,
                packagingId,
                sourceHu.ReceiptDocumentId,
                sourceHu.Batch,
                sourceHu.ManufactureDate,
                sourceHu.ExpirationDate,
                null,
                item.Quantity,
                sourceHu.UnitValue,
                sourceHu.UnitNetWeight,
                sourceHu.UnitGrossWeight
            );

            // Herda status físico real e endereço da HU mãe
            newHu.InheritPhysicalState(sourceHu.Status, sourceHu.CurrentLocationId);

            if (sourceHu.QualityStatus != QualityStatus.Available)
                newHu.ChangeQuality(sourceHu.QualityStatus);

            _db.HandlingUnits.Add(newHu);
            createdHus.Add(newHu);

            // Prepara movimento de entrada da nova HU no Kardex
            kardexMovements.Add(new RecordKardexMovementItemDto(
                CustomerId: newHu.CustomerId,
                ProductId: newHu.ProductId,
                HandlingUnitId: newHu.Id,
                LocationId: newHu.CurrentLocationId,
                Type: TransactionType.Hu_Split,
                QuantityChange: item.Quantity,
                BalanceAfter: item.Quantity,
                SourceDocumentId: newHu.ReceiptDocumentId,
                SourceDocumentNumber: $"Gerado a partir da HU {sourceHu.Lpn}",
                CompanyId: companyId
            ));
        }

        // Prepara movimento de saída da HU de origem no Kardex
        kardexMovements.Add(new RecordKardexMovementItemDto(
            CustomerId: sourceHu.CustomerId,
            ProductId: sourceHu.ProductId,
            HandlingUnitId: sourceHu.Id,
            LocationId: sourceHu.CurrentLocationId,
            Type: TransactionType.Hu_Split,
            QuantityChange: -totalToTransfer,
            BalanceAfter: sourceHu.CurrentQuantity,
            SourceDocumentId: sourceHu.ReceiptDocumentId,
            SourceDocumentNumber: $"{createdHus.Count} nova(s) HU(s) gerada(s)",
            CompanyId: companyId
        ));

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao transbordar a HU. Atualize a tela e tente novamente." });
        }

        // DELEGAÇÃO VIA MEDIATR: Gravação desacoplada e em lote no Kardex
        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        return Results.Ok(new
        {
            Message = $"Transbordo concluído com sucesso! {createdHus.Count} nova(s) HU(s) gerada(s).",
            SourceLpn = sourceHu.Lpn,
            SourceRemaining = sourceHu.CurrentQuantity,
            CreatedHus = createdHus.Select(h => new { h.Id, h.Lpn, Quantity = h.CurrentQuantity })
        });
    }

    private static string GenerateShortLpn()
    {
        var ticks = (DateTime.UtcNow.Ticks - 638000000000000000L) % 2176782336L;
        var randomVal = Random.Shared.Next(0, 1679616);
        return $"{ConvertToBase36(ticks, 6)}{ConvertToBase36(randomVal, 4)}".ToUpper();
    }

    private static string ConvertToBase36(long number, int minLength)
    {
        const string chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var result = new StringBuilder();
        while (number > 0)
        {
            result.Insert(0, chars[(int)(number % 36)]);
            number /= 36;
        }
        return result.ToString().PadLeft(minLength, '0');
    }
}

public static class SplitHandlingUnitEndpoints
{
    public static void MapSplitHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/handling-units/split", async ([FromBody] SplitHandlingUnitCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}