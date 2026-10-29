using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using CoreWMS.Api.Features.Billing.Entities;

namespace CoreWMS.Api.Features.Billing.Documents;

public static class BillingCycleCsvGenerator
{
    private static readonly CultureInfo PtBr = new("pt-BR");

    public static byte[] Generate(BillingCycle cycle)
    {
        using var memoryStream = new MemoryStream();
        // UTF-8 com BOM: Permite que o Excel abra os acentos em português sem falhas de encoding
        using var writer = new StreamWriter(memoryStream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));

        // Cabeçalho Oficial
        writer.WriteLine(string.Join(";", new[]
        {
            "ID_LANCAMENTO",
            "DATA_COBRANCA",
            "COMPETENCIA",
            "CLIENTE",
            "CNPJ_CLIENTE",
            "TIPO_DOCUMENTO",
            "NUMERO_DOCUMENTO",
            "SERVICO",
            "DESCRICAO_OPERACAO",
            "TIPO_VOLUME",
            "DESCRICAO_EMBALAGEM",
            "QUANTIDADE_VOLUMES",
            "BASE_CALCULO_RS",
            "TARIFA_UNITARIA_RS",
            "VALOR_TOTAL_RS",
            "OBSERVACOES"
        }));

        var customerName = cycle.Customer?.CorporateName ?? "N/A";
        var customerCnpj = cycle.Customer?.Cnpj ?? "";

        // Ordena estritamente em ordem cronológica
        var orderedItems = cycle.Items
            .OrderBy(i => i.ChargeDate)
            .ThenBy(i => i.DocumentNumber)
            .ThenBy(i => i.Description);

        foreach (var item in orderedItems)
        {
            bool isAdValorem = (item.Description ?? "").Contains("Ad-Valorem", StringComparison.OrdinalIgnoreCase) ||
                               (item.BillingService?.Name ?? "").Contains("Ad-Valorem", StringComparison.OrdinalIgnoreCase);

            var packs = BillingCycleHtmlGenerator.ParseAndAggregateRows(
                item.StatementDataJson,
                item.QuantityTotal,
                item.ServiceTotal,
                isAdValorem
            );

            var docNum = !string.IsNullOrWhiteSpace(item.DocumentNumber) ? item.DocumentNumber : "Consolidado";
            var serviceName = item.BillingService?.Name ?? (item.DocumentType ?? "Serviço");

            foreach (var p in packs)
            {
                var rowFields = new[]
                {
                    item.Id.ToString(),
                    item.ChargeDate.ToString("yyyy-MM-dd"),
                    cycle.ReferenceMonth,
                    EscapeCsv(customerName),
                    EscapeCsv(customerCnpj),
                    EscapeCsv(item.DocumentType ?? "Operacional"),
                    EscapeCsv(docNum),
                    EscapeCsv(serviceName),
                    EscapeCsv(item.Description ?? serviceName),
                    EscapeCsv(p.PackagingCode),
                    EscapeCsv(p.Description),
                    p.VolumeCount.ToString("N0", PtBr),
                    p.BaseCalculation.ToString("N2", PtBr),
                    p.UnitValue.ToString("0.00##########", PtBr),
                    p.TotalValue.ToString("N2", PtBr),
                    EscapeCsv(item.ManualNotes ?? "")
                };

                writer.WriteLine(string.Join(";", rowFields));
            }
        }

        writer.Flush();
        return memoryStream.ToArray();
    }

    private static string EscapeCsv(string? field)
    {
        if (string.IsNullOrEmpty(field)) return "";
        if (field.Contains(';') || field.Contains('"') || field.Contains('\n') || field.Contains('\r'))
        {
            return $"\"{field.Replace("\"", "\"\"")}\"";
        }
        return field;
    }
}