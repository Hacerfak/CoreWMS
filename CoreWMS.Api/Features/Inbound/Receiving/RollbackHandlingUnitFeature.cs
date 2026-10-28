using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Operations;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Features.Quality.Operations;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Receiving;

public record RollbackHandlingUnitsCommand(List<Guid> HandlingUnitIds, string? Reason) : IRequest<IResult>;

public class RollbackHandlingUnitsCommandValidator : AbstractValidator<RollbackHandlingUnitsCommand>
{
    public RollbackHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Selecione ao menos uma HU para realizar o estorno.");
    }
}

public class RollbackHandlingUnitsHandler : IRequestHandler<RollbackHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;

    public RollbackHandlingUnitsHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(RollbackHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var hus = await _db.HandlingUnits
            .Include(h => h.Product)
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id))
            .ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio (HU) encontrada." });

        // 1. Validação de saída: Bloqueia apenas se a HU já estiver em trânsito de expedição/embarcada
        var invalidStatusHus = hus.Where(h =>
            h.Status == HuStatus.Shipped ||
            h.Status == HuStatus.Staged ||
            h.Status == HuStatus.Picking
        ).ToList();

        if (invalidStatusHus.Any())
        {
            var lpns = string.Join(", ", invalidStatusHus.Select(h => h.Lpn));
            return Results.BadRequest(new
            {
                Message = $"As seguintes HUs não podem ser estornadas pois já estão em processo de saída/expedição: {lpns}."
            });
        }

        // 2. Trava contra HUs já alocadas para ordens de saída
        var huIds = hus.Select(h => h.Id).ToList();
        var allocatedHuIds = await _db.OutboundAllocations
            .Where(a => huIds.Contains(a.HandlingUnitId))
            .Select(a => a.HandlingUnitId)
            .Distinct()
            .ToListAsync(ct);

        if (allocatedHuIds.Any())
        {
            var allocatedLpns = string.Join(", ", hus.Where(h => allocatedHuIds.Contains(h.Id)).Select(h => h.Lpn));
            return Results.BadRequest(new
            {
                Message = $"As seguintes HUs possuem alocação ativa em pedidos de saída/retorno e não podem ser estornadas: {allocatedLpns}."
            });
        }

        // 3. Recomposição da NF-e / Ordem de Entrada
        var orderIds = hus.Where(h => h.ReceiptDocumentId.HasValue).Select(h => h.ReceiptDocumentId!.Value).Distinct().ToList();
        var inboundOrders = await _db.InboundOrders
            .Include(o => o.Items)
            .Where(o => orderIds.Contains(o.Id))
            .ToListAsync(ct);

        foreach (var hu in hus)
        {
            if (hu.ReceiptDocumentId.HasValue)
            {
                var order = inboundOrders.FirstOrDefault(o => o.Id == hu.ReceiptDocumentId.Value);
                if (order != null)
                {
                    var item = order.Items.FirstOrDefault(i => i.ProductId == hu.ProductId);
                    if (item != null)
                    {
                        item.AddReceivedQuantity(-hu.CurrentQuantity);
                        if (item.Status == InboundOrderItemStatus.Completed)
                        {
                            item.UpdateStatus(InboundOrderItemStatus.Ready_To_Receive);
                        }
                    }
                    if (order.Status == InboundOrderStatus.Completed)
                    {
                        order.UpdateStatus(InboundOrderStatus.Receiving);
                    }
                }
            }
        }

        // 4. DELEGAÇÃO MODULAR VIA MEDIATR:
        // A) Módulo Inventory: Recomposição das gavetas de saldo físico e quarentena
        await _mediator.Send(new RollbackInventoryBalanceByHandlingUnitsCommand(huIds), ct);

        // B) Módulo Inventory: Registro contábil de saída no Kardex e desvinculação de FKs
        await _mediator.Send(new RollbackKardexByHandlingUnitsCommand(huIds, request.Reason), ct);

        // C) Módulo Quality: Expurgo de prontuários de avaria e fotos físicas
        await _mediator.Send(new DeleteQualityEventsByHandlingUnitsCommand(huIds), ct);

        // 5. Exclusão física das HUs no banco (com todas as dependências desvinculadas)
        _db.HandlingUnits.RemoveRange(hus);
        await _db.SaveChangesAsync(ct);

        // D) Módulo Billing: Expurgo ou recálculo do Handling In e recalibração das diárias de armazenagem
        var customerIds = hus.Select(h => h.CustomerId).Distinct().ToList();
        await _mediator.Send(new RollbackInboundBillingByHandlingUnitsCommand(orderIds, customerIds), ct);

        return Results.Ok(new { Message = $"{hus.Count} HU(s) estornada(s) com sucesso." });
    }
}

public static class RollbackHandlingUnitEndpoints
{
    public static void MapRollbackHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/receive/hus/rollback", async ([FromBody] RollbackHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Receive);
    }
}