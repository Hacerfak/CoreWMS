using System.Data;
using System.Text.Json;
using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using Dapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace CoreWMS.Api.Infrastructure.Services.Billing;

public class BillingEngineService
{
    private readonly ApplicationDbContext _db;

    public BillingEngineService(ApplicationDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Recálculo manual ou de fechamento completo do ciclo.
    /// Itera dia a dia desde o StartDate até a data de encerramento, garantindo o acumulado diário correto.
    /// </summary>
    public async Task<int> RecalculateFullCycleAsync(BillingCycle cycle, CancellationToken ct = default)
    {
        var companyId = cycle.CompanyId;
        var customerId = cycle.CustomerId;
        var activeTariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId &&
                        t.CustomerId == customerId &&
                        t.BillingService.IsActive &&
                        t.BillingService.Type == BillingServiceType.Automatic_Daily &&
                        !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate))
            .ToListAsync(ct);

        var todayUtc = DateTime.UtcNow.Date;
        var maxDate = cycle.EndDate < todayUtc ? cycle.EndDate.Date : todayUtc;
        int processedCount = 0;

        for (var currentDate = cycle.StartDate.Date; currentDate <= maxDate; currentDate = currentDate.AddDays(1))
        {
            var dateStr = currentDate.ToString("dd/MM/yyyy");

            foreach (var tariff in activeTariffs.Where(t => t.ValidFrom <= currentDate && (t.ValidTo == null || t.ValidTo >= currentDate)))
            {
                var calculated = await ExecuteDailyServiceAsync(cycle, tariff.BillingService, tariff, currentDate);
                if (calculated == null) continue;

                var existingItem = cycle.Items.FirstOrDefault(i =>
                    i.BillingServiceId == tariff.BillingServiceId &&
                    i.ChargeDate.Date == currentDate.Date &&
                    i.DocumentType == "Diária de Estoque");

                if (existingItem != null)
                {
                    existingItem.UpdateValues(
                        calculated.QuantityTotal,
                        calculated.ServiceTotal,
                        calculated.StatementDataJson,
                        $"Recalculado em {DateTime.UtcNow:dd/MM/yyyy HH:mm}"
                    );
                }
                else
                {
                    _db.BillingItems.Add(calculated);
                }
                processedCount++;
            }
        }

        await _db.SaveChangesAsync(ct);
        return processedCount;
    }

    /// <summary>
    /// Executa apuração da diária de estoque acumulada de todas as HUs presentes até a data especificada.
    /// </summary>
    public async Task<BillingItem?> ExecuteDailyServiceAsync(
        BillingCycle cycle,
        BillingService service,
        CustomerTariff tariff,
        DateTime referenceDate)
    {
        if (string.IsNullOrWhiteSpace(service.SqlTemplate)) return null;

        var refDateUtc = DateTime.SpecifyKind(referenceDate.Date, DateTimeKind.Utc);
        var refDateFimUtc = DateTime.SpecifyKind(referenceDate.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);

        var parameters = new
        {
            ArmazemId = cycle.CompanyId,
            DepositanteId = cycle.CustomerId,
            ServicoValor = tariff.UnitValue,
            DataReferencia = refDateUtc,
            CobrancaDataIni = refDateUtc,
            CobrancaDataFim = refDateFimUtc
        };

        var (totalQty, totalAmount, extractJson) = await RunDynamicQueryAsync(service.SqlTemplate, parameters);

        if (totalQty <= 0 && totalAmount <= 0) return null;

        return new BillingItem(
            cycle.Id,
            service.Id,
            refDateUtc,
            documentType: "Diária de Estoque",
            documentNumber: referenceDate.ToString("dd/MM/yyyy"),
            documentId: null,
            description: $"{service.Name} - {referenceDate:dd/MM/yyyy}",
            quantityTotal: totalQty,
            serviceTotal: totalAmount,
            statementDataJson: extractJson,
            manualNotes: $"Apuração automática cumulativa ({referenceDate:dd/MM/yyyy})"
        );
    }

    /// <summary>
    /// Executa serviço operacional vinculado a documento de origem (Inbound NF-e ou Outbound Pedido).
    /// </summary>
    public async Task<BillingItem?> ExecuteOperationalEventAsync(
        BillingCycle cycle,
        BillingService service,
        CustomerTariff tariff,
        Guid orderId,
        string documentType,
        string documentNumber,
        Guid? orderItemId = null)
    {
        if (string.IsNullOrWhiteSpace(service.SqlTemplate)) return null;

        var parameters = new
        {
            ArmazemId = cycle.CompanyId,
            DepositanteId = cycle.CustomerId,
            ServicoValor = tariff.UnitValue,
            OrdemId = orderId,
            OrderItemId = orderItemId ?? Guid.Empty,
            DataReferencia = DateTime.SpecifyKind(DateTime.UtcNow.Date, DateTimeKind.Utc),
            CobrancaDataIni = cycle.StartDate,
            CobrancaDataFim = cycle.EndDate
        };

        var (totalQty, totalAmount, extractJson) = await RunDynamicQueryAsync(service.SqlTemplate, parameters);

        if (totalQty <= 0 && totalAmount <= 0) return null;

        return new BillingItem(
            cycle.Id,
            service.Id,
            DateTime.UtcNow,
            documentType: documentType,
            documentNumber: documentNumber,
            documentId: orderId,
            description: $"{service.Name} ({documentType} #{documentNumber})",
            quantityTotal: totalQty,
            serviceTotal: totalAmount,
            statementDataJson: extractJson,
            manualNotes: null
        );
    }

    /// <summary>
    /// Chamado pelo Background Worker para atualizar as diárias do dia de forma cumulativa.
    /// </summary>
    public async Task<List<BillingItem>> UpsertDailyChargesAsync(
        Guid companyId,
        Guid customerId,
        DateTime referenceDate,
        CancellationToken ct = default)
    {
        var dateOnly = referenceDate.ToUniversalTime().Date;
        var dateStr = dateOnly.ToString("dd/MM/yyyy");
        var refMonth = dateOnly.ToString("MM/yyyy");

        var cycle = await _db.BillingCycles
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                      c.CustomerId == customerId &&
                                      c.ReferenceMonth == refMonth &&
                                      c.Status == BillingStatus.Draft, ct);

        if (cycle == null)
        {
            cycle = new BillingCycle(companyId, customerId, dateOnly);
            _db.BillingCycles.Add(cycle);
            await _db.SaveChangesAsync(ct);
        }

        var activeTariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId &&
                        t.CustomerId == customerId &&
                        t.BillingService.IsActive &&
                        t.BillingService.Type == BillingServiceType.Automatic_Daily &&
                        !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate) &&
                        t.ValidFrom <= dateOnly &&
                        (t.ValidTo == null || t.ValidTo >= dateOnly))
            .ToListAsync(ct);

        var processedItems = new List<BillingItem>();

        foreach (var tariff in activeTariffs)
        {
            var calculatedItem = await ExecuteDailyServiceAsync(cycle, tariff.BillingService, tariff, dateOnly);
            if (calculatedItem == null) continue;

            var existingItem = cycle.Items.FirstOrDefault(i =>
                i.BillingServiceId == tariff.BillingServiceId &&
                i.ChargeDate.Date == dateOnly &&
                i.DocumentType == "Diária de Estoque");

            if (existingItem != null)
            {
                existingItem.UpdateValues(
                    calculatedItem.QuantityTotal,
                    calculatedItem.ServiceTotal,
                    calculatedItem.StatementDataJson,
                    $"Atualizado em {DateTime.UtcNow:dd/MM/yyyy HH:mm} (Total Cumulativo do Dia)"
                );
                processedItems.Add(existingItem);
            }
            else
            {
                _db.BillingItems.Add(calculatedItem);
                processedItems.Add(calculatedItem);
            }
        }

        await _db.SaveChangesAsync(ct);
        return processedItems;
    }

    private async Task<(decimal TotalQty, decimal TotalAmount, string ExtractJson)> RunDynamicQueryAsync(
        string sqlTemplate,
        object queryParams)
    {
        var safeQuery = sqlTemplate
            .Replace("'{armazem_id}'", "@ArmazemId").Replace("{armazem_id}", "@ArmazemId")
            .Replace("'{depositante_id}'", "@DepositanteId").Replace("{depositante_id}", "@DepositanteId")
            .Replace("'{servico_valor}'", "@ServicoValor").Replace("{servico_valor}", "@ServicoValor")
            .Replace("'{data_referencia}'", "@DataReferencia").Replace("{data_referencia}", "@DataReferencia")
            .Replace("'{cobranca_data_ini}'", "@CobrancaDataIni").Replace("{cobranca_data_ini}", "@CobrancaDataIni")
            .Replace("'{cobranca_data_fim}'", "@CobrancaDataFim").Replace("{cobranca_data_fim}", "@CobrancaDataFim")
            .Replace("'{ordem_id}'", "@OrdemId").Replace("{ordem_id}", "@OrdemId")
            .Replace("'{order_item_id}'", "@OrderItemId").Replace("{order_item_id}", "@OrderItemId");

        var connection = _db.Database.GetDbConnection();
        var transaction = _db.Database.CurrentTransaction?.GetDbTransaction();

        var resultRows = await connection.QueryAsync<dynamic>(safeQuery, queryParams, transaction);

        decimal totalQty = 0;
        decimal totalAmount = 0;
        var extractList = new List<IDictionary<string, object>>();

        foreach (var row in resultRows)
        {
            var rawDict = (IDictionary<string, object>)row;
            extractList.Add(rawDict);

            var dict = new Dictionary<string, object>(rawDict, StringComparer.OrdinalIgnoreCase);

            if (dict.TryGetValue("VOLUME", out var qtyObj) && qtyObj is not DBNull and not null)
                totalQty += Convert.ToDecimal(qtyObj, System.Globalization.CultureInfo.InvariantCulture);
            else if (dict.TryGetValue("QUANTIDADE", out var qtyAltObj) && qtyAltObj is not DBNull and not null)
                totalQty += Convert.ToDecimal(qtyAltObj, System.Globalization.CultureInfo.InvariantCulture);

            if (dict.TryGetValue("VALOR_TOTAL", out var vTotalObj) && vTotalObj is not DBNull and not null)
                totalAmount += Convert.ToDecimal(vTotalObj, System.Globalization.CultureInfo.InvariantCulture);
            else if (dict.TryGetValue("VALOR_DIARIA", out var valObj) && valObj is not DBNull and not null)
                totalAmount += Convert.ToDecimal(valObj, System.Globalization.CultureInfo.InvariantCulture);
            else if (dict.TryGetValue("SERVICE_TOTAL", out var sTotalObj) && sTotalObj is not DBNull and not null)
                totalAmount += Convert.ToDecimal(sTotalObj, System.Globalization.CultureInfo.InvariantCulture);
        }

        var jsonOptions = new JsonSerializerOptions { WriteIndented = false };
        var extractJson = JsonSerializer.Serialize(extractList, jsonOptions);

        return (totalQty, totalAmount, extractJson);
    }
}