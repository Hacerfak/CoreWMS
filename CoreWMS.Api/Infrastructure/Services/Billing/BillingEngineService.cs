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

    public async Task<BillingItem> ExecuteServiceAsync(
        BillingCycle cycle,
        BillingService service,
        CustomerTariff tariff)
    {
        if (service.Type == BillingServiceType.Manual_Entry || string.IsNullOrWhiteSpace(service.SqlTemplate))
            throw new InvalidOperationException("Este serviço não é de cálculo automático.");

        // 1. Higieniza o template substituindo as tags com ou sem aspas simples
        var safeQuery = service.SqlTemplate
            .Replace("'{armazem_id}'", "@ArmazemId")
            .Replace("{armazem_id}", "@ArmazemId")
            .Replace("'{depositante_id}'", "@DepositanteId")
            .Replace("{depositante_id}", "@DepositanteId")
            .Replace("'{servico_valor}'", "@ServicoValor")
            .Replace("{servico_valor}", "@ServicoValor")
            .Replace("'{cobranca_data_ini}'", "@CobrancaDataIni")
            .Replace("{cobranca_data_ini}", "@CobrancaDataIni")
            .Replace("'{cobranca_data_fim}'", "@CobrancaDataFim")
            .Replace("{cobranca_data_fim}", "@CobrancaDataFim");

        // 2. Garante datas em UTC para o driver Npgsql do PostgreSQL
        var dataIniUtc = DateTime.SpecifyKind(cycle.StartDate.Date, DateTimeKind.Utc);
        var dataFimUtc = DateTime.SpecifyKind(cycle.EndDate.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc); // Pega até 23:59:59.999

        var parameters = new
        {
            ArmazemId = cycle.CompanyId,
            DepositanteId = cycle.CustomerId,
            ServicoValor = tariff.UnitValue,
            CobrancaDataIni = dataIniUtc,
            CobrancaDataFim = dataFimUtc
        };

        // 3. Extrai a conexão e transação ativas do EF Core
        var connection = _db.Database.GetDbConnection();
        var transaction = _db.Database.CurrentTransaction?.GetDbTransaction();

        // 4. Executa a query dinâmica via Dapper
        var resultRows = await connection.QueryAsync<dynamic>(safeQuery, parameters, transaction);

        decimal totalQty = 0;
        decimal totalAmount = 0;
        var extractList = new List<IDictionary<string, object>>();

        foreach (var row in resultRows)
        {
            var rawDict = (IDictionary<string, object>)row;
            extractList.Add(rawDict);

            // Transforma o dicionário em Case-Insensitive (Postgres converte colunas unquoted para minúsculas)
            var dict = new Dictionary<string, object>(rawDict, StringComparer.OrdinalIgnoreCase);

            // Soma dos Volumes / Quantidades
            if (dict.TryGetValue("VOLUME", out var qtyObj) && qtyObj is not DBNull and not null)
                totalQty += Convert.ToDecimal(qtyObj, System.Globalization.CultureInfo.InvariantCulture);
            else if (dict.TryGetValue("QUANTIDADE", out var qtyAltObj) && qtyAltObj is not DBNull and not null)
                totalQty += Convert.ToDecimal(qtyAltObj, System.Globalization.CultureInfo.InvariantCulture);

            // Soma do Valor Total / Diárias
            if (dict.TryGetValue("VALOR_DIARIA", out var valObj) && valObj is not DBNull and not null)
                totalAmount += Convert.ToDecimal(valObj, System.Globalization.CultureInfo.InvariantCulture);
            else if (dict.TryGetValue("SERVICE_TOTAL", out var sTotalObj) && sTotalObj is not DBNull and not null)
                totalAmount += Convert.ToDecimal(sTotalObj, System.Globalization.CultureInfo.InvariantCulture);
            else if (dict.TryGetValue("VALOR_TOTAL", out var vTotalObj) && vTotalObj is not DBNull and not null)
                totalAmount += Convert.ToDecimal(vTotalObj, System.Globalization.CultureInfo.InvariantCulture);
        }

        var jsonOptions = new JsonSerializerOptions { WriteIndented = false };
        var extractJson = JsonSerializer.Serialize(extractList, jsonOptions);

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
}