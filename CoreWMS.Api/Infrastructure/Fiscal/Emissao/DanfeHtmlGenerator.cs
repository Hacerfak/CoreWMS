using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using DFe.Utils;
using NFe.Classes;
using NFe.Classes.Informacoes.Detalhe;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Federal;
using NFe.Classes.Informacoes.Transporte;

namespace CoreWMS.Api.Infrastructure.Fiscal.Emissao;

public static class DanfeHtmlGenerator
{
  private static readonly CultureInfo PtBrCulture = new("pt-BR");

  public static string Generate(string rawXml, string? logoBase64 = null)
  {
    nfeProc? nfeProc;
    try
    {
      nfeProc = FuncoesXml.XmlStringParaClasse<nfeProc>(rawXml);
    }
    catch
    {
      var nfe = FuncoesXml.XmlStringParaClasse<NFe.Classes.NFe>(rawXml)
          ?? throw new InvalidOperationException("Não foi possível interpretar o XML da NF-e.");
      nfeProc = new nfeProc { NFe = nfe };
    }

    return Generate(nfeProc, logoBase64);
  }

  public static string Generate(nfeProc nfeProc, string? logoBase64 = null)
  {
    var nfe = nfeProc.NFe;
    var inf = nfe.infNFe;
    var ide = inf.ide;
    var emit = inf.emit;
    var dest = inf.dest;
    var total = inf.total?.ICMSTot;
    var transp = inf.transp;
    var infAdic = inf.infAdic;
    var cobr = inf.cobr;
    var fatura = cobr?.fat;
    var duplicatas = cobr?.dup;
    var prot = nfeProc.protNFe?.infProt;
    string chaveAcesso = inf.Id?.Replace("NFe", "").Trim() ?? "";
    bool isHomologacao = ide.tpAmb == DFe.Classes.Flags.TipoAmbiente.Homologacao;

    // Horário de impressão no rodapé no fuso de Brasília (UTC-3)
    var dataImpressao = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-3));

    // Regra de Paginação: No máximo 12 itens na Folha 1 (segurança para infAdProd extenso)
    // e até 22 itens nas folhas de continuação
    var allItems = inf.det ?? new List<det>();
    var pages = new List<List<det>>();

    if (allItems.Count <= 12)
    {
      pages.Add(allItems);
    }
    else
    {
      pages.Add(allItems.Take(12).ToList());
      var remaining = allItems.Skip(12).ToList();
      int itemsPerNextPage = 22;
      for (int i = 0; i < remaining.Count; i += itemsPerNextPage)
      {
        pages.Add(remaining.Skip(i).Take(itemsPerNextPage).ToList());
      }
    }

    int totalPages = pages.Count;
    var barcodeSvg = GerarCodigo128Svg(chaveAcesso);

    // Limpeza de quebras literais nas observações fiscais
    var infCplLimpo = (infAdic?.infCpl ?? "").Replace("\\n", "\n").Trim();
    var infFiscoLimpo = (infAdic?.infAdFisco ?? "").Replace("\\n", "\n").Trim();

    // Dados do Responsável Técnico da emissão (tag infRespTec)
    var respTec = inf.infRespTec;
    string respTecInfo;
    if (respTec != null && !string.IsNullOrWhiteSpace(respTec.CNPJ))
    {
      respTecInfo = $"Powered by {respTec.xContato}";
    }
    else
    {
      respTecInfo = "Powered by CoreWMS - Eder Gross Cichelero";
    }

    // Verifica se há cobrança/faturas para exibir ou suprimir (MOC 3.3.2)
    bool temFatura = fatura != null && (!string.IsNullOrWhiteSpace(fatura.nFat) || fatura.vLiq > 0);
    bool temDuplicatas = duplicatas != null && duplicatas.Any();
    bool exibirQuadroCobranca = temFatura || temDuplicatas;

    var sb = new StringBuilder();
    sb.Append($@"<!DOCTYPE html>
<html lang=""pt-BR"">
<head>
<meta charset=""utf-8""/>
<meta name=""viewport"" content=""width=device-width, initial-scale=1.0""/>
<title>DANFE - {chaveAcesso}</title>
<style>
  @page {{
    size: A4 portrait;
    margin: 4mm;
  }}
  *, *::before, *::after {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }}
  body {{
    margin: 0;
    padding: 0;
    font-family: Arial, ""Helvetica Neue"", Helvetica, sans-serif;
    color: #000000 !important;
    background: #cbd5e1;
  }}
  .no-print-bar {{
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 46px;
    background: #0f172a;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    z-index: 9999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }}
  .no-print-bar .title {{
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 0.3px;
  }}
  .no-print-bar .actions {{
    display: flex;
    gap: 10px;
  }}
  .btn-print {{
    background: #ea580c;
    color: #ffffff;
    border: none;
    padding: 7px 18px;
    font-size: 13px;
    font-weight: bold;
    border-radius: 6px;
    cursor: pointer;
  }}
  .btn-print:hover {{ background: #c2410c; }}
  .btn-close {{
    background: #334155;
    color: #ffffff;
    border: none;
    padding: 7px 14px;
    font-size: 13px;
    border-radius: 6px;
    cursor: pointer;
  }}

  /* Folha A4 Conforme o MOC (202mm x 287mm útil estruturada em Flexbox vertical) */
  .danfe-sheet {{
    width: 202mm;
    min-height: 287mm;
    height: 287mm;
    margin: 58px auto 20px auto;
    background: #ffffff;
    padding: 0;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    position: relative;
    page-break-after: always;
    break-after: page;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }}
  .danfe-sheet:last-child {{
    page-break-after: auto;
    break-after: auto;
    margin-bottom: 40px;
  }}

  @media print {{
    body {{ background: #ffffff; }}
    .no-print-bar {{ display: none !important; }}
    .danfe-sheet {{
      width: 100%;
      min-height: 287mm;
      height: 287mm;
      margin: 0;
      padding: 0;
      box-shadow: none;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }}
    .danfe-sheet:last-child {{
      page-break-after: auto;
      break-after: auto;
    }}
  }}

  .danfe-top {{ flex: 0 0 auto; }}
  .danfe-middle {{ flex: 0 0 auto; }}
  .danfe-bottom {{ flex: 0 0 auto; margin-top: auto; }}

  /* Marca d'Água para Homologação (MOC 3.10.1) */
  .watermark {{
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-size: 44pt;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.07) !important;
    white-space: nowrap;
    text-transform: uppercase;
    pointer-events: none;
    z-index: 999;
    letter-spacing: 3px;
  }}

  /* Tabelas de Caixas / Grades */
  table.tbl-box {{
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 2px;
    table-layout: fixed;
  }}
  table.tbl-box td, table.tbl-box th {{
    border: 1px solid #000000;
    padding: 1.5px 3px;
    vertical-align: top;
    color: #000000 !important;
  }}
  .border-top-none {{ border-top: none !important; }}
  .border-bottom-none {{ border-bottom: none !important; }}
  .border-left-none {{ border-left: none !important; }}
  .border-right-none {{ border-right: none !important; }}

  /* Rótulos e Conteúdos 100% Preto Puro para Jato de Tinta */
  .lbl {{
    display: block;
    font-size: 5pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #000000 !important;
    line-height: 1;
    margin-bottom: 1.5px;
  }}
  .val {{
    display: block;
    font-size: 7.5pt;
    font-weight: bold;
    color: #000000 !important;
    line-height: 1.15;
  }}
  .val-normal {{ font-weight: normal; }}
  .val-sm {{ font-size: 6.5pt; font-weight: normal; }}
  .section-title {{
    font-size: 5.5pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #000000 !important;
    margin-top: 2.5px;
    margin-bottom: 1px;
    padding-left: 1px;
  }}
  .bg-header {{ background-color: #f2f2f2 !important; }}
  .text-center {{ text-align: center; }}
  .text-right {{ text-align: right; }}
  .text-left {{ text-align: left; }}

  /* CANHOTO REGULAMENTAR (MOC 7.0 - ITEM 3.8.1) */
  table.danfe-canhoto {{
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 0;
    border: 1px solid #000000;
  }}
  table.danfe-canhoto > tr > td,
  table.danfe-canhoto > tbody > tr > td {{
    padding: 0;
    vertical-align: top;
    color: #000000 !important;
  }}
  td.canhoto-corpo {{
    width: 78.15%; /* 16,10 cm de 20,60 cm */
    border-right: 1px solid #000000;
  }}
  .canhoto-texto-recebimento {{
    height: 8.5mm; /* 0,85 cm */
    padding: 2.5px 4px;
    font-size: 5.5pt;
    line-height: 1.15;
    color: #000000 !important;
    border-bottom: 1px solid #000000;
    box-sizing: border-box;
  }}
  table.canhoto-campos-sub {{
    width: 100%;
    height: 8.5mm; /* 0,85 cm */
    border-collapse: collapse;
    table-layout: fixed;
  }}
  table.canhoto-campos-sub td.campo-data {{
    width: 25.46%; /* 4,10 cm de 16,10 cm */
    padding: 2.5px 4px !important;
    font-size: 5.5pt;
    line-height: 1.15;
    border-right: 1px solid #000000;
    vertical-align: top;
    box-sizing: border-box;
  }}
  table.canhoto-campos-sub td.campo-assinatura {{
    width: 74.54%; /* 12,10 cm de 16,10 cm */
    padding: 2.5px 4px !important;
    font-size: 5.5pt;
    line-height: 1.15;
    vertical-align: top;
    box-sizing: border-box;
  }}
  .canhoto-lbl {{
    display: block;
    font-size: 5pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #000000 !important;
    line-height: 1.15;
    margin-bottom: 2px;
  }}
  .canhoto-espaco-preenchimento {{
    height: 4.5mm;
  }}
  td.canhoto-identificacao {{
    width: 21.85%; /* 4,50 cm de 20,60 cm */
    height: 17mm;  /* 1,70 cm */
    text-align: center;
    vertical-align: middle;
    padding: 0;
  }}
  .canhoto-nfe-centralizado {{
    height: 17mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
  }}
  .nfe-titulo {{
    font-size: 11pt;
    font-weight: bold;
    line-height: 1;
    color: #000000 !important;
  }}
  .nfe-numero {{
    font-size: 8.5pt;
    font-weight: bold;
    margin-top: 2px;
    color: #000000 !important;
  }}
  .nfe-serie {{
    font-size: 7.5pt;
    font-weight: bold;
    color: #000000 !important;
  }}
  .canhoto-picote {{
    width: 100%;
    border-top: 1px dashed #000000;
    margin-top: 1.5mm;
    margin-bottom: 2mm;
  }}

  /* QUADRO FATURA / DUPLICATAS (Com Card de Fatura Y07) */
  .duplicatas-wrapper {{
    border: 1px solid #000000;
    padding: 2px;
    margin-bottom: 2px;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }}
  .fatura-card {{
    border: 1px solid #000000;
    background-color: #f2f2f2;
    padding: 2px 4px;
    width: 145px;
    flex-shrink: 0;
  }}
  .dup-card {{
    border: 1px solid #000000;
    padding: 2px 4px;
    width: 115px;
    flex-shrink: 0;
  }}

  /* TABELA DOS PRODUTOS / SERVIÇOS (MOC 3.1.7 E 3.8.1) */
  table.tbl-itens {{
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 2px;
  }}
  table.tbl-itens th {{
    background-color: #f2f2f2 !important;
    border: 1px solid #000000;
    padding: 2px 0.5px;
    font-size: 4.8pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #000000 !important;
    line-height: 1.05;
    vertical-align: middle;
    text-align: center;
  }}
  table.tbl-itens td {{
    border: 1px solid #000000;
    padding: 2.5px 2px;
    vertical-align: top;
    font-size: 6.5pt;
    color: #000000 !important;
    line-height: 1.15;
  }}
  /* Destaque divisório por sombreamento uniforme (MOC 3.1.7) */
  tr.item-shaded td {{
    background-color: #ededed !important;
  }}

  /* Quadro Dados Adicionais Expandido */
  table.tbl-adicionais {{
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 0;
  }}
  table.tbl-adicionais td {{
    border: 1px solid #000000;
    height: 34mm;
    min-height: 34mm;
    padding: 3px 5px;
    vertical-align: top;
  }}
  .inf-cpl-content, .fisco-content {{
    font-size: 6.2pt;
    line-height: 1.25;
    white-space: pre-wrap;
    word-break: break-word;
    color: #000000 !important;
  }}
</style>
</head>
<body>
<div class=""no-print-bar"">
  <span class=""title"">DANFE - Documento Auxiliar da Nota Fiscal Eletrônica (NF-e #{ide.nNF:000\.000\.000})</span>
  <div class=""actions"">
    <button class=""btn-print"" onclick=""window.print()"">Imprimir DANFE (Ctrl+P)</button>
    <button class=""btn-close"" onclick=""window.close()"">Fechar</button>
  </div>
</div>");

    for (int pIdx = 0; pIdx < totalPages; pIdx++)
    {
      int folhaAtual = pIdx + 1;
      var pageItems = pages[pIdx];

      sb.Append(@"<div class=""danfe-sheet"">");

      // Marca d'água de homologação (MOC 3.10.1)
      if (isHomologacao)
      {
        sb.Append(@"<div class=""watermark"">SEM VALOR FISCAL</div>");
      }

      // ==========================================
      // BLOCO SUPERIOR (FIXO)
      // ==========================================
      sb.Append(@"<div class=""danfe-top"">");

      if (folhaAtual == 1)
      {
        // 1. CANHOTO (MOC 7.0 - ITEM 3.8.1 - 16,10 cm x 4,50 cm)
        sb.Append($@"
<table class=""danfe-canhoto"">
  <tr>
    <td class=""canhoto-corpo"">
      <div class=""canhoto-texto-recebimento"">
        RECEBEMOS DE <strong>{emit.xNome?.ToUpper()}</strong> OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO
      </div>
      <table class=""canhoto-campos-sub"">
        <tr>
          <td class=""campo-data"">
            <span class=""canhoto-lbl"">DATA DE RECEBIMENTO</span>
            <div class=""canhoto-espaco-preenchimento""></div>
          </td>
          <td class=""campo-assinatura"">
            <span class=""canhoto-lbl"">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span>
            <div class=""canhoto-espaco-preenchimento""></div>
          </td>
        </tr>
      </table>
    </td>
    <td class=""canhoto-identificacao"">
      <div class=""canhoto-nfe-centralizado"">
        <div class=""nfe-titulo"">NF-e</div>
        <div class=""nfe-numero"">Nº {ide.nNF:000\.000\.000}</div>
        <div class=""nfe-serie"">SÉRIE {ide.serie:000}</div>
      </div>
    </td>
  </tr>
</table>
<div class=""canhoto-picote""></div>");
      }

      // 2. CABEÇALHO DO EMITENTE / DANFE / CHAVE DE ACESSO
      sb.Append($@"
<table class=""tbl-box"">
  <tr>
    <!-- EMITENTE (42% - CENTRALIZADO VERTICALMENTE) -->
    <td style=""width: 42%; padding: 4px 6px; vertical-align: middle;"">
      <table style=""width: 100%; height: 100%; border-collapse: collapse;"">
        <tr>");
      if (!string.IsNullOrWhiteSpace(logoBase64))
      {
        string cleanLogo = logoBase64.Contains(",") ? logoBase64.Split(',')[1] : logoBase64;
        sb.Append($@"<td style=""width: 85px; border: none; vertical-align: middle; text-align: center; padding-right: 8px;"">
                  <img src=""data:image/png;base64,{cleanLogo}"" style=""max-width: 82px; max-height: 70px; object-fit: contain; display: block; margin: 0 auto;"" />
                </td>");
      }
      sb.Append($@"
          <td style=""border: none; vertical-align: middle;"">
            <span class=""lbl"" style=""margin-bottom: 2px;"">IDENTIFICAÇÃO DO EMITENTE</span>
            <div style=""font-size: 9.5pt; font-weight: bold; line-height: 1.15; color: #000000;"">{emit.xNome}</div>
            {(!string.IsNullOrWhiteSpace(emit.xFant) ? $"<div style=\"font-size: 8pt; font-weight: bold; margin-top: 1px;\">{emit.xFant}</div>" : "")}
            <div style=""font-size: 6.8pt; line-height: 1.25; margin-top: 3px; color: #000000;"">
              <div>{emit.enderEmit?.xLgr}, {emit.enderEmit?.nro} {emit.enderEmit?.xCpl ?? ""}</div>
              <div>{emit.enderEmit?.xBairro} - CEP: {FormatCep(emit.enderEmit?.CEP)}</div>
              <div>{emit.enderEmit?.xMun} - {emit.enderEmit?.UF}</div>
              {(!string.IsNullOrWhiteSpace(emit.enderEmit?.fone?.ToString()) ? $"<div>TEL: {FormatFone(emit.enderEmit?.fone?.ToString())}</div>" : "")}
            </div>
          </td>
        </tr>
      </table>
    </td>

    <!-- DANFE (14%) -->
    <td class=""text-center"" style=""width: 14%; padding: 2px; vertical-align: middle;"">
      <div style=""font-size: 12pt; font-weight: bold; line-height: 1;"">DANFE</div>
      <div style=""font-size: 5pt; line-height: 1.1; margin: 2px 0;"">Documento Auxiliar da<br/>Nota Fiscal Eletrônica</div>
      <div style=""display: inline-block; border: 1px solid #000; padding: 1px 6px; font-weight: bold; font-size: 7.5pt; margin: 1px 0;"">
        {(int)ide.tpNF} - {((int)ide.tpNF == 0 ? "ENTRADA" : "SAÍDA")}
      </div>
      <div style=""font-size: 8pt; font-weight: bold;"">Nº {ide.nNF:000\.000\.000}</div>
      <div style=""font-size: 7.5pt; font-weight: bold;"">SÉRIE {ide.serie:000}</div>
      <div style=""font-size: 6.5pt; font-weight: bold; margin-top: 1px;"">FOLHA {folhaAtual:D2}/{totalPages:D2}</div>
    </td>

    <!-- CÓDIGO DE BARRAS & CHAVE DE ACESSO (44% - Largura total sem quebra) -->
    <td style=""width: 44%; padding: 0;"">
      <div style=""width: 100%; height: 38px; padding: 1px;"">
        {barcodeSvg}
      </div>
      <div style=""border-top: 1px solid #000; padding: 2px 1px;"">
        <span class=""lbl"">CHAVE DE ACESSO</span>
        <div class=""text-center"" style=""font-size: 6.8pt; font-weight: bold; white-space: nowrap; font-family: Arial, sans-serif; letter-spacing: -0.15px; line-height: 1.1;"">
          {FormatChaveAcesso(chaveAcesso)}
        </div>
      </div>
      <div class=""text-center"" style=""border-top: 1px solid #000; padding: 1.5px; font-size: 5pt;"">
        Consulta de autenticidade no portal nacional da NF-e<br/>
        <strong>www.nfe.fazenda.gov.br/portal</strong> ou no site da Sefaz Autorizadora
      </div>
    </td>
  </tr>
</table>

<!-- NATUREZA DA OPERAÇÃO / PROTOCOLO (DIRETO DO XML) -->
<table class=""tbl-box border-top-none"">
  <tr>
    <td style=""width: 60%;"">
      <span class=""lbl"">NATUREZA DA OPERAÇÃO</span>
      <span class=""val"">{ide.natOp}</span>
    </td>
    <td style=""width: 40%;"">
      <span class=""lbl"">PROTOCOLO DE AUTORIZAÇÃO DE USO</span>
      <span class=""val text-center"">{(prot != null ? $"{prot.nProt} - {prot.dhRecbto:dd/MM/yyyy HH:mm:ss}" : "-")}</span>
    </td>
  </tr>
</table>

<!-- INSCRIÇÕES -->
<table class=""tbl-box border-top-none"">
  <tr>
    <td style=""width: 34%;"">
      <span class=""lbl"">INSCRIÇÃO ESTADUAL</span>
      <span class=""val text-center"">{emit.IE ?? "-"}</span>
    </td>
    <td style=""width: 33%;"">
      <span class=""lbl"">INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.</span>
      <span class=""val text-center"">{emit.IEST ?? "-"}</span>
    </td>
    <td style=""width: 33%;"">
      <span class=""lbl"">CNPJ</span>
      <span class=""val text-center"">{FormatCnpjCpf(emit.CNPJ ?? emit.CPF)}</span>
    </td>
  </tr>
</table>");

      // SEÇÕES DA FOLHA 1 (Destinatário, Cobrança, Impostos e Transporte)
      if (folhaAtual == 1)
      {
        // 3. DESTINATÁRIO / REMETENTE
        sb.Append($@"
<div class=""section-title"">DESTINATÁRIO / REMETENTE</div>
<table class=""tbl-box"">
  <tr>
    <td style=""width: 60%;"">
      <span class=""lbl"">NOME / RAZÃO SOCIAL</span>
      <span class=""val"">{dest?.xNome ?? "-"}</span>
    </td>
    <td style=""width: 25%;"">
      <span class=""lbl"">CNPJ / CPF</span>
      <span class=""val text-center"">{FormatCnpjCpf(dest?.CNPJ ?? dest?.CPF)}</span>
    </td>
    <td style=""width: 15%;"">
      <span class=""lbl"">DATA DA EMISSÃO</span>
      <span class=""val text-center"">{ide.dhEmi:dd/MM/yyyy}</span>
    </td>
  </tr>
</table>

<table class=""tbl-box border-top-none"">
  <tr>
    <td style=""width: 48%;"">
      <span class=""lbl"">ENDEREÇO</span>
      <span class=""val val-sm"">{dest?.enderDest?.xLgr}, {dest?.enderDest?.nro} {dest?.enderDest?.xCpl ?? ""}</span>
    </td>
    <td style=""width: 26%;"">
      <span class=""lbl"">BAIRRO / DISTRITO</span>
      <span class=""val val-sm"">{dest?.enderDest?.xBairro ?? "-"}</span>
    </td>
    <td style=""width: 11%;"">
      <span class=""lbl"">CEP</span>
      <span class=""val val-sm text-center"">{FormatCep(dest?.enderDest?.CEP)}</span>
    </td>
    <td style=""width: 15%;"">
      <span class=""lbl"">DATA DA SAÍDA</span>
      <span class=""val text-center"">{(ide.dhSaiEnt.HasValue ? ide.dhSaiEnt.Value.ToString("dd/MM/yyyy") : ide.dhEmi.ToString("dd/MM/yyyy"))}</span>
    </td>
  </tr>
</table>

<table class=""tbl-box border-top-none"">
  <tr>
    <td style=""width: 40%;"">
      <span class=""lbl"">MUNICÍPIO</span>
      <span class=""val val-sm"">{dest?.enderDest?.xMun ?? "-"}</span>
    </td>
    <td style=""width: 5%;"">
      <span class=""lbl"">UF</span>
      <span class=""val text-center"">{dest?.enderDest?.UF ?? "-"}</span>
    </td>
    <td style=""width: 20%;"">
      <span class=""lbl"">FONE / FAX</span>
      <span class=""val val-sm text-center"">{FormatFone(dest?.enderDest?.fone?.ToString())}</span>
    </td>
    <td style=""width: 20%;"">
      <span class=""lbl"">INSCRIÇÃO ESTADUAL</span>
      <span class=""val val-sm text-center"">{dest?.IE ?? "ISENTO"}</span>
    </td>
    <td style=""width: 15%;"">
      <span class=""lbl"">HORA DA SAÍDA</span>
      <span class=""val text-center"">{(ide.dhSaiEnt.HasValue ? ide.dhSaiEnt.Value.ToString("HH:mm:ss") : ide.dhEmi.ToString("HH:mm:ss"))}</span>
    </td>
  </tr>
</table>");

        // FATURA / DUPLICATAS (Com Card de Fatura Y07 e Supressão Inteligente - MOC 3.1.6 e 3.3.2)
        if (exibirQuadroCobranca)
        {
          sb.Append(@"
<div class=""section-title"">FATURA / DUPLICATAS</div>
<div class=""duplicatas-wrapper"">");

          // Card da Fatura (Grupo Y07)
          if (temFatura && fatura != null)
          {
            sb.Append($@"
<div class=""fatura-card"">
  <span class=""lbl"">DADOS DA FATURA</span>
  <span class=""val val-sm"">Nº: <strong>{fatura.nFat ?? "-"}</strong></span>
  <span class=""val val-sm"">V. ORIG: R$ {FormatMoney(fatura.vOrig)}</span>
  <span class=""val val-sm"">V. LÍQ: <strong>R$ {FormatMoney(fatura.vLiq)}</strong></span>
</div>");
          }

          // Cards das Duplicatas
          if (temDuplicatas && duplicatas != null)
          {
            foreach (var dup in duplicatas)
            {
              sb.Append($@"
<div class=""dup-card"">
  <span class=""lbl"">DÚP: {dup.nDup}</span>
  <span class=""val val-sm"">VENC: {dup.dVenc:dd/MM/yyyy}</span>
  <span class=""val text-right"" style=""font-size: 7pt;"">R$ {FormatMoney(dup.vDup)}</span>
</div>");
            }
          }

          sb.Append("</div>");
        }

        // 4. CÁLCULO DO IMPOSTO
        sb.Append($@"
<div class=""section-title"">CÁLCULO DO IMPOSTO</div>
<table class=""tbl-box"">
  <tr>
    <td style=""width: 18%;"">
      <span class=""lbl"">BASE DE CÁLCULO DO ICMS</span>
      <span class=""val text-right"">{FormatMoney(total?.vBC)}</span>
    </td>
    <td style=""width: 18%;"">
      <span class=""lbl"">VALOR DO ICMS</span>
      <span class=""val text-right"">{FormatMoney(total?.vICMS)}</span>
    </td>
    <td style=""width: 18%;"">
      <span class=""lbl"">BASE CÁLC. ICMS S.T.</span>
      <span class=""val text-right"">{FormatMoney(total?.vBCST)}</span>
    </td>
    <td style=""width: 18%;"">
      <span class=""lbl"">VALOR ICMS S.T.</span>
      <span class=""val text-right"">{FormatMoney(total?.vST)}</span>
    </td>
    <td style=""width: 28%;"">
      <span class=""lbl"">VALOR TOTAL DOS PRODUTOS</span>
      <span class=""val text-right"">{FormatMoney(total?.vProd)}</span>
    </td>
  </tr>
</table>

<table class=""tbl-box border-top-none"">
  <tr>
    <td style=""width: 16%;"">
      <span class=""lbl"">VALOR DO FRETE</span>
      <span class=""val text-right"">{FormatMoney(total?.vFrete)}</span>
    </td>
    <td style=""width: 16%;"">
      <span class=""lbl"">VALOR DO SEGURO</span>
      <span class=""val text-right"">{FormatMoney(total?.vSeg)}</span>
    </td>
    <td style=""width: 16%;"">
      <span class=""lbl"">DESCONTO</span>
      <span class=""val text-right"">{FormatMoney(total?.vDesc)}</span>
    </td>
    <td style=""width: 16%;"">
      <span class=""lbl"">OUTRAS DESPESAS</span>
      <span class=""val text-right"">{FormatMoney(total?.vOutro)}</span>
    </td>
    <td style=""width: 16%;"">
      <span class=""lbl"">VALOR DO IPI</span>
      <span class=""val text-right"">{FormatMoney(total?.vIPI)}</span>
    </td>
    <td class=""bg-header"" style=""width: 20%;"">
      <span class=""lbl"">VALOR TOTAL DA NOTA</span>
      <span class=""val text-right"" style=""font-size: 9pt;"">{FormatMoney(total?.vNF)}</span>
    </td>
  </tr>
</table>

<!-- 5. TRANSPORTADOR / VOLUMES TRANSPORTADOS -->
<div class=""section-title"">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
<table class=""tbl-box"">
  <tr>
    <td style=""width: 36%;"">
      <span class=""lbl"">RAZÃO SOCIAL</span>
      <span class=""val"">{transp?.transporta?.xNome ?? "-"}</span>
    </td>
    <td style=""width: 18%;"">
      <span class=""lbl"">FRETE POR CONTA</span>
      <span class=""val text-center val-sm"">{FormatFrete(transp?.modFrete)}</span>
    </td>
    <td style=""width: 12%;"">
      <span class=""lbl"">CÓDIGO ANTT</span>
      <span class=""val text-center val-sm"">{transp?.veicTransp?.RNTC ?? "-"}</span>
    </td>
    <td style=""width: 10%;"">
      <span class=""lbl"">PLACA VEÍCULO</span>
      <span class=""val text-center"">{transp?.veicTransp?.placa ?? "-"}</span>
    </td>
    <td style=""width: 4%;"">
      <span class=""lbl"">UF</span>
      <span class=""val text-center"">{transp?.veicTransp?.UF ?? "-"}</span>
    </td>
    <td style=""width: 20%;"">
      <span class=""lbl"">CNPJ / CPF</span>
      <span class=""val text-center"">{FormatCnpjCpf(transp?.transporta?.CNPJ ?? transp?.transporta?.CPF)}</span>
    </td>
  </tr>
</table>

<table class=""tbl-box border-top-none"">
  <tr>
    <td style=""width: 50%;"">
      <span class=""lbl"">ENDEREÇO</span>
      <span class=""val val-sm"">{transp?.transporta?.xEnder ?? "-"}</span>
    </td>
    <td style=""width: 26%;"">
      <span class=""lbl"">MUNICÍPIO</span>
      <span class=""val val-sm"">{transp?.transporta?.xMun ?? "-"}</span>
    </td>
    <td style=""width: 4%;"">
      <span class=""lbl"">UF</span>
      <span class=""val text-center"">{transp?.transporta?.UF ?? "-"}</span>
    </td>
    <td style=""width: 20%;"">
      <span class=""lbl"">INSCRIÇÃO ESTADUAL</span>
      <span class=""val val-sm text-center"">{transp?.transporta?.IE ?? "-"}</span>
    </td>
  </tr>
</table>");

        var vol = transp?.vol?.FirstOrDefault();
        sb.Append($@"
<table class=""tbl-box border-top-none"">
  <tr>
    <td style=""width: 12%;"">
      <span class=""lbl"">QUANTIDADE</span>
      <span class=""val text-center"">{vol?.qVol?.ToString() ?? "0"}</span>
    </td>
    <td style=""width: 20%;"">
      <span class=""lbl"">ESPÉCIE</span>
      <span class=""val val-sm"">{vol?.esp ?? "-"}</span>
    </td>
    <td style=""width: 16%;"">
      <span class=""lbl"">MARCA</span>
      <span class=""val val-sm"">{vol?.marca ?? "-"}</span>
    </td>
    <td style=""width: 16%;"">
      <span class=""lbl"">NUMERAÇÃO</span>
      <span class=""val val-sm"">{vol?.nVol ?? "-"}</span>
    </td>
    <td style=""width: 18%;"">
      <span class=""lbl"">PESO BRUTO</span>
      <span class=""val text-right"">{FormatWeight(vol?.pesoB)}</span>
    </td>
    <td style=""width: 18%;"">
      <span class=""lbl"">PESO LÍQUIDO</span>
      <span class=""val text-right"">{FormatWeight(vol?.pesoL)}</span>
    </td>
  </tr>
</table>");
      }

      sb.Append("</div>"); // fecha danfe-top

      // ==========================================
      // BLOCO CENTRAL: TABELA DOS PRODUTOS
      // ==========================================
      sb.Append($@"
<div class=""danfe-middle"">
  <div class=""section-title"">DADOS DOS PRODUTOS / SERVIÇOS {(folhaAtual > 1 ? "(CONTINUAÇÃO)" : "")}</div>
  <table class=""tbl-itens"">
    <thead>
      <tr>
        <th style=""width: 7.5%;"">CÓDIGO</th>
        <th style=""width: 29.5%; text-align: left; padding-left: 3px;"">DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
        <th style=""width: 6.5%;"">NCM/SH</th>
        <th style=""width: 3.5%;"">CST</th>
        <th style=""width: 3.5%;"">CFOP</th>
        <th style=""width: 3.0%;"">UN</th>
        <th style=""width: 7.5%; text-align: right; padding-right: 2px;"">QUANT.</th>
        <th style=""width: 6.5%; text-align: right; padding-right: 2px;"">V. UNIT.</th>
        <th style=""width: 7.5%; text-align: right; padding-right: 2px;"">V. TOTAL</th>
        <th style=""width: 6.0%; text-align: right; padding-right: 2px;"">BC ICMS</th>
        <th style=""width: 5.5%; text-align: right; padding-right: 2px;"">V. ICMS</th>
        <th style=""width: 4.5%; text-align: right; padding-right: 2px;"">V. IPI</th>
        <th style=""width: 4.5%;"">ALÍQ.<br/>ICMS</th>
        <th style=""width: 4.5%;"">ALÍQ.<br/>IPI</th>
      </tr>
    </thead>
    <tbody>");

      for (int i = 0; i < pageItems.Count; i++)
      {
        var det = pageItems[i];
        var prod = det.prod;
        var icmsData = ExtrairIcms(det.imposto?.ICMS);
        var ipiData = ExtrairIpi(det.imposto?.IPI);

        // Alternância por sombreamento para destaque divisório (MOC 3.1.7)
        string rowClass = (i % 2 == 1) ? "class=\"item-shaded\"" : "";

        sb.Append($@"
      <tr {rowClass}>
        <td class=""text-center"">{prod.cProd}</td>
        <td>
          <div style=""font-size: 6.8pt; font-weight: bold;"">{prod.xProd}</div>
          {(!string.IsNullOrWhiteSpace(det.infAdProd) ? $"<div style=\"font-size: 5.8pt; margin-top: 1px;\">{det.infAdProd}</div>" : "")}
        </td>
        <td class=""text-center"">{prod.NCM}</td>
        <td class=""text-center""><strong>{icmsData.Cst}</strong></td>
        <td class=""text-center""><strong>{prod.CFOP}</strong></td>
        <td class=""text-center"">{prod.uCom}</td>
        <td class=""text-right"">{FormatQuantity(prod.qCom)}</td>
        <td class=""text-right"">{FormatMoney(prod.vUnCom)}</td>
        <td class=""text-right""><strong>{FormatMoney(prod.vProd)}</strong></td>
        <td class=""text-right"">{FormatMoney(icmsData.BaseCalculo)}</td>
        <td class=""text-right"">{FormatMoney(icmsData.Valor)}</td>
        <td class=""text-right"">{FormatMoney(ipiData.Valor)}</td>
        <td class=""text-center"">{(icmsData.Aliquota > 0 ? $"{icmsData.Aliquota:N0}%" : "-")}</td>
        <td class=""text-center"">{(ipiData.Aliquota > 0 ? $"{ipiData.Aliquota:N0}%" : "-")}</td>
      </tr>");
      }

      if (folhaAtual < totalPages)
      {
        sb.Append(@"<tr><td colspan=""14"" class=""text-center"" style=""font-style: italic; font-size: 6pt; padding: 4px;"">CONTINUA NA FOLHA SEGUINTE...</td></tr>");
      }

      sb.Append(@"
    </tbody>
  </table>
</div>"); // fecha danfe-middle

      // ==========================================
      // BLOCO INFERIOR: DADOS ADICIONAIS + RODAPÉ
      // (Empurrado para a base da folha via flexbox)
      // ==========================================
      sb.Append(@"<div class=""danfe-bottom"">");

      // 7. DADOS ADICIONAIS (Apenas na Última Folha - MOC 3.8.1: 12,95 cm x 7,62 cm)
      if (folhaAtual == totalPages)
      {
        sb.Append($@"
  <div class=""section-title"">DADOS ADICIONAIS</div>
  <table class=""tbl-adicionais"">
    <tr>
      <td style=""width: 63%;"">
        <span class=""lbl"">INFORMAÇÕES COMPLEMENTARES</span>
        <div class=""inf-cpl-content"">{infCplLimpo}</div>
      </td>
      <td style=""width: 37%;"">
        <span class=""lbl"">RESERVADO AO FISCO</span>
        <div class=""fisco-content"">{infFiscoLimpo}</div>
      </td>
    </tr>
  </table>");
      }

      // RODAPÉ: DATA/HORA DE IMPRESSÃO (UTC-3) E RESPONSÁVEL TÉCNICO (SEM REDUNDÂNCIA DA FOLHA)
      sb.Append($@"
  <table style=""width: 100%; border-collapse: collapse; margin-top: 3px;"">
    <tr>
      <td style=""border: none; font-size: 5pt; color: #000000; padding: 0; text-align: left;"">
        Impresso em {dataImpressao:dd/MM/yyyy HH:mm:ss}
      </td>
      <td style=""border: none; font-size: 5pt; color: #000000; padding: 0; text-align: right;"">
        {respTecInfo}
      </td>
    </tr>
  </table>
</div>"); // fecha danfe-bottom

      sb.Append(@"</div>"); // fecha danfe-sheet
    }

    sb.Append(@"
</body>
</html>");

    return sb.ToString();
  }

  private static string GerarCodigo128Svg(string chave)
  {
    var digits = Regex.Replace(chave ?? "", @"\D", "");
    if (digits.Length != 44) digits = digits.PadLeft(44, '0');

    var patterns = new string[]
    {
            "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
            "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
            "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
            "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
            "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
            "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
            "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
            "112412","122114","122411","142112","142211","241211","221114","411112","421111","212114",
            "214112","214211","411212","421112","421211","212141","214121","412121","111143","111341",
            "131141","114113","114311","411113","411311","113141","114131","311141","411131","211412",
            "211214","211232","211322","211412","211214","211232","2331112"
    };

    var codeList = new List<int> { 105 }; // Start C
    int checksum = 105;
    int weight = 1;

    for (int i = 0; i < digits.Length; i += 2)
    {
      int val = int.Parse(digits.Substring(i, 2));
      codeList.Add(val);
      checksum += val * weight;
      weight++;
    }

    checksum %= 103;
    codeList.Add(checksum);
    codeList.Add(106); // Stop

    // Margem clara regulamentar: 10 módulos à esquerda e 10 à direita = 297 módulos no total (MOC 7.0 Item 2)
    const int quietZone = 10;
    int totalWidth = quietZone * 2;
    foreach (var code in codeList)
    {
      var pat = patterns[code];
      foreach (char ch in pat) totalWidth += (ch - '0');
    }

    var sbSvg = new StringBuilder();
    sbSvg.Append($@"<svg xmlns=""http://www.w3.org/2000/svg"" viewBox=""0 0 {totalWidth} 50"" preserveAspectRatio=""none"" style=""width: 100%; height: 100%; display: block;"" shape-rendering=""crispEdges"">");
    sbSvg.Append(@"<rect width=""100%"" height=""100%"" fill=""#ffffff""/>");

    int x = quietZone;
    foreach (var code in codeList)
    {
      var pat = patterns[code];
      bool isBar = true;
      foreach (char ch in pat)
      {
        int w = ch - '0';
        if (isBar)
        {
          sbSvg.Append($@"<rect x=""{x}"" y=""0"" width=""{w}"" height=""50"" fill=""#000000""/>");
        }
        x += w;
        isBar = !isBar;
      }
    }
    sbSvg.Append("</svg>");
    return sbSvg.ToString();
  }

  private static string FormatChaveAcesso(string key)
  {
    if (string.IsNullOrWhiteSpace(key) || key.Length != 44) return key;
    return Regex.Replace(key, ".{4}", "$0 ").Trim();
  }

  private static string FormatCnpjCpf(string? doc)
  {
    if (string.IsNullOrWhiteSpace(doc)) return "-";
    var clean = Regex.Replace(doc, @"\D", "");
    if (clean.Length == 14)
      return $"{clean[..2]}.{clean.Substring(2, 3)}.{clean.Substring(5, 3)}/{clean.Substring(8, 4)}-{clean.Substring(12, 2)}";
    if (clean.Length == 11)
      return $"{clean[..3]}.{clean.Substring(3, 3)}.{clean.Substring(6, 3)}-{clean.Substring(9, 2)}";
    return doc;
  }

  private static string FormatCep(string? cep)
  {
    if (string.IsNullOrWhiteSpace(cep)) return "-";
    var clean = Regex.Replace(cep, @"\D", "");
    return clean.Length == 8 ? $"{clean[..5]}-{clean.Substring(5, 3)}" : cep;
  }

  private static string FormatFone(string? value)
  {
    if (string.IsNullOrWhiteSpace(value)) return "";
    var digits = Regex.Replace(value, @"\D", "");
    if (digits.Length == 10) return Convert.ToUInt64(digits).ToString(@"\(00\) 0000\-0000");
    if (digits.Length == 11) return Convert.ToUInt64(digits).ToString(@"\(00\) 00000\-0000");
    return value;
  }

  private static string FormatMoney(decimal? val) => (val ?? 0m).ToString("N2", PtBrCulture);
  private static string FormatQuantity(decimal? val) => (val ?? 0m).ToString("N4", PtBrCulture);
  private static string FormatWeight(decimal? val) => (val ?? 0m).ToString("N3", PtBrCulture);

  private static string FormatFrete(ModalidadeFrete? mod) => mod switch
  {
    ModalidadeFrete.mfContaEmitenteOumfContaRemetente => "0 - Remetente (CIF)",
    ModalidadeFrete.mfContaDestinatario => "1 - Destinatário (FOB)",
    ModalidadeFrete.mfContaTerceiros => "2 - Terceiros",
    ModalidadeFrete.mfProprioContaRemente => "3 - Próprio Remetente",
    ModalidadeFrete.mfProprioContaDestinatario => "4 - Próprio Destinatário",
    _ => "9 - Sem Frete"
  };

  private static (string Cst, decimal BaseCalculo, decimal Aliquota, decimal Valor) ExtrairIcms(NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual.ICMS? icms)
  {
    if (icms?.TipoICMS == null) return ("-", 0, 0, 0);
    var t = icms.TipoICMS;

    if (t is ICMS00 i00) return (i00.CST.ToString().Replace("Cst", ""), i00.vBC, i00.pICMS, i00.vICMS);
    if (t is ICMS10 i10) return (i10.CST.ToString().Replace("Cst", ""), i10.vBC, i10.pICMS, i10.vICMS);
    if (t is ICMS20 i20) return (i20.CST.ToString().Replace("Cst", ""), i20.vBC, i20.pICMS, i20.vICMS);
    if (t is ICMS40 i40) return (i40.CST.ToString().Replace("Cst", ""), 0, 0, 0);
    if (t is ICMS51 i51) return (i51.CST.ToString().Replace("Cst", ""), i51.vBC ?? 0, i51.pICMS ?? 0, i51.vICMS ?? 0);
    if (t is ICMS60) return ("60", 0, 0, 0);
    if (t is ICMS70 i70) return (i70.CST.ToString().Replace("Cst", ""), i70.vBC, i70.pICMS, i70.vICMS);
    if (t is ICMS90 i90) return (i90.CST.ToString().Replace("Cst", ""), i90.vBC ?? 0, i90.pICMS ?? 0, i90.vICMS ?? 0);
    if (t is ICMSSN101 s101) return ("101", 0, s101.pCredSN, s101.vCredICMSSN);
    if (t is ICMSSN102 s102) return (((int)s102.CSOSN).ToString(), 0, 0, 0);
    if (t is ICMSSN500) return ("500", 0, 0, 0);
    if (t is ICMSSN900 s900) return ("900", s900.vBC ?? 0, s900.pICMS ?? 0, s900.vICMS ?? 0);

    return ("-", 0, 0, 0);
  }

  private static (decimal Aliquota, decimal Valor) ExtrairIpi(NFe.Classes.Informacoes.Detalhe.Tributacao.Federal.IPI? ipi)
  {
    if (ipi?.TipoIPI is IPITrib trib)
    {
      return (trib.pIPI ?? 0, trib.vIPI ?? 0);
    }
    return (0, 0);
  }
}