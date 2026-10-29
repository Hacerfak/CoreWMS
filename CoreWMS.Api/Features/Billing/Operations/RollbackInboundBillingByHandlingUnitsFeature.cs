using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Operations;

public record RolledBackHuDto(
    Guid HuId,
    Guid ReceiptDocumentId,
    Guid CustomerId,
    string PackagingCode
);

public record RollbackInboundBillingByHandlingUnitsCommand(
    List<Guid> InboundOrderIds,
    List<Guid> CustomerIds,
    List<RolledBackHuDto>? RolledBackHus = null
) : IRequest<IResult>;

public class RollbackInboundBillingByHandlingUnitsHandler : IRequestHandler<RollbackInboundBillingByHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly BillingEngineService _billingEngine;

    public RollbackInboundBillingByHandlingUnitsHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        BillingEngineService billingEngine)
    {
        _db = db;
        _tenant = tenant;
        _billingEngine = billingEngine;
    }

    public async Task<IResult> Handle(RollbackInboundBillingByHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var inboundOrders = await _db.InboundOrders
            .AsNoTracking()
            .Where(o => o.CompanyId == companyId && request.InboundOrderIds.Contains(o.Id))
            .ToListAsync(ct);

        if (!inboundOrders.Any())
            return Results.Ok(new { Message = "Nenhuma ordem de entrada localizada para ajuste de faturamento." });

        var rolledBackHuList = request.RolledBackHus ?? new List<RolledBackHuDto>();
        var rolledBackHuIdStrings = rolledBackHuList.Select(h => h.HuId.ToString().ToLower()).ToHashSet();

        foreach (var order in inboundOrders)
        {
            var hasRemainingHus = await _db.HandlingUnits
                .AnyAsync(h => h.ReceiptDocumentId == order.Id && h.CompanyId == companyId, ct);

            // Carrega itens operacionais de recebimento em ciclos abertos
            var billingItems = await _db.BillingItems
                .Where(b => (b.DocumentId == order.Id ||
                             (!string.IsNullOrWhiteSpace(order.InvoiceNumber) && b.DocumentNumber == order.InvoiceNumber) ||
                             b.Description.Contains(order.AccessKey))
                         && b.DocumentType == "NF-e Entrada"
                         && _db.BillingCycles.Any(c => c.Id == b.BillingCycleId && c.Status == BillingStatus.Draft))
                .ToListAsync(ct);

            if (!hasRemainingHus)
            {
                // Estorno Total da NF: Exclui as cobranças operacionais de recebimento
                if (billingItems.Any())
                {
                    _db.BillingItems.RemoveRange(billingItems);
                }
            }
            else if (billingItems.Any() && rolledBackHuList.Any())
            {
                // Estorno Parcial: Deduz individualmente os volumes e valores das HUs estornadas
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var husToProcess = rolledBackHuList.Where(h => h.ReceiptDocumentId == order.Id).ToList();

                foreach (var item in billingItems)
                {
                    if (string.IsNullOrWhiteSpace(item.StatementDataJson)) continue;

                    try
                    {
                        var rows = JsonSerializer.Deserialize<List<BillInboundReceiptHandler.StatementRowDto>>(item.StatementDataJson, options);
                        if (rows == null || !rows.Any()) continue;

                        bool itemModified = false;

                        foreach (var row in rows)
                        {
                            var rowHuIds = row.HU_IDS ?? new List<string>();
                            var matchingRemoved = rowHuIds.Where(id => rolledBackHuIdStrings.Contains(id.ToLower())).ToList();

                            if (matchingRemoved.Any())
                            {
                                // Abate baseado nos IDs nominais gravados no JSON
                                int countToRemove = matchingRemoved.Count;
                                row.HU_IDS = rowHuIds.Except(matchingRemoved).ToList();
                                row.VOLUME = Math.Max(0, (row.VOLUME ?? 0) - countToRemove);
                                row.VALOR_TOTAL = Math.Max(0, (row.VOLUME ?? 0) * (row.VALOR_UNITARIO ?? 0));
                                itemModified = true;
                            }
                            else
                            {
                                // Fallback por tipo de embalagem caso a HU não possua HU_IDS gravado
                                var matchingHusByPack = husToProcess.Where(h =>
                                    h.PackagingCode.Equals(row.TIPO_VOLUME, StringComparison.OrdinalIgnoreCase)).ToList();

                                if (matchingHusByPack.Any())
                                {
                                    int countToRemove = Math.Min((int)(row.VOLUME ?? 0), matchingHusByPack.Count);
                                    if (countToRemove > 0)
                                    {
                                        row.VOLUME = Math.Max(0, (row.VOLUME ?? 0) - countToRemove);
                                        row.VALOR_TOTAL = Math.Max(0, (row.VOLUME ?? 0) * (row.VALOR_UNITARIO ?? 0));
                                        itemModified = true;
                                        foreach (var m in matchingHusByPack.Take(countToRemove)) husToProcess.Remove(m);
                                    }
                                }
                            }
                        }

                        if (itemModified)
                        {
                            var activeRows = rows.Where(r => (r.VOLUME ?? 0) > 0).ToList();
                            var newQuantity = activeRows.Sum(r => r.VOLUME ?? 0);
                            var newTotal = activeRows.Sum(r => r.VALOR_TOTAL ?? 0);

                            if (newQuantity <= 0 || newTotal <= 0)
                            {
                                _db.BillingItems.Remove(item);
                            }
                            else
                            {
                                item.UpdateValues(
                                    newQuantity,
                                    newTotal,
                                    JsonSerializer.Serialize(activeRows),
                                    $"Ajustado após estorno de HUs em {DateTime.UtcNow:dd/MM/yyyy HH:mm}"
                                );
                            }
                        }
                    }
                    catch { }
                }
            }
        }

        await _db.SaveChangesAsync(ct);

        // Recalibra as diárias de armazenagem e ad-valorem de forma síncrona
        foreach (var custId in request.CustomerIds.Distinct())
        {
            await _billingEngine.UpsertDailyChargesAsync(
                companyId,
                custId,
                DateTime.UtcNow,
                ct
            );
        }

        return Results.Ok(new { Message = "Estorno financeiro processado e diárias recalculadas com sucesso." });
    }
}

public static class RollbackInboundBillingByHandlingUnitsEndpoints
{
    public static void MapRollbackInboundBillingByHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/inbound/rollback-by-hus", async (RollbackInboundBillingByHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}