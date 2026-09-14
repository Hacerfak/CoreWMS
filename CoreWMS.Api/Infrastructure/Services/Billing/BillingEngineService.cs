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

        var safeQuery = service.SqlTemplate
            .Replace("{armazem_id}", "@ArmazemId")
            .Replace("{depositante_id}", "@DepositanteId")
            .Replace("{servico_valor}", "@ServicoValor")
            .Replace("'{cobranca_data_ini}'", "@CobrancaDataIni")
            .Replace("'{cobranca_data_fim}'", "@CobrancaDataFim");

        var parameters = new
        {
            ArmazemId = cycle.CompanyId,
            DepositanteId = cycle.CustomerId,
            ServicoValor = tariff.UnitValue,
            CobrancaDataIni = cycle.StartDate.Date,
            CobrancaDataFim = cycle.EndDate.Date
        };

        // 1. Extrai a conexão e transação ativas do EF Core
        var connection = _db.Database.GetDbConnection();
        var transaction = _db.Database.CurrentTransaction?.GetDbTransaction();

        // 2. Executa a query dinâmica via Dapper no mesmo contexto transacional
        var resultRows = await connection.QueryAsync<dynamic>(safeQuery, parameters, transaction);

        decimal totalQty = 0;
        decimal totalAmount = 0;
        var extractList = new List<IDictionary<string, object>>();

        foreach (var row in resultRows)
        {
            var dict = (IDictionary<string, object>)row;
            extractList.Add(dict);

            if (dict.TryGetValue("VOLUME", out var qtyObj) && qtyObj != null)
                totalQty += Convert.ToDecimal(qtyObj);

            if (dict.TryGetValue("VALOR_DIARIA", out var valObj) && valObj != null)
                totalAmount += Convert.ToDecimal(valObj);
            else if (dict.TryGetValue("service_total", out var sTotalObj) && sTotalObj != null)
                totalAmount += Convert.ToDecimal(sTotalObj);
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