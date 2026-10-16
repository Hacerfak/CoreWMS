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
    /// Recálculo manual ou de fechamento completo do ciclo dia a dia.
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
            var calculatedList = await ExecuteDailyServicesPerInboundOrderAsync(cycle, activeTariffs, currentDate);
            processedCount += calculatedList.Count;
        }

        await _db.SaveChangesAsync(ct);
        return processedCount;
    }

    /// <summary>
    /// Apura as diárias de estoque agrupadas por NF-e de entrada (ReceiptDocumentId),
    /// vinculando o DocumentId e DocumentNumber para rastreabilidade 3PL.
    /// </summary>
    public async Task<List<BillingItem>> ExecuteDailyServicesPerInboundOrderAsync(
        BillingCycle cycle,
        List<CustomerTariff> tariffs,
        DateTime referenceDate)
    {
        var refDateUtc = DateTime.SpecifyKind(referenceDate.Date, DateTimeKind.Utc);
        var refDateFimUtc = DateTime.SpecifyKind(referenceDate.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);

        var processedItems = new List<BillingItem>();

        foreach (var tariff in tariffs)
        {
            if (string.IsNullOrWhiteSpace(tariff.BillingService.SqlTemplate)) continue;

            var parameters = new
            {
                ArmazemId = cycle.CompanyId,
                DepositanteId = cycle.CustomerId,
                ServicoValor = tariff.UnitValue,
                DataReferencia = refDateUtc,
                CobrancaDataIni = refDateUtc,
                CobrancaDataFim = refDateFimUtc
            };

            var connection = _db.Database.GetDbConnection();
            var transaction = _db.Database.CurrentTransaction?.GetDbTransaction();

            var safeQuery = tariff.BillingService.SqlTemplate
                .Replace("'{armazem_id}'", "@ArmazemId").Replace("{armazem_id}", "@ArmazemId")
                .Replace("'{depositante_id}'", "@DepositanteId").Replace("{depositante_id}", "@DepositanteId")
                .Replace("'{servico_valor}'", "@ServicoValor").Replace("{servico_valor}", "@ServicoValor")
                .Replace("'{data_referencia}'", "@DataReferencia").Replace("{data_referencia}", "@DataReferencia")
                .Replace("'{cobranca_data_ini}'", "@CobrancaDataIni").Replace("{cobranca_data_ini}", "@CobrancaDataIni")
                .Replace("'{cobranca_data_fim}'", "@CobrancaDataFim").Replace("{cobranca_data_fim}", "@CobrancaDataFim");

            var resultRows = await connection.QueryAsync<dynamic>(safeQuery, parameters, transaction);

            // Agrupa os resultados do SQL por Nota Fiscal de Entrada
            var groupedByOrder = new Dictionary<string, (Guid? OrderId, string DocNum, decimal TotalQty, decimal TotalAmount, List<IDictionary<string, object>> ExtractList)>();

            foreach (var row in resultRows)
            {
                var dict = new Dictionary<string, object>((IDictionary<string, object>)row, StringComparer.OrdinalIgnoreCase);

                string docNum = dict.TryGetValue("NF_ENTRADA", out var nfeObj) && nfeObj != null ? nfeObj.ToString()! : "Estoque Consolidado";
                Guid? orderId = dict.TryGetValue("ORDEM_ID", out var ordObj) && ordObj is Guid g ? g : (dict.TryGetValue("RECEIPTDOCUMENTID", out var rObj) && rObj is Guid rg ? rg : null);

                decimal qty = 0;
                if (dict.TryGetValue("VOLUME", out var qtyObj) && qtyObj is not DBNull and not null)
                    qty = Convert.ToDecimal(qtyObj, System.Globalization.CultureInfo.InvariantCulture);

                decimal amount = 0;
                if (dict.TryGetValue("VALOR_TOTAL", out var valObj) && valObj is not DBNull and not null)
                    amount = Convert.ToDecimal(valObj, System.Globalization.CultureInfo.InvariantCulture);
                else if (dict.TryGetValue("VALOR_DIARIA", out var vObj) && vObj is not DBNull and not null)
                    amount = Convert.ToDecimal(vObj, System.Globalization.CultureInfo.InvariantCulture);

                if (!groupedByOrder.ContainsKey(docNum))
                {
                    groupedByOrder[docNum] = (orderId, docNum, 0, 0, new List<IDictionary<string, object>>());
                }

                var current = groupedByOrder[docNum];
                current.TotalQty += qty;
                current.TotalAmount += amount;
                current.ExtractList.Add((IDictionary<string, object>)row);
                if (!current.OrderId.HasValue && orderId.HasValue) current.OrderId = orderId;
                groupedByOrder[docNum] = current;
            }

            // Para cada NF-e encontrada no estoque deste dia, atualiza ou insere o BillingItem vinculado
            foreach (var entry in groupedByOrder.Values)
            {
                if (entry.TotalQty <= 0 && entry.TotalAmount <= 0) continue;

                var jsonOptions = new JsonSerializerOptions { WriteIndented = false };
                var extractJson = JsonSerializer.Serialize(entry.ExtractList, jsonOptions);

                var existingItem = cycle.Items.FirstOrDefault(i =>
                    i.BillingServiceId == tariff.BillingServiceId &&
                    i.ChargeDate.Date == refDateUtc.Date &&
                    i.DocumentNumber == entry.DocNum);

                if (existingItem != null)
                {
                    existingItem.UpdateValues(
                        entry.TotalQty,
                        entry.TotalAmount,
                        extractJson,
                        $"Atualizado em {DateTime.UtcNow:dd/MM/yyyy HH:mm} (Total Cumulativo do Dia)"
                    );
                    processedItems.Add(existingItem);
                }
                else
                {
                    var newItem = new BillingItem(
                        billingCycleId: cycle.Id,
                        billingServiceId: tariff.BillingServiceId,
                        chargeDate: refDateUtc,
                        documentType: "NF-e Entrada",
                        documentNumber: entry.DocNum,
                        documentId: entry.OrderId,
                        description: $"{tariff.BillingService.Name} (NF #{entry.DocNum})",
                        quantityTotal: entry.TotalQty,
                        serviceTotal: entry.TotalAmount,
                        statementDataJson: extractJson,
                        manualNotes: $"Apuração de diária vinculada à NF-e #{entry.DocNum}"
                    );
                    _db.BillingItems.Add(newItem);
                    processedItems.Add(newItem);
                }
            }
        }

        return processedItems;
    }

    /// <summary>
    /// Chamado pelo Background Worker ou pós-checkout para atualizar as diárias do dia.
    /// </summary>
    public async Task<List<BillingItem>> UpsertDailyChargesAsync(
        Guid companyId,
        Guid customerId,
        DateTime referenceDate,
        CancellationToken ct = default)
    {
        var dateOnly = referenceDate.ToUniversalTime().Date;
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

        var processedItems = await ExecuteDailyServicesPerInboundOrderAsync(cycle, activeTariffs, dateOnly);

        await _db.SaveChangesAsync(ct);
        return processedItems;
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
            billingCycleId: cycle.Id,
            billingServiceId: service.Id,
            chargeDate: DateTime.UtcNow,
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

            if (dict.TryGetValue("VALOR_TOTAL", out var vTotalObj) && vTotalObj is not DBNull and not null)
                totalAmount += Convert.ToDecimal(vTotalObj, System.Globalization.CultureInfo.InvariantCulture);
            else if (dict.TryGetValue("VALOR_DIARIA", out var valObj) && valObj is not DBNull and not null)
                totalAmount += Convert.ToDecimal(valObj, System.Globalization.CultureInfo.InvariantCulture);
        }

        var jsonOptions = new JsonSerializerOptions { WriteIndented = false };
        var extractJson = JsonSerializer.Serialize(extractList, jsonOptions);

        return (totalQty, totalAmount, extractJson);
    }
}