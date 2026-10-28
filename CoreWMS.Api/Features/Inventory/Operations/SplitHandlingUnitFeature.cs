using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
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
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
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
    private readonly KardexChannel _kardex;

    public SplitHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
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

        // 1. Status ativo
        if (sourceHu.Status == HuStatus.Consumed || sourceHu.Status == HuStatus.Shipped)
            return Results.BadRequest(new { Message = $"A HU {sourceHu.Lpn} está {sourceHu.Status} e não pode ser transbordada." });

        // 2. Trava de Número de Série
        if (!string.IsNullOrWhiteSpace(sourceHu.SerialNumber))
            return Results.BadRequest(new { Message = "HUs com controle de Número de Série não podem sofrer transbordo." });

        decimal totalToTransfer = request.NewHandlingUnits.Sum(x => x.Quantity);

        // 3. REGRA ESTRITA: O transbordo NÃO pode transferir o saldo total da origem
        if (totalToTransfer >= sourceHu.CurrentQuantity)
        {
            return Results.BadRequest(new
            {
                Message = $"Transbordo Recusado: Não é permitido transferir o saldo total ({sourceHu.CurrentQuantity}) da HU de origem. Para transferir todo o saldo utilize o Agrupamento."
            });
        }

        // Subtrai da origem
        sourceHu.Consume(totalToTransfer);

        var createdHus = new List<HandlingUnit>();

        foreach (var item in request.NewHandlingUnits)
        {
            // Gera o LPN seguindo rigorosamente o padrão do recebimento (Base36 de 10 caracteres)
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
                null, // Sem série
                item.Quantity,
                sourceHu.UnitValue,
                sourceHu.UnitNetWeight,
                sourceHu.UnitGrossWeight
            );

            // Herda status físico real (Stored, Received, etc.) e o endereço da HU mãe
            newHu.InheritPhysicalState(sourceHu.Status, sourceHu.CurrentLocationId);

            if (sourceHu.QualityStatus != QualityStatus.Available)
                newHu.ChangeQuality(sourceHu.QualityStatus);

            _db.HandlingUnits.Add(newHu);
            createdHus.Add(newHu);

            // Kardex da nova HU
            await _kardex.WriteAsync(new InventoryTransaction(
                companyId, newHu.CustomerId, newHu.ProductId, newHu.Id, newHu.CurrentLocationId,
                TransactionType.Internal_Move, item.Quantity, item.Quantity,
                newHu.ReceiptDocumentId, $"TRANSBORDO: Gerado a partir da HU {sourceHu.Lpn}"
            ), ct);
        }

        // Kardex de saída da origem
        await _kardex.WriteAsync(new InventoryTransaction(
            companyId, sourceHu.CustomerId, sourceHu.ProductId, sourceHu.Id, sourceHu.CurrentLocationId,
            TransactionType.Internal_Move, -totalToTransfer, sourceHu.CurrentQuantity,
            sourceHu.ReceiptDocumentId, $"TRANSBORDO: {createdHus.Count} nova(s) HU(s) gerada(s)"
        ), ct);

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Transbordo concluído com sucesso! {createdHus.Count} nova(s) HU(s) gerada(s).",
            SourceLpn = sourceHu.Lpn,
            SourceRemaining = sourceHu.CurrentQuantity,
            CreatedHus = createdHus.Select(h => new { h.Id, h.Lpn, Quantity = h.CurrentQuantity })
        });
    }

    // ALGORITMO OFICIAL DE LPN BASE36 (IDÊNTICO AO RECEIVELOTEFEATURE)
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