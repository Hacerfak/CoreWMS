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
    /// Executa o cálculo consolidado para o ciclo completo (utilizado pelo GenerateBillingCycleFeature).
    /// </summary>
    public async Task<BillingItem> ExecuteServiceAsync(
        BillingCycle cycle,
        BillingService service,
        CustomerTariff tariff)
    {
        if (string.IsNullOrWhiteSpace(service.SqlTemplate))
            throw new InvalidOperationException("Este serviço não possui query SQL configurada.");

        var dataIniUtc = DateTime.SpecifyKind(cycle.StartDate.Date, DateTimeKind.Utc);
        var dataFimUtc = DateTime.SpecifyKind(cycle.EndDate.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);

        var parameters = new
        {
            ArmazemId = cycle.CompanyId,
            DepositanteId = cycle.CustomerId,
            ServicoValor = tariff.UnitValue,
            DataReferencia = DateTime.SpecifyKind(DateTime.UtcNow.Date, DateTimeKind.Utc),
            CobrancaDataIni = dataIniUtc,
            CobrancaDataFim = dataFimUtc
        };

        var (totalQty, totalAmount, extractJson) = await RunDynamicQueryAsync(service.SqlTemplate, parameters);

        return new BillingItem(
            cycle.Id,
            service.Id,
            service.Name,
            totalQty,
            totalAmount,
            extractJson,
            null
        );
    }

    /// <summary>
    /// Executa um serviço operacional disparado por evento (Recebimento, Expedição Momento 1, Filme Stretch).
    /// </summary>
    public async Task<BillingItem?> ExecuteOperationalEventAsync(
        BillingCycle cycle,
        BillingService service,
        CustomerTariff tariff,
        Guid orderId,
        Guid? orderItemId = null,
        string? descriptionPrefix = null)
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

        var desc = !string.IsNullOrWhiteSpace(descriptionPrefix)
            ? $"{service.Name} ({descriptionPrefix})"
            : service.Name;

        return new BillingItem(
            cycle.Id,
            service.Id,
            desc,
            totalQty,
            totalAmount,
            extractJson,
            null
        );
    }

    /// <summary>
    /// Executa a apuração de um serviço automático diário para uma data específica.
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
            $"{service.Name} - {referenceDate:dd/MM/yyyy}",
            totalQty,
            totalAmount,
            extractJson,
            $"Apuração diária automática ({referenceDate:dd/MM/yyyy})"
        );
    }

    /// <summary>
    /// Calcula ou recalcula imediatamente as diárias de armazenagem e ad-valorem para a data especificada.
    /// Mantém apenas um único registo por data, sobrescrevendo os valores atuais do mesmo dia.
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
                        t.BillingService.Type == BillingServiceType.Automatic_SQL &&
                        !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate) &&
                        t.ValidFrom <= dateOnly &&
                        (t.ValidTo == null || t.ValidTo >= dateOnly))
            .ToListAsync(ct);

        var processedItems = new List<BillingItem>();

        foreach (var tariff in activeTariffs)
        {
            var calculatedItem = await ExecuteDailyServiceAsync(cycle, tariff.BillingService, tariff, dateOnly);
            if (calculatedItem == null) continue;

            var targetDescription = $"{tariff.BillingService.Name} - {dateStr}";

            var existingItem = cycle.Items.FirstOrDefault(i =>
                i.BillingServiceId == tariff.BillingServiceId &&
                (i.Description == targetDescription || i.Description.EndsWith(dateStr)));

            if (existingItem != null)
            {
                existingItem.UpdateValues(
                    calculatedItem.QuantityTotal,
                    calculatedItem.ServiceTotal,
                    calculatedItem.StatementDataJson,
                    $"Atualizado em {DateTime.UtcNow:dd/MM/yyyy HH:mm} (Recebimento / Atualização Diária)"
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