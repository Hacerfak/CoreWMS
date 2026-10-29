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
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Operations;

public record InboundBillingServiceItemDto(
    Guid BillingServiceId,
    List<Guid> HandlingUnitIds
);

public record BillInboundReceiptCommand(
    Guid InboundOrderId,
    Guid CustomerId,
    string DocumentNumber,
    Guid? OrderItemId,
    List<InboundBillingServiceItemDto> ServiceGroups
) : IRequest<IResult>;

public class BillInboundReceiptHandler : IRequestHandler<BillInboundReceiptCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly BillingEngineService _billingEngine;

    public BillInboundReceiptHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        BillingEngineService billingEngine)
    {
        _db = db;
        _tenant = tenant;
        _billingEngine = billingEngine;
    }

    public async Task<IResult> Handle(BillInboundReceiptCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var currentMonth = DateTime.UtcNow.ToString("MM/yyyy");

        var activeCycle = await _db.BillingCycles
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                      c.CustomerId == request.CustomerId &&
                                      c.ReferenceMonth == currentMonth &&
                                      c.Status == BillingStatus.Draft, ct);

        if (activeCycle == null)
        {
            activeCycle = new BillingCycle(companyId, request.CustomerId, DateTime.UtcNow);
            _db.BillingCycles.Add(activeCycle);
            await _db.SaveChangesAsync(ct);
        }

        var tariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId &&
                        t.CustomerId == request.CustomerId &&
                        t.BillingService.IsActive)
            .ToListAsync(ct);

        foreach (var group in request.ServiceGroups)
        {
            var tariff = tariffs.FirstOrDefault(t => t.BillingServiceId == group.BillingServiceId);
            if (tariff == null || string.IsNullOrWhiteSpace(tariff.BillingService.SqlTemplate)) continue;

            var calculatedItem = await _billingEngine.ExecuteOperationalEventAsync(
                activeCycle,
                tariff.BillingService,
                tariff,
                orderId: request.InboundOrderId,
                documentType: "NF-e Entrada",
                documentNumber: request.DocumentNumber,
                orderItemId: request.OrderItemId,
                handlingUnitIds: group.HandlingUnitIds
            );

            if (calculatedItem != null && (calculatedItem.QuantityTotal > 0 || calculatedItem.ServiceTotal > 0))
            {
                // Injeta os IDs das HUs no JSON para rastreabilidade de estornos futuros
                var jsonWithHus = AttachHuIdsToStatementJson(calculatedItem.StatementDataJson, group.HandlingUnitIds);

                var existingItem = activeCycle.Items.FirstOrDefault(i =>
                    i.BillingServiceId == tariff.BillingServiceId &&
                    i.DocumentId == request.InboundOrderId &&
                    i.DocumentType == "NF-e Entrada");

                if (existingItem != null)
                {
                    var newQuantity = existingItem.QuantityTotal + calculatedItem.QuantityTotal;
                    var newTotal = existingItem.ServiceTotal + calculatedItem.ServiceTotal;
                    var mergedJson = MergeStatementJson(existingItem.StatementDataJson, jsonWithHus);

                    existingItem.UpdateValues(
                        newQuantity,
                        newTotal,
                        mergedJson,
                        $"Atualizado em {DateTime.UtcNow:dd/MM/yyyy HH:mm} (Recebimento NF-e #{request.DocumentNumber} - Total: {newQuantity} vol)"
                    );
                }
                else
                {
                    var newItem = new BillingItem(
                        billingCycleId: activeCycle.Id,
                        billingServiceId: tariff.BillingServiceId,
                        chargeDate: calculatedItem.ChargeDate,
                        documentType: calculatedItem.DocumentType,
                        documentNumber: calculatedItem.DocumentNumber,
                        documentId: calculatedItem.DocumentId,
                        description: calculatedItem.Description,
                        quantityTotal: calculatedItem.QuantityTotal,
                        serviceTotal: calculatedItem.ServiceTotal,
                        statementDataJson: jsonWithHus,
                        manualNotes: calculatedItem.ManualNotes
                    );
                    _db.BillingItems.Add(newItem);
                }
            }
        }

        await _db.SaveChangesAsync(ct);

        // Apuração imediata das diárias de estoque do dia
        await _billingEngine.UpsertDailyChargesAsync(
            companyId,
            request.CustomerId,
            DateTime.UtcNow,
            ct
        );

        return Results.Ok(new { Message = "Tarifação de recebimento e diárias apuradas com sucesso." });
    }

    private static string AttachHuIdsToStatementJson(string? statementJson, List<Guid> huIds)
    {
        if (string.IsNullOrWhiteSpace(statementJson)) return "[]";
        try
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var rows = JsonSerializer.Deserialize<List<StatementRowDto>>(statementJson, options) ?? new List<StatementRowDto>();
            var huStrings = huIds.Select(id => id.ToString()).ToList();

            foreach (var r in rows)
            {
                r.HU_IDS ??= new List<string>();
                r.HU_IDS.AddRange(huStrings);
                r.HU_IDS = r.HU_IDS.Distinct().ToList();
            }

            return JsonSerializer.Serialize(rows);
        }
        catch
        {
            return statementJson;
        }
    }

    private static string MergeStatementJson(string? existingJson, string? newJson)
    {
        var allRows = new List<StatementRowDto>();
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        void ParseJson(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
            try
            {
                var rows = JsonSerializer.Deserialize<List<StatementRowDto>>(json, options);
                if (rows != null) allRows.AddRange(rows);
            }
            catch { }
        }

        ParseJson(existingJson);
        ParseJson(newJson);

        if (!allRows.Any()) return newJson ?? "[]";

        var consolidated = new Dictionary<string, StatementRowDto>();

        foreach (var r in allRows)
        {
            var sku = r.SKU?.Trim().ToUpper() ?? "";
            var tipo = (r.TIPO_VOLUME ?? "VOL").Trim().ToUpper();
            var desc = r.DESCRICAO?.Trim() ?? "";
            var unitVal = r.VALOR_UNITARIO ?? 0m;
            var vol = r.VOLUME ?? 1m;
            var tot = r.VALOR_TOTAL ?? (vol * unitVal);

            var key = $"{sku}|{tipo}|{unitVal}|{desc}";

            if (consolidated.TryGetValue(key, out var existing))
            {
                existing.VOLUME = (existing.VOLUME ?? 0m) + vol;
                existing.VALOR_TOTAL = (existing.VALOR_TOTAL ?? 0m) + tot;
                existing.HU_IDS ??= new List<string>();
                if (r.HU_IDS != null) existing.HU_IDS.AddRange(r.HU_IDS);
                existing.HU_IDS = existing.HU_IDS.Distinct().ToList();
            }
            else
            {
                consolidated[key] = new StatementRowDto
                {
                    SKU = string.IsNullOrWhiteSpace(sku) ? null : sku,
                    TIPO_VOLUME = tipo,
                    DESCRICAO = string.IsNullOrWhiteSpace(desc) ? null : desc,
                    VOLUME = vol,
                    VALOR_UNITARIO = unitVal,
                    VALOR_TOTAL = tot,
                    HU_IDS = r.HU_IDS?.Distinct().ToList() ?? new List<string>()
                };
            }
        }

        return JsonSerializer.Serialize(consolidated.Values.ToList());
    }

    public class StatementRowDto
    {
        public string? SKU { get; set; }
        public string? TIPO_VOLUME { get; set; }
        public string? DESCRICAO { get; set; }
        public decimal? VOLUME { get; set; }
        public decimal? VALOR_UNITARIO { get; set; }
        public decimal? VALOR_TOTAL { get; set; }
        public List<string>? HU_IDS { get; set; }
    }
}

public static class BillInboundReceiptEndpoints
{
    public static void MapBillInboundReceiptEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/inbound/bill-receipt", async ([FromBody] BillInboundReceiptCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}