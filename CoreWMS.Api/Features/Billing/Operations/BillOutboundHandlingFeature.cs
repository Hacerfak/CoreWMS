using System.Data;
using System.Globalization;
using System.Text.Json;
using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using Dapper;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace CoreWMS.Api.Features.Billing.Operations;

public record BillOutboundHandlingCommand(
    Guid OutboundOrderId,
    string OrderNumber,
    Guid CustomerId,
    Guid? HandlingServiceId,
    bool UsedStretchFilm,
    string TriggerType = "Outbound_Packing"
) : IRequest<IResult>;

public class BillOutboundHandlingHandler : IRequestHandler<BillOutboundHandlingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly BillingEngineService _billingEngine;

    public BillOutboundHandlingHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        BillingEngineService billingEngine)
    {
        _db = db;
        _tenant = tenant;
        _billingEngine = billingEngine;
    }

    public async Task<IResult> Handle(BillOutboundHandlingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var currentMonth = DateTime.UtcNow.ToString("MM/yyyy");

        var cycle = await _db.BillingCycles
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                      c.CustomerId == request.CustomerId &&
                                      c.ReferenceMonth == currentMonth &&
                                      c.Status == BillingStatus.Draft, ct);

        if (cycle == null)
        {
            cycle = new BillingCycle(companyId, request.CustomerId, DateTime.UtcNow);
            _db.BillingCycles.Add(cycle);
            await _db.SaveChangesAsync(ct);
        }

        var customerTariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId &&
                        t.CustomerId == request.CustomerId &&
                        t.BillingService.IsActive &&
                        t.ValidFrom <= DateTime.UtcNow &&
                        (!t.ValidTo.HasValue || t.ValidTo >= DateTime.UtcNow))
            .ToListAsync(ct);

        // 1. Apuração de Separação / Handling Out (Valores fixos da query)
        CustomerTariff? handlingTariff = null;
        if (request.HandlingServiceId.HasValue)
        {
            handlingTariff = customerTariffs.FirstOrDefault(t => t.BillingServiceId == request.HandlingServiceId.Value);
        }

        handlingTariff ??= customerTariffs.FirstOrDefault(t =>
            !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate) &&
            (t.BillingService.Name.Contains("Expedição", StringComparison.OrdinalIgnoreCase) ||
             t.BillingService.Name.Contains("Handling Out", StringComparison.OrdinalIgnoreCase) ||
             t.BillingService.Name.Contains("Saída", StringComparison.OrdinalIgnoreCase) ||
             t.BillingService.Name.Contains("Separação", StringComparison.OrdinalIgnoreCase)));

        if (handlingTariff != null && !string.IsNullOrWhiteSpace(handlingTariff.BillingService.SqlTemplate))
        {
            await ProcessSegmentedOutboundServiceAsync(
                cycle,
                handlingTariff,
                request.OutboundOrderId,
                request.OrderNumber,
                request.TriggerType
            );
        }

        // 2. Apuração de Insumo Stretch Film
        if (request.UsedStretchFilm)
        {
            var stretchTariff = customerTariffs.FirstOrDefault(t =>
                !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate) &&
                (t.BillingService.Name.Contains("Stretch", StringComparison.OrdinalIgnoreCase) ||
                 t.BillingService.Name.Contains("Filme", StringComparison.OrdinalIgnoreCase)));

            if (stretchTariff != null && !string.IsNullOrWhiteSpace(stretchTariff.BillingService.SqlTemplate))
            {
                await ProcessSegmentedOutboundServiceAsync(
                    cycle,
                    stretchTariff,
                    request.OutboundOrderId,
                    request.OrderNumber,
                    "Aplicação Stretch"
                );
            }
        }

        await _db.SaveChangesAsync(ct);

        // Recalibra as diárias de armazenagem em tempo real
        await _billingEngine.UpsertDailyChargesAsync(
            companyId,
            request.CustomerId,
            DateTime.UtcNow,
            ct
        );

        return Results.Ok(new { Message = "Faturamento de expedição segmentado por NF-e de entrada com sucesso." });
    }

    private async Task ProcessSegmentedOutboundServiceAsync(
        BillingCycle cycle,
        CustomerTariff tariff,
        Guid outboundOrderId,
        string orderNumber,
        string triggerLabel)
    {
        var parameters = new
        {
            ArmazemId = cycle.CompanyId,
            DepositanteId = cycle.CustomerId,
            OrdemId = outboundOrderId,
            DataReferencia = BillingEngineService.GetOperationalToday(),
            CobrancaDataIni = cycle.StartDate,
            CobrancaDataFim = cycle.EndDate
        };

        var safeQuery = tariff.BillingService.SqlTemplate!
            .Replace("'{armazem_id}'", "@ArmazemId").Replace("{armazem_id}", "@ArmazemId")
            .Replace("'{depositante_id}'", "@DepositanteId").Replace("{depositante_id}", "@DepositanteId")
            .Replace("'{ordem_id}'", "@OrdemId").Replace("{ordem_id}", "@OrdemId")
            .Replace("'{data_referencia}'", "@DataReferencia").Replace("{data_referencia}", "@DataReferencia")
            .Replace("'{cobranca_data_ini}'", "@CobrancaDataIni").Replace("{cobranca_data_ini}", "@CobrancaDataIni")
            .Replace("'{cobranca_data_fim}'", "@CobrancaDataFim").Replace("{cobranca_data_fim}", "@CobrancaDataFim");

        var connection = _db.Database.GetDbConnection();
        var transaction = _db.Database.CurrentTransaction?.GetDbTransaction();

        var resultRows = await connection.QueryAsync<dynamic>(safeQuery, parameters, transaction);

        // Agrupa por NOTA FISCAL DE ENTRADA de origem
        var groupedByInboundNfe = new Dictionary<string, (Guid? InboundOrderId, string DocNum, decimal TotalQty, decimal TotalAmount, List<IDictionary<string, object>> ExtractList)>();

        foreach (var row in resultRows)
        {
            var rawDict = (IDictionary<string, object>)row;
            var dict = new Dictionary<string, object>(rawDict, StringComparer.OrdinalIgnoreCase);

            string nfeEntrada = dict.TryGetValue("NF_ENTRADA", out var nfeObj) && nfeObj != null && !string.IsNullOrWhiteSpace(nfeObj.ToString())
                ? nfeObj.ToString()!
                : orderNumber;

            Guid? inboundOrderId = dict.TryGetValue("ORDEM_ID", out var ordObj) && ordObj is Guid g ? g : null;

            decimal qty = 0;
            if (dict.TryGetValue("VOLUME", out var qtyObj) && qtyObj is not DBNull and not null)
                qty = Convert.ToDecimal(qtyObj, CultureInfo.InvariantCulture);

            decimal amount = 0;
            if (dict.TryGetValue("VALOR_TOTAL", out var valObj) && valObj is not DBNull and not null)
                amount = Convert.ToDecimal(valObj, CultureInfo.InvariantCulture);

            if (!groupedByInboundNfe.ContainsKey(nfeEntrada))
            {
                groupedByInboundNfe[nfeEntrada] = (inboundOrderId, nfeEntrada, 0, 0, new List<IDictionary<string, object>>());
            }

            var current = groupedByInboundNfe[nfeEntrada];
            current.TotalQty += qty;
            current.TotalAmount += amount;
            current.ExtractList.Add(rawDict);
            if (!current.InboundOrderId.HasValue && inboundOrderId.HasValue) current.InboundOrderId = inboundOrderId;
            groupedByInboundNfe[nfeEntrada] = current;
        }

        var today = BillingEngineService.GetOperationalToday();

        foreach (var entry in groupedByInboundNfe.Values)
        {
            if (entry.TotalQty <= 0 && entry.TotalAmount <= 0) continue;

            var extractJson = JsonSerializer.Serialize(entry.ExtractList);

            var existingItem = cycle.Items.FirstOrDefault(i =>
                i.BillingServiceId == tariff.BillingServiceId &&
                i.DocumentNumber == entry.DocNum &&
                i.Description.Contains(orderNumber));

            if (existingItem != null)
            {
                existingItem.UpdateValues(
                    entry.TotalQty,
                    entry.TotalAmount,
                    extractJson,
                    $"Atualizado em {DateTime.UtcNow:dd/MM/yyyy HH:mm} ({triggerLabel} #{orderNumber})"
                );
            }
            else
            {
                var newItem = new BillingItem(
                    billingCycleId: cycle.Id,
                    billingServiceId: tariff.BillingServiceId,
                    chargeDate: today,
                    documentType: "Ordem de Saída",
                    documentNumber: entry.DocNum, // Rastreabilidade 3PL: grava a NF-e de entrada de origem
                    documentId: outboundOrderId, // Mantém o ID da OS para cancelamento/estorno
                    description: $"{tariff.BillingService.Name} (Ordem de Saída #{orderNumber})",
                    quantityTotal: entry.TotalQty,
                    serviceTotal: entry.TotalAmount,
                    statementDataJson: extractJson,
                    manualNotes: $"Expedição de mercadorias vinculadas à NF-e de Entrada #{entry.DocNum}"
                );
                _db.BillingItems.Add(newItem);
            }
        }
    }
}