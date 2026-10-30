using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using Dapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;

namespace CoreWMS.Api.Infrastructure.Services.Billing;

public class BillingEngineService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<BillingEngineService> _logger;
    private static readonly TimeZoneInfo OperationalTimeZone = GetOperationalTimeZone();

    private static TimeZoneInfo GetOperationalTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time");
            }
            catch
            {
                return TimeZoneInfo.Local;
            }
        }
    }

    /// <summary>
    /// Obtém o dia civil corrente em Brasília com hora 00:00:00 e Kind=Utc.
    /// </summary>
    public static DateTime GetOperationalToday()
    {
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, OperationalTimeZone);
        return new DateTime(localNow.Year, localNow.Month, localNow.Day, 0, 0, 0, DateTimeKind.Utc);
    }

    /// <summary>
    /// Normaliza uma data para o dia civil correspondente (00:00:00, Kind=Utc).
    /// Se a data já for uma data pura (meia-noite), NÃO converte fuso de novo para não voltar 1 dia!
    /// </summary>
    public static DateTime ToOperationalDate(DateTime dateTime)
    {
        if (dateTime.TimeOfDay == TimeSpan.Zero)
        {
            return DateTime.SpecifyKind(dateTime.Date, DateTimeKind.Utc);
        }

        var utcInstant = dateTime.Kind == DateTimeKind.Utc ? dateTime : dateTime.ToUniversalTime();
        var localTime = TimeZoneInfo.ConvertTimeFromUtc(utcInstant, OperationalTimeZone);
        return new DateTime(localTime.Year, localTime.Month, localTime.Day, 0, 0, 0, DateTimeKind.Utc);
    }

    /// <summary>
    /// Converte um dia civil de Brasília (00:00:00 a 23:59:59 local) nos limites UTC exatos para o PostgreSQL.
    /// Exemplo para o dia 29/10/2026 em Brasília (UTC-3):
    /// StartUtc: 2026-10-29 03:00:00 UTC
    /// EndUtc:   2026-10-30 02:59:59.999 UTC
    /// </summary>
    public static (DateTime DateKey, DateTime StartUtc, DateTime EndUtc) GetDayUtcBounds(DateTime civilDate)
    {
        var date = ToOperationalDate(civilDate);
        var startLocal = new DateTime(date.Year, date.Month, date.Day, 0, 0, 0, DateTimeKind.Unspecified);
        var endLocal = new DateTime(date.Year, date.Month, date.Day, 23, 59, 59, 999, DateTimeKind.Unspecified);

        var startUtc = TimeZoneInfo.ConvertTimeToUtc(startLocal, OperationalTimeZone);
        var endUtc = TimeZoneInfo.ConvertTimeToUtc(endLocal, OperationalTimeZone);

        return (date, startUtc, endUtc);
    }

    public BillingEngineService(ApplicationDbContext db, ILogger<BillingEngineService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Recálculo retroativo dia a dia de todo o ciclo de faturação.
    /// </summary>
    public async Task<int> RecalculateFullCycleAsync(BillingCycle cycle, CancellationToken ct = default)
    {
        var companyId = cycle.CompanyId;
        var customerId = cycle.CustomerId;

        _logger.LogInformation("================================================================================");
        _logger.LogInformation("[BILLING RECALC] Iniciando recálculo do ciclo {CycleId} ({RefMonth}) para Cliente {CustomerId}",
            cycle.Id, cycle.ReferenceMonth, customerId);

        var activeTariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId &&
                        t.CustomerId == customerId &&
                        t.BillingService.IsActive &&
                        t.BillingService.Type == BillingServiceType.Automatic_Daily &&
                        !string.IsNullOrWhiteSpace(t.BillingService.SqlTemplate))
            .ToListAsync(ct);

        _logger.LogInformation("[BILLING RECALC] Tarifas automáticas diárias configuradas: {Count}", activeTariffs.Count);

        var operationalToday = GetOperationalToday();
        var cycleStartDate = ToOperationalDate(cycle.StartDate);
        var cycleEndDate = ToOperationalDate(cycle.EndDate);
        var maxDate = cycleEndDate < operationalToday ? cycleEndDate : operationalToday;

        _logger.LogInformation("[BILLING RECALC] Janela de Apuração: De {Inicio:dd/MM/yyyy} até {Fim:dd/MM/yyyy} (Hoje operacional: {Hoje:dd/MM/yyyy})",
            cycleStartDate, maxDate, operationalToday);

        int processedCount = 0;

        for (var currentDate = cycleStartDate; currentDate <= maxDate; currentDate = currentDate.AddDays(1))
        {
            var (dateKey, startUtc, endUtc) = GetDayUtcBounds(currentDate);

            var tariffsForDate = activeTariffs.Where(t =>
                t.ValidFrom <= endUtc &&
                (!t.ValidTo.HasValue || t.ValidTo.Value >= startUtc)
            ).ToList();

            if (!tariffsForDate.Any()) continue;

            var calculatedList = await ExecuteDailyServicesPerInboundOrderAsync(cycle, tariffsForDate, dateKey, startUtc, endUtc);
            processedCount += calculatedList.Count;
        }

        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("[BILLING RECALC] Concluído com sucesso! Total de diárias geradas no ciclo: {Total}", processedCount);
        _logger.LogInformation("================================================================================");
        return processedCount;
    }

    /// Apura as diárias de estoque agrupadas por NF-e de entrada vinculando o DocumentId da ordem.
    public async Task<List<BillingItem>> ExecuteDailyServicesPerInboundOrderAsync(
        BillingCycle cycle,
        List<CustomerTariff> tariffs,
        DateTime dateKey,
        DateTime startUtc,
        DateTime endUtc)
    {
        var processedItems = new List<BillingItem>();
        var operationalToday = GetOperationalToday();

        foreach (var tariff in tariffs)
        {
            if (string.IsNullOrWhiteSpace(tariff.BillingService.SqlTemplate)) continue;

            var parameters = new
            {
                ArmazemId = cycle.CompanyId,
                DepositanteId = cycle.CustomerId,
                ServicoValor = tariff.UnitValue,
                DataReferencia = dateKey,
                CobrancaDataIni = startUtc,
                CobrancaDataFim = endUtc
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

            IEnumerable<dynamic> resultRows;
            try
            {
                resultRows = await connection.QueryAsync<dynamic>(safeQuery, parameters, transaction);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[SQL ERRO FATAL] Falha no serviço '{Servico}': {Mensagem}",
                    tariff.BillingService.Name, ex.Message);
                continue;
            }

            var rowsList = resultRows.ToList();
            var groupedByOrder = new Dictionary<string, (Guid? OrderId, string DocNum, decimal TotalQty, decimal TotalAmount, List<IDictionary<string, object>> ExtractList)>();

            foreach (var row in rowsList)
            {
                var dict = new Dictionary<string, object>((IDictionary<string, object>)row, StringComparer.OrdinalIgnoreCase);

                string docNum = dict.TryGetValue("NF_ENTRADA", out var nfeObj) && nfeObj != null ? nfeObj.ToString()! : "Estoque Consolidado";
                Guid? orderId = dict.TryGetValue("ORDEM_ID", out var ordObj) && ordObj is Guid g
                    ? g
                    : (dict.TryGetValue("RECEIPTDOCUMENTID", out var rObj) && rObj is Guid rg ? rg : null);

                decimal qty = 0;
                if (dict.TryGetValue("VOLUME", out var qtyObj) && qtyObj is not DBNull and not null)
                    qty = Convert.ToDecimal(qtyObj, System.Globalization.CultureInfo.InvariantCulture);

                decimal amount = 0;
                if (dict.TryGetValue("VALOR_TOTAL", out var valObj) && valObj is not DBNull and not null)
                    amount = Convert.ToDecimal(valObj, System.Globalization.CultureInfo.InvariantCulture);
                else if (dict.TryGetValue("VALOR_DIARIA", out var vObj) && vObj is not DBNull and not null)
                    amount = Convert.ToDecimal(vObj, System.Globalization.CultureInfo.InvariantCulture);

                // GARANTIA: Se a query não projetou VALOR_UNITARIO, injeta a tarifa unitária contratual
                if (!dict.TryGetValue("VALOR_UNITARIO", out var unitObj) || unitObj is DBNull or null || Convert.ToDecimal(unitObj) == 0)
                {
                    dict["VALOR_UNITARIO"] = tariff.UnitValue;
                }

                if (!groupedByOrder.ContainsKey(docNum))
                {
                    groupedByOrder[docNum] = (orderId, docNum, 0, 0, new List<IDictionary<string, object>>());
                }

                var current = groupedByOrder[docNum];
                current.TotalQty += qty;
                current.TotalAmount += amount;
                current.ExtractList.Add(dict);
                if (!current.OrderId.HasValue && orderId.HasValue) current.OrderId = orderId;
                groupedByOrder[docNum] = current;
            }

            foreach (var entry in groupedByOrder.Values)
            {
                if (entry.TotalQty <= 0 && entry.TotalAmount <= 0) continue;

                var existingItem = cycle.Items.FirstOrDefault(i =>
                    i.BillingServiceId == tariff.BillingServiceId &&
                    i.ChargeDate.Date == dateKey.Date &&
                    i.DocumentNumber == entry.DocNum);

                var isToday = dateKey.Date == operationalToday.Date;

                if (existingItem != null)
                {
                    // REGRA DE OURO: Só permite atualizar o dia corrente!
                    // Dias anteriores fechados são imutáveis e não devem ser contaminados por saídas futuras.
                    if (isToday)
                    {
                        var jsonOptions = new JsonSerializerOptions { WriteIndented = false };
                        var extractJson = JsonSerializer.Serialize(entry.ExtractList, jsonOptions);

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
                        // Dia passado já apurado: preserva intacto
                        processedItems.Add(existingItem);
                    }
                }
                else
                {
                    // Dia passado que estava faltando (ou primeira apuração de hoje): gera o registro
                    var jsonOptions = new JsonSerializerOptions { WriteIndented = false };
                    var extractJson = JsonSerializer.Serialize(entry.ExtractList, jsonOptions);

                    var newItem = new BillingItem(
                        billingCycleId: cycle.Id,
                        billingServiceId: tariff.BillingServiceId,
                        chargeDate: dateKey,
                        documentType: "NF-e Entrada",
                        documentNumber: entry.DocNum,
                        documentId: entry.OrderId,
                        description: $"{tariff.BillingService.Name} (NF #{entry.DocNum})",
                        quantityTotal: entry.TotalQty,
                        serviceTotal: entry.TotalAmount,
                        statementDataJson: extractJson,
                        manualNotes: isToday
                            ? $"Apuração diária"
                            : $"Apuração retroativa gerada em {DateTime.UtcNow:dd/MM/yyyy HH:mm}"
                    );
                    _db.BillingItems.Add(newItem);
                    processedItems.Add(newItem);
                }
            }

            // Remove diárias de notas fiscais que não possuem mais saldo em estoque (ex: estorno total de HUs)
            var staleItems = cycle.Items.Where(i =>
                i.BillingServiceId == tariff.BillingServiceId &&
                i.ChargeDate.Date == dateKey.Date &&
                !string.IsNullOrWhiteSpace(i.DocumentNumber) &&
                !groupedByOrder.ContainsKey(i.DocumentNumber)).ToList();

            if (staleItems.Any())
            {
                _db.BillingItems.RemoveRange(staleItems);
            }
        }

        return processedItems;
    }

    /// <summary>
    /// Ponto de entrada acionado pelo background worker ou após novas entradas físicas.
    /// </summary>
    public async Task<List<BillingItem>> UpsertDailyChargesAsync(
        Guid companyId,
        Guid customerId,
        DateTime referenceDate,
        CancellationToken ct = default)
    {
        var (dateKey, startUtc, endUtc) = GetDayUtcBounds(referenceDate);
        var refMonth = dateKey.ToString("MM/yyyy");

        _logger.LogInformation("[BILLING UPSERT] Executando para Cliente {CustomerId} em {Data:dd/MM/yyyy}",
            customerId, dateKey);

        var cycle = await _db.BillingCycles
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                      c.CustomerId == customerId &&
                                      c.ReferenceMonth == refMonth &&
                                      c.Status == BillingStatus.Draft, ct);

        if (cycle == null)
        {
            cycle = new BillingCycle(companyId, customerId, dateKey);
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
                        t.ValidFrom <= endUtc &&
                        (!t.ValidTo.HasValue || t.ValidTo.Value >= startUtc))
            .ToListAsync(ct);

        var processedItems = await ExecuteDailyServicesPerInboundOrderAsync(cycle, activeTariffs, dateKey, startUtc, endUtc);

        await _db.SaveChangesAsync(ct);
        return processedItems;
    }

    public async Task<BillingItem?> ExecuteOperationalEventAsync(
        BillingCycle cycle,
        BillingService service,
        CustomerTariff tariff,
        Guid orderId,
        string documentType,
        string documentNumber,
        Guid? orderItemId = null,
        List<Guid>? handlingUnitIds = null)
    {
        if (string.IsNullOrWhiteSpace(service.SqlTemplate)) return null;

        var (operationalToday, startUtc, endUtc) = GetDayUtcBounds(DateTime.UtcNow);

        var parameters = new
        {
            ArmazemId = cycle.CompanyId,
            DepositanteId = cycle.CustomerId,
            ServicoValor = tariff.UnitValue,
            OrdemId = orderId,
            OrderItemId = orderItemId ?? Guid.Empty,
            DataReferencia = operationalToday,
            CobrancaDataIni = cycle.StartDate,
            CobrancaDataFim = cycle.EndDate,
            HuIds = handlingUnitIds != null && handlingUnitIds.Any() ? handlingUnitIds.ToArray() : null
        };

        var (totalQty, totalAmount, extractJson) = await RunDynamicQueryAsync(service.SqlTemplate, parameters, handlingUnitIds);

        if (totalQty <= 0 && totalAmount <= 0) return null;

        return new BillingItem(
            billingCycleId: cycle.Id,
            billingServiceId: service.Id,
            chargeDate: operationalToday,
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
        object queryParams,
        List<Guid>? huIds = null)
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

        if (huIds != null && huIds.Any() && !safeQuery.Contains("@HuIds"))
        {
            safeQuery = safeQuery.Replace(
                "WHERE ",
                "WHERE h.\"Id\" = ANY(@HuIds) AND "
            );
        }

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