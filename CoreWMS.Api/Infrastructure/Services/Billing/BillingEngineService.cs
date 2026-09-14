using System.Data;
using System.Text.Json;
using CoreWMS.Api.Features.Billing.Entities;
using Dapper;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Infrastructure.Services.Billing;

public class BillingEngineService
{
    private readonly IDbConnection _dbConnection;

    public BillingEngineService(IDbConnection dbConnection)
    {
        _dbConnection = dbConnection;
    }

    public async Task<BillingItem> ExecuteServiceAsync(
        BillingCycle cycle,
        BillingService service,
        CustomerTariff tariff)
    {
        if (service.Type == BillingServiceType.Manual_Entry || string.IsNullOrWhiteSpace(service.SqlTemplate))
            throw new InvalidOperationException("Este serviço não é de cálculo automático.");

        // 1. Higienização: Troca as chaves de string do SQL por parâmetros do Dapper (prevenção de SQL Injection indireto)
        var safeQuery = service.SqlTemplate
            .Replace("{armazem_id}", "@ArmazemId")
            .Replace("{depositante_id}", "@DepositanteId")
            .Replace("{servico_valor}", "@ServicoValor")
            .Replace("'{cobranca_data_ini}'", "@CobrancaDataIni")
            .Replace("'{cobranca_data_fim}'", "@CobrancaDataFim");

        // 2. Parâmetros tipados
        var parameters = new
        {
            ArmazemId = cycle.CompanyId,
            DepositanteId = cycle.CustomerId,
            ServicoValor = tariff.UnitValue,
            CobrancaDataIni = cycle.StartDate.Date,
            CobrancaDataFim = cycle.EndDate.Date
        };

        // 3. Executa a query dinâmica retornando uma lista de dicionários (Schema-less)
        // Isso permite que o SQL tenha quantas colunas quiser, o Dapper mapeia como chave-valor
        var resultRows = await _dbConnection.QueryAsync<dynamic>(safeQuery, parameters);

        // 4. Calcula os totais varrendo as linhas
        // Exige que o SQL retorne as colunas padronizadas de totalização, ou as calcula na mão
        decimal totalQty = 0;
        decimal totalAmount = 0;

        var extractList = new List<IDictionary<string, object>>();

        foreach (var row in resultRows)
        {
            var dict = (IDictionary<string, object>)row;
            extractList.Add(dict);

            // Tenta ler as colunas de quantidade e valor daquela linha específica (você pode customizar os nomes exigidos)
            if (dict.TryGetValue("VOLUME", out var qtyObj) && qtyObj != null)
                totalQty += Convert.ToDecimal(qtyObj);

            if (dict.TryGetValue("VALOR_DIARIA", out var valObj) && valObj != null)
                totalAmount += Convert.ToDecimal(valObj);
            else if (dict.TryGetValue("service_total", out var sTotalObj) && sTotalObj != null)
                totalAmount += Convert.ToDecimal(sTotalObj);
        }

        // 5. Serializa o Extrato Completo
        var jsonOptions = new JsonSerializerOptions { WriteIndented = false };
        var extractJson = JsonSerializer.Serialize(extractList, jsonOptions);

        // 6. Retorna a linha da fatura pronta para ser salva no Entity Framework
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