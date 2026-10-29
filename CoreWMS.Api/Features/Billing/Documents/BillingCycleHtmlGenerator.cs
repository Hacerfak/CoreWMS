using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Entities;

namespace CoreWMS.Api.Features.Billing.Documents;

public static class BillingCycleHtmlGenerator
{
  private static readonly CultureInfo PtBr = new("pt-BR");

  public static string Generate(BillingCycle cycle, Company? company, DateTime emissaoData, string? logoBase64 = null)
  {
    var customer = cycle.Customer;

    var tz = GetBrasiliaTimeZone();
    var startLocal = TimeZoneInfo.ConvertTimeFromUtc(cycle.StartDate, tz);
    var endLocal = TimeZoneInfo.ConvertTimeFromUtc(cycle.EndDate, tz);

    // 1. Cálculos de Totais dos Indicadores
    decimal dailyTotal = 0;
    decimal eventsTotal = 0;
    decimal manualTotal = 0;

    foreach (var item in cycle.Items)
    {
      var isManual = item.DocumentType?.Equals("Manual", StringComparison.OrdinalIgnoreCase) == true ||
                     (!item.DocumentId.HasValue && string.IsNullOrWhiteSpace(item.StatementDataJson) && item.DocumentType != "Diária de Estoque");

      var desc = (item.Description ?? "").ToLowerInvariant();

      if (isManual) manualTotal += item.ServiceTotal;
      else if (desc.Contains("armazenagem") || desc.Contains("ad-valorem") || desc.Contains("seguro") || item.DocumentType == "Diária de Estoque")
        dailyTotal += item.ServiceTotal;
      else
        eventsTotal += item.ServiceTotal;
    }

    // 2. Agrupamento por NF-e com Cronologia Detalhada
    var nfeGroups = GroupItemsByNfeDetailed(cycle);

    // 3. Montagem do HTML
    var sb = new StringBuilder();
    sb.Append($@"<!DOCTYPE html>
<html lang=""pt-BR"">
<head>
<meta charset=""utf-8""/>
<meta name=""viewport"" content=""width=device-width, initial-scale=1.0""/>
<title>Extrato de Faturamento - {cycle.ReferenceMonth} - {customer?.CorporateName}</title>
<style>
  @page {{
    size: A4 portrait;
    margin: 8mm;
  }}
  *, *::before, *::after {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }}
  body {{
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, ""Segoe UI"", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #e2e8f0;
    font-size: 11px;
  }}

  .no-print-bar {{
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 48px;
    background: #0f172a;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    z-index: 9999;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  }}
  .no-print-bar .title {{
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }}
  .no-print-bar .actions {{
    display: flex;
    gap: 8px;
  }}
  .btn-print {{
    background: #2563eb;
    color: #ffffff;
    border: none;
    padding: 7px 18px;
    font-size: 12px;
    font-weight: 700;
    border-radius: 6px;
    cursor: pointer;
  }}
  .btn-print:hover {{ background: #1d4ed8; }}
  .btn-csv {{
    background: #059669;
    color: #ffffff;
    border: none;
    padding: 7px 16px;
    font-size: 12px;
    font-weight: 700;
    border-radius: 6px;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }}
  .btn-csv:hover {{ background: #047857; }}
  .btn-close {{
    background: #334155;
    color: #ffffff;
    border: none;
    padding: 7px 14px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
  }}
  .btn-close:hover {{ background: #475569; }}

  .statement-sheet {{
    width: 200mm;
    margin: 64px auto 30px auto;
    background: #ffffff;
    padding: 16mm 14mm;
    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
    border-radius: 4px;
    min-height: 285mm;
  }}

  .header-table {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
  }}
  .header-table td {{
    vertical-align: top;
  }}
  .doc-title {{
    font-size: 16px;
    font-weight: 800;
    color: #1e3a8a;
    letter-spacing: -0.3px;
    margin: 0;
  }}
  .doc-subtitle {{
    font-size: 10px;
    color: #64748b;
    margin: 2px 0 0 0;
  }}
  .period-badge {{
    text-align: right;
    font-size: 11px;
    color: #1e293b;
  }}

  .meta-grid {{
    display: flex;
    justify-content: space-between;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 14px;
  }}
  .meta-col {{
    display: flex;
    flex-direction: column;
    gap: 3px;
  }}
  .meta-label {{
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 700;
    color: #64748b;
  }}
  .meta-value {{
    font-size: 11px;
    font-weight: 600;
    color: #0f172a;
  }}

  .summary-cards {{
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 18px;
  }}
  .card-box {{
    border-radius: 6px;
    padding: 8px 10px;
    border: 1px solid #e2e8f0;
  }}
  .card-total {{ background: #f0fdf4; border-color: #bbf7d0; }}
  .card-total .card-label {{ color: #166534; }}
  .card-total .card-value {{ color: #15803d; }}

  .card-daily {{ background: #faf5ff; border-color: #e9d5ff; }}
  .card-daily .card-label {{ color: #6b21a8; }}
  .card-daily .card-value {{ color: #7e22ce; }}

  .card-events {{ background: #eff6ff; border-color: #bfdbfe; }}
  .card-events .card-label {{ color: #1e40af; }}
  .card-events .card-value {{ color: #2563eb; }}

  .card-manual {{ background: #fffbeb; border-color: #fde68a; }}
  .card-manual .card-label {{ color: #92400e; }}
  .card-manual .card-value {{ color: #b45309; }}

  .card-label {{
    font-size: 8px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }}
  .card-value {{
    font-size: 14px;
    font-weight: 800;
    font-family: monospace;
    margin-top: 3px;
  }}

  .section-title {{
    font-size: 11px;
    font-weight: 800;
    color: #1e293b;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin: 18px 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 2px solid #cbd5e1;
  }}

  .nfe-card-block {{
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    margin-bottom: 14px;
    overflow: hidden;
    page-break-inside: avoid;
  }}
  .nfe-card-header {{
    background: #f1f5f9;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #cbd5e1;
  }}

  .data-table {{
    width: 100%;
    border-collapse: collapse;
  }}
  .data-table th {{
    background: #1e3a8a;
    color: #ffffff;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 5px 8px;
    border: 1px solid #1e3a8a;
  }}
  .data-table td {{
    padding: 5px 8px;
    border: 1px solid #e2e8f0;
    font-size: 10px;
  }}
  .data-table tr:nth-child(even) td {{
    background: #f8fafc;
  }}
  .text-right {{ text-align: right; }}
  .text-center {{ text-align: center; }}
  .font-mono {{ font-family: monospace; }}
  .font-bold {{ font-weight: 700; }}

  .tfoot-row td {{
    background: #e2e8f0 !important;
    font-weight: 800;
    font-size: 10px;
    border-top: 2px solid #cbd5e1;
  }}

  .badge-tag {{
    display: inline-block;
    background: #e0f2fe;
    color: #0369a1;
    border: 1px solid #bae6fd;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 9px;
    font-family: monospace;
    font-weight: 700;
  }}

  .badge-storage {{ background: #f3e8ff; color: #6b21a8; border-color: #d8b4fe; }}
  .badge-advalorem {{ background: #ecfdf5; color: #047857; border-color: #a7f3d0; }}

  .footer-bar {{
    margin-top: 24px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: #64748b;
  }}

  @media print {{
    body {{ background: #ffffff; }}
    .no-print-bar {{ display: none !important; }}
    .statement-sheet {{
      width: 100%;
      margin: 0;
      padding: 0;
      box-shadow: none;
      min-height: auto;
    }}
    .data-table th {{
      background: #1e3a8a !important;
      color: #ffffff !important;
    }}
  }}
</style>
</head>
<body>

<div class=""no-print-bar"">
  <div class=""title"">
    <span>📄 Extrato de Faturamento &bull; {cycle.ReferenceMonth} &bull; {customer?.CorporateName}</span>
  </div>
  <div class=""actions"">
    <button class=""btn-print"" onclick=""window.print()"">🖨️ Imprimir / Salvar PDF (Ctrl+P)</button>
    <button class=""btn-close"" onclick=""window.close()"">Fechar</button>
  </div>
</div>

<div class=""statement-sheet"">
  <!-- CABEÇALHO -->
  <table class=""header-table"">
    <tr>
      <td>
        <h1 class=""doc-title"">EXTRATO DE FATURAMENTO LOGÍSTICO</h1>
        <p class=""doc-subtitle"">Armazenagem Geral, Custódia 3PL & Movimentação Operacional</p>
      </td>
      <td class=""period-badge"">
        <div style=""font-size: 13px; font-weight: 800; color: #1e3a8a;"">Competência: {cycle.ReferenceMonth}</div>
        <div style=""color: #64748b; font-size: 10px; margin-top: 2px;"">Período: {startLocal:dd/MM/yyyy} a {endLocal:dd/MM/yyyy}</div>
      </td>
    </tr>
  </table>

  <!-- DADOS DA CONTA E DEPOSITANTE -->
  <div class=""meta-grid"">
    <div class=""meta-col"">
      <span class=""meta-label"">Depositante</span>
      <span class=""meta-value"">{customer?.CorporateName ?? "Não Informado"}</span>
      <span style=""font-size: 9px; color: #64748b; font-family: monospace;"">CNPJ: {FormatCnpj(customer?.Cnpj)}</span>
    </div>
    <div class=""meta-col"">
      <span class=""meta-label"">Armazém Geral</span>
      <span class=""meta-value"">{company?.CorporateName ?? "CoreWMS Logística"}</span>
      <span style=""font-size: 9px; color: #64748b; font-family: monospace;"">CNPJ: {FormatCnpj(company?.Cnpj)}</span>
    </div>
    <div class=""meta-col"" style=""text-align: right;"">
      <span class=""meta-label"">Status da Fatura</span>
      <span class=""meta-value"" style=""color: {(cycle.Status.ToString() == "Draft" ? "#16a34a" : "#475569")};"">
        {(cycle.Status.ToString() == "Draft" ? "🟢 Em Aberto (Acumulando)" : "🔒 Fatura Fechada")}
      </span>
      <span style=""font-size: 9px; color: #64748b;"">Emissão: {emissaoData:dd/MM/yyyy HH:mm}</span>
    </div>
  </div>

  <!-- CARDS INDICADORES -->
  <div class=""summary-cards"">
    <div class=""card-box card-total"">
      <div class=""card-label"">Total da Fatura</div>
      <div class=""card-value"">R$ {cycle.TotalAmount.ToString("N2", PtBr)}</div>
    </div>
    <div class=""card-box card-daily"">
      <div class=""card-label"">Diárias (Armaz. / Seguro)</div>
      <div class=""card-value"">R$ {dailyTotal.ToString("N2", PtBr)}</div>
    </div>
    <div class=""card-box card-events"">
      <div class=""card-label"">Eventos Operacionais</div>
      <div class=""card-value"">R$ {eventsTotal.ToString("N2", PtBr)}</div>
    </div>
    <div class=""card-box card-manual"">
      <div class=""card-label"">Lançamentos Avulsos</div>
      <div class=""card-value"">R$ {manualTotal.ToString("N2", PtBr)}</div>
    </div>
  </div>

  <!-- SEÇÃO 1: CONSOLIDADO E CRONOLOGIA POR NOTA FISCAL (CUSTÓDIA 3PL) -->
  <div class=""section-title"">1. Extrato Cronológico por Nota Fiscal de Entrada (Custódia 3PL)</div>");

    foreach (var nfe in nfeGroups)
    {
      sb.Append($@"
  <div class=""nfe-card-block"">
    <div class=""nfe-card-header"">
      <div>
        <span class=""font-mono font-bold"" style=""font-size: 12px; color: #1e3a8a;"">{nfe.NfeNumber}</span>
        <span style=""color: #64748b; font-size: 10px; margin-left: 8px;"">Entrada: {nfe.EntryDate:dd/MM/yyyy}</span>
      </div>
      <div class=""text-right"">
        <span style=""font-size: 9px; color: #64748b; text-transform: uppercase; font-family: monospace;"">Total Acumulado na NF: </span>
        <strong class=""font-mono"" style=""font-size: 12px; color: #15803d;"">R$ {nfe.TotalAmount.ToString("N2", PtBr)}</strong>
      </div>
    </div>
    <table class=""data-table"">
      <thead>
        <tr>
          <th style=""text-align: center; width: 75px;"">Data Ref</th>
          <th style=""text-align: left; width: 130px;"">Serviço / Categoria</th>
          <th style=""text-align: left; width: 140px;"">Operação / Descrição</th>
          <th style=""text-align: left;"">Embalagens & Detalhe</th>
          <th class=""text-right"" style=""width: 55px;"">Volumes</th>
          <th class=""text-right"" style=""width: 85px;"">Base Cálculo R$</th>
          <th class=""text-right"" style=""width: 90px;"">Tarifa Unitária</th>
          <th class=""text-right"" style=""width: 80px;"">Valor Cobrado</th>
        </tr>
      </thead>
      <tbody>");

      foreach (var occ in nfe.Occurrences.OrderBy(o => o.Date).ThenBy(o => o.Description))
      {
        var isAdValorem = occ.Type.Contains("Ad-Valorem", StringComparison.OrdinalIgnoreCase) || occ.Type.Contains("Seguro", StringComparison.OrdinalIgnoreCase);

        foreach (var p in occ.DetailedPacks)
        {
          string badgeClass = isAdValorem ? "badge-advalorem" : (occ.Type.Contains("Armazenagem", StringComparison.OrdinalIgnoreCase) ? "badge-storage" : "");
          string baseCalculoStr = isAdValorem && p.BaseCalculation > 0 ? $"R$ {p.BaseCalculation.ToString("N2", PtBr)}" : "-";

          sb.Append($@"
        <tr>
          <td class=""text-center font-mono"" style=""color: #475569;"">{occ.Date:dd/MM/yyyy}</td>
          <td><span class=""badge-tag {badgeClass}"">{occ.Type}</span></td>
          <td style=""font-size: 9.5px; color: #334155;"">{occ.Description}</td>
          <td class=""font-bold font-mono"">{p.VolumeCount:N0} {p.PackagingCode} <span style=""font-size: 9px; font-weight: normal; color: #64748b;"">({p.Description})</span></td>
          <td class=""text-right font-mono"">{p.VolumeCount:N0}</td>
          <td class=""text-right font-mono"">{baseCalculoStr}</td>
          <td class=""text-right font-mono font-bold"" style=""color: #1e40af;"">{FormatUnitRate(p.UnitValue)}</td>
          <td class=""text-right font-mono font-bold"" style=""color: #15803d;"">R$ {p.TotalValue.ToString("N2", PtBr)}</td>
        </tr>");
        }
      }

      sb.Append($@"
      </tbody>
    </table>
  </div>");
    }

    // SEÇÃO 2: CRONOLOGIA GERAL DE SERVIÇOS
    sb.Append($@"
  <div class=""section-title"" style=""margin-top: 24px;"">2. Extrato Analítico Geral dos Serviços Prestados (Cronológico)</div>
  <table class=""data-table"">
    <thead>
      <tr>
        <th style=""text-align: center; width: 75px;"">Data Ref</th>
        <th style=""text-align: left; width: 95px;"">Documento</th>
        <th style=""text-align: left; width: 140px;"">Serviço / Operação</th>
        <th style=""text-align: left;"">Embalagens & Tarifas</th>
        <th class=""text-right"" style=""width: 55px;"">Volumes</th>
        <th class=""text-right"" style=""width: 85px;"">Base Cálculo R$</th>
        <th class=""text-right"" style=""width: 90px;"">Tarifa Unitária</th>
        <th class=""text-right"" style=""width: 85px;"">Valor Cobrado</th>
      </tr>
    </thead>
    <tbody>");

    foreach (var item in cycle.Items.OrderBy(i => i.ChargeDate).ThenBy(i => i.DocumentNumber).ThenBy(i => i.Description))
    {
      var docLabel = !string.IsNullOrWhiteSpace(item.DocumentNumber) && !item.DocumentNumber.Contains('/')
          ? item.DocumentNumber
          : (item.DocumentType ?? "Consolidado");

      bool isAdValorem = (item.Description ?? "").Contains("Ad-Valorem", StringComparison.OrdinalIgnoreCase) ||
                         (item.BillingService?.Name ?? "").Contains("Ad-Valorem", StringComparison.OrdinalIgnoreCase);

      var packs = ParseAndAggregateRows(item.StatementDataJson, item.QuantityTotal, item.ServiceTotal, isAdValorem);

      foreach (var p in packs)
      {
        string baseCalculoStr = isAdValorem && p.BaseCalculation > 0 ? $"R$ {p.BaseCalculation.ToString("N2", PtBr)}" : "-";

        sb.Append($@"
      <tr>
        <td class=""text-center font-mono"" style=""color: #475569;"">{item.ChargeDate:dd/MM/yyyy}</td>
        <td class=""font-mono font-bold"" style=""color: #334155;"">{docLabel}</td>
        <td style=""font-size: 9.5px;"">{item.Description ?? item.BillingService?.Name ?? "-"}</td>
        <td class=""font-bold font-mono"">{p.VolumeCount:N0} {p.PackagingCode} <span style=""font-size: 9px; font-weight: normal; color: #64748b;"">({p.Description})</span></td>
        <td class=""text-right font-mono"">{p.VolumeCount:N0}</td>
        <td class=""text-right font-mono"">{baseCalculoStr}</td>
        <td class=""text-right font-mono font-bold"" style=""color: #1e40af;"">{FormatUnitRate(p.UnitValue)}</td>
        <td class=""text-right font-mono font-bold"" style=""color: #15803d;"">R$ {p.TotalValue.ToString("N2", PtBr)}</td>
      </tr>");
      }
    }

    sb.Append($@"
    </tbody>
    <tfoot>
      <tr class=""tfoot-row"">
        <td colspan=""7"">TOTAL FATURADO NO CICLO</td>
        <td class=""text-right font-mono font-bold"" style=""color: #15803d; font-size: 11px;"">R$ {cycle.TotalAmount.ToString("N2", PtBr)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- RODAPÉ -->
  <div class=""footer-bar"">
    <span>Documento auxiliar para simples conferência e faturamento. Emitido por CoreWMS.</span>
    <span>Emissão: {emissaoData:dd/MM/yyyy HH:mm:ss}</span>
  </div>
</div>

</body>
</html>");

    return sb.ToString();
  }

  private static string FormatCnpj(string? cnpj)
  {
    if (string.IsNullOrWhiteSpace(cnpj)) return "-";
    var c = new string(cnpj.Where(char.IsDigit).ToArray());
    if (c.Length != 14) return cnpj;
    return $"{c[..2]}.{c.Substring(2, 3)}.{c.Substring(5, 3)}/{c.Substring(8, 4)}-{c.Substring(12, 2)}";
  }

  public static string FormatUnitRate(decimal value)
  {
    if (value == 0) return "R$ 0,00";
    string formatted = value.ToString("0.00##########", PtBr);
    return $"R$ {formatted}";
  }

  public static List<DetailedStatementRowDto> ParseAndAggregateRows(string? statementJson, decimal fallbackQty, decimal fallbackAmount, bool isAdValorem)
  {
    if (string.IsNullOrWhiteSpace(statementJson))
    {
      decimal calcUnit = fallbackQty > 0 ? (fallbackAmount / fallbackQty) : fallbackAmount;
      return new List<DetailedStatementRowDto>
            {
                new()
                {
                    PackagingCode = "VOL",
                    Description = "Volume Operacional",
                    VolumeCount = fallbackQty > 0 ? fallbackQty : 1,
                    BaseCalculation = isAdValorem ? fallbackAmount : 0,
                    UnitValue = calcUnit,
                    TotalValue = fallbackAmount
                }
            };
    }

    try
    {
      using var doc = JsonDocument.Parse(statementJson);
      var root = doc.RootElement;
      var list = new List<DetailedStatementRowDto>();

      if (root.ValueKind == JsonValueKind.Array)
      {
        var grouped = new Dictionary<string, DetailedStatementRowDto>();

        foreach (var elem in root.EnumerateArray())
        {
          string code = elem.TryGetProperty("TIPO_VOLUME", out var p) ? p.GetString() ?? "VOL" : "VOL";
          code = code.Trim().ToUpper();

          decimal vol = elem.TryGetProperty("VOLUME", out var v) && v.TryGetDecimal(out var vVal) ? vVal : 1m;
          decimal tot = elem.TryGetProperty("VALOR_TOTAL", out var t) && t.TryGetDecimal(out var tVal) ? tVal :
                       (elem.TryGetProperty("VALOR_DIARIA", out var d) && d.TryGetDecimal(out var dVal) ? dVal : 0m);

          decimal unit = elem.TryGetProperty("VALOR_UNITARIO", out var u) && u.TryGetDecimal(out var uVal) ? uVal : 0m;
          decimal baseCalc = elem.TryGetProperty("BASE_CALCULO", out var b) && b.TryGetDecimal(out var bVal) ? bVal : 0m;

          if (baseCalc == 0 && isAdValorem && unit > 0)
            baseCalc = tot / unit;

          if (unit == 0 && vol > 0 && tot > 0)
            unit = tot / vol;

          string desc = elem.TryGetProperty("DESCRICAO", out var descProp) ? descProp.GetString() ?? "" : "";
          if (string.IsNullOrWhiteSpace(desc))
            desc = code == "PLT" ? "Palete" : (code == "CX" ? "Caixa" : (code == "UN" ? "Unidade" : "Volume"));

          if (!grouped.ContainsKey(code))
          {
            grouped[code] = new DetailedStatementRowDto
            {
              PackagingCode = code,
              Description = desc,
              VolumeCount = 0,
              BaseCalculation = 0,
              UnitValue = unit,
              TotalValue = 0
            };
          }

          grouped[code].VolumeCount += vol;
          grouped[code].TotalValue += tot;
          grouped[code].BaseCalculation += baseCalc;
          if (unit > 0) grouped[code].UnitValue = unit;
        }

        return grouped.Values.ToList();
      }
    }
    catch { }

    return new List<DetailedStatementRowDto>
        {
            new()
            {
                PackagingCode = "VOL",
                Description = "Volume Operacional",
                VolumeCount = fallbackQty > 0 ? fallbackQty : 1,
                BaseCalculation = isAdValorem ? fallbackAmount : 0,
                UnitValue = fallbackAmount,
                TotalValue = fallbackAmount
            }
        };
  }

  private static TimeZoneInfo GetBrasiliaTimeZone()
  {
    string[] tzIds = ["America/Sao_Paulo", "E. South America Standard Time", "Central Brazilian Standard Time"];
    foreach (var id in tzIds)
    {
      try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
      catch { }
    }
    return TimeZoneInfo.CreateCustomTimeZone("Brasilia", TimeSpan.FromHours(-3), "Brasilia", "Brasilia");
  }

  private static List<NfeGroupDetailedDto> GroupItemsByNfeDetailed(BillingCycle cycle)
  {
    var map = new Dictionary<string, NfeGroupDetailedDto>();

    foreach (var item in cycle.Items)
    {
      var isManual = item.DocumentType?.Equals("Manual", StringComparison.OrdinalIgnoreCase) == true;
      if (isManual) continue;

      var nfeKey = !string.IsNullOrWhiteSpace(item.DocumentNumber) && !item.DocumentNumber.Contains('/')
          ? item.DocumentNumber
          : "Geral";

      if (!map.TryGetValue(nfeKey, out var group))
      {
        group = new NfeGroupDetailedDto
        {
          NfeNumber = nfeKey,
          EntryDate = item.ChargeDate
        };
        map[nfeKey] = group;
      }

      group.TotalAmount += item.ServiceTotal;

      bool isAdValorem = (item.Description ?? "").Contains("Ad-Valorem", StringComparison.OrdinalIgnoreCase) ||
                         (item.BillingService?.Name ?? "").Contains("Ad-Valorem", StringComparison.OrdinalIgnoreCase);

      string typeLabel = item.DocumentType == "NF-e Entrada"
          ? "Recebimento (Handling In)"
          : (isAdValorem ? "Seguro / Ad-Valorem" : (item.DocumentType == "Diária de Estoque" ? "Armazenagem Diária" : item.BillingService?.Name ?? "Operacional"));

      var packs = ParseAndAggregateRows(item.StatementDataJson, item.QuantityTotal, item.ServiceTotal, isAdValorem);

      group.Occurrences.Add(new NfeOccurrenceDetailedDto
      {
        Date = item.ChargeDate,
        Type = typeLabel,
        Description = item.Description ?? item.BillingService?.Name ?? "-",
        DetailedPacks = packs,
        TotalAmount = item.ServiceTotal
      });
    }

    return map.Values.OrderBy(v => v.EntryDate).ToList();
  }

  public class DetailedStatementRowDto
  {
    public string PackagingCode { get; set; } = "VOL";
    public string Description { get; set; } = "";
    public decimal VolumeCount { get; set; }
    public decimal BaseCalculation { get; set; }
    public decimal UnitValue { get; set; }
    public decimal TotalValue { get; set; }
  }

  private class NfeGroupDetailedDto
  {
    public string NfeNumber { get; set; } = "";
    public DateTime EntryDate { get; set; }
    public decimal TotalAmount { get; set; }
    public List<NfeOccurrenceDetailedDto> Occurrences { get; set; } = new();
  }

  private class NfeOccurrenceDetailedDto
  {
    public DateTime Date { get; set; }
    public string Type { get; set; } = "";
    public string Description { get; set; } = "";
    public List<DetailedStatementRowDto> DetailedPacks { get; set; } = new();
    public decimal TotalAmount { get; set; }
  }
}