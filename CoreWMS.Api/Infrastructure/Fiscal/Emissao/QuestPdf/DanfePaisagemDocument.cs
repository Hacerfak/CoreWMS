using NFe.Classes;
using NFe.Classes.Informacoes.Detalhe.Tributacao;
using NFe.Classes.Informacoes.Transporte;
using NFe.Classes.Informacoes.Identificacao.Tipos;
using NFe.Utils;
using NFe.Utils.Tributacao.Estadual;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.Text;
using System.Text.RegularExpressions;

namespace CoreWMS.Api.Infrastructure.Fiscal.Emissao.QuestPdf;

public class DanfePaisagemDocument : IDocument
{
    private readonly nfeProc _nfe;
    private readonly byte[]? _logoBytes;

    public DanfePaisagemDocument(nfeProc nfe, byte[]? logoBytes = null)
    {
        _nfe = nfe;
        _logoBytes = logoBytes;
    }

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4.Landscape());
            page.Margin(4, Unit.Millimetre);
            page.PageColor(Colors.White);
            page.DefaultTextStyle(x => x.FontSize(6).FontFamily("Lato").LineHeight(1.1f));

            page.Header().Element(ComposeHeader);
            page.Content().Element(ComposeContent);
            page.Footer().Element(ComposeFooter);
        });
    }

    private void ComposeHeader(IContainer container)
    {
        var ide = _nfe.NFe.infNFe.ide;
        var emit = _nfe.NFe.infNFe.emit;
        var dest = _nfe.NFe.infNFe.dest;
        string chaveAcesso = _nfe.NFe.infNFe.Id.Replace("NFe", "");
        bool isHomologacao = ide.tpAmb == DFe.Classes.Flags.TipoAmbiente.Homologacao;

        container.Column(col =>
        {
            // AVISO DE HOMOLOGAÇÃO
            if (isHomologacao)
            {
                col.Item().Background(Colors.Grey.Lighten3).Border(0.5f).Padding(2).AlignCenter()
                   .Text("NF-E EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL").Bold().FontSize(7).FontColor(Colors.Red.Medium);
            }

            // MODO PAISAGEM MOC 7.0 (ANEXO III.04): CANHOTO LATERAL ESQUERDO
            col.Item().Row(topRow =>
            {
                // 1. CANHOTO LATERAL ESQUERDO (Altura delimitada em 138pt)
                topRow.ConstantItem(26).ShowOnce().Height(138).Border(0.5f).BorderColor(Colors.Black).RotateLayoutCounterclockwise().Row(r =>
                {
                    // Bloco de Data e Assinatura (Fica na BASE da coluna vertical)
                    r.ConstantItem(48).BorderRight(0.5f).Padding(1).Column(c =>
                    {
                        c.Item().Text("DATA DE RECEBIMENTO").FontSize(3.5f).Bold();
                        c.Item().PaddingTop(4).Text("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR").FontSize(3.5f).Bold();
                    });

                    // Bloco do Recebimento (Fica no MEIO da coluna vertical)
                    r.RelativeItem().BorderRight(0.5f).Padding(1.5f).Column(c =>
                    {
                        c.Item().Text($"RECEBEMOS DE {emit.xNome?.ToUpper()} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO").FontSize(3.5f).LineHeight(0.95f);
                    });

                    // Bloco de Identificação da NF-e (Fica no TOPO da coluna vertical)
                    r.ConstantItem(38).Padding(1).AlignCenter().Column(c =>
                    {
                        c.Item().Text("NF-e").Bold().FontSize(7).AlignCenter();
                        c.Item().Text($"Nº {ide.nNF:000\\.000\\.000}").Bold().FontSize(5).AlignCenter();
                        c.Item().Text($"SÉRIE {ide.serie:000}").Bold().FontSize(5).AlignCenter();
                    });
                });

                topRow.ConstantItem(3).ShowOnce(); // Espaçamento de 3pt entre o canhoto e a DANFE

                // 2. CORPO PRINCIPAL DO CABEÇALHO + DESTINATÁRIO
                topRow.RelativeItem().Column(mainCol =>
                {
                    // Bloco Emitente / DANFE / Chave
                    mainCol.Item().Border(0.5f).BorderColor(Colors.Black).Row(row =>
                    {
                        // Emitente + Logo
                        row.RelativeItem(4.5f).Padding(2).Column(c =>
                        {
                            c.Item().Text("IDENTIFICAÇÃO DO EMITENTE").FontSize(4).Bold();

                            c.Item().PaddingTop(2).Row(r =>
                            {
                                if (_logoBytes != null && _logoBytes.Length > 0)
                                {
                                    r.ConstantItem(60).MaxHeight(36).Image(_logoBytes);
                                }

                                r.RelativeItem().PaddingLeft(3).Column(emitCol =>
                                {
                                    emitCol.Item().Text(emit.xNome).Bold().FontSize(7.5f);
                                    emitCol.Item().Text($"{emit.enderEmit?.xLgr}, {emit.enderEmit?.nro}{(string.IsNullOrEmpty(emit.enderEmit?.xCpl) ? "" : " - " + emit.enderEmit?.xCpl)}");
                                    emitCol.Item().Text($"{emit.enderEmit?.xBairro} - CEP: {FormatCep(emit.enderEmit?.CEP)}");
                                    emitCol.Item().Text($"{emit.enderEmit?.xMun} - {emit.enderEmit?.UF}");
                                    if (!string.IsNullOrEmpty(emit.enderEmit?.fone?.ToString()))
                                        emitCol.Item().Text($"TEL: {FormatFone(emit.enderEmit?.fone?.ToString())}");
                                });
                            });
                        });

                        // Bloco DANFE
                        row.ConstantItem(120).BorderLeft(0.5f).BorderRight(0.5f).Padding(2).AlignCenter().Column(c =>
                        {
                            c.Item().Text("DANFE").Bold().FontSize(11).AlignCenter();
                            c.Item().Text("Documento Auxiliar da\nNota Fiscal Eletrônica").FontSize(4.5f).AlignCenter();
                            c.Item().PaddingTop(1).Row(r =>
                            {
                                r.RelativeItem().Text($"{(int)ide.tpNF} - {((int)ide.tpNF == 0 ? "ENTRADA" : "SAÍDA")}").Bold().FontSize(7).AlignCenter();
                            });
                            c.Item().Text($"Nº {ide.nNF:000\\.000\\.000}").Bold().FontSize(7).AlignCenter();
                            c.Item().Text($"SÉRIE {ide.serie:000}").Bold().FontSize(7).AlignCenter();

                            c.Item().AlignCenter().Text(x =>
                            {
                                x.Span("FOLHA ").FontSize(6);
                                x.CurrentPageNumber().FontSize(6).Bold();
                                x.Span(" / ").FontSize(6);
                                x.TotalPages().FontSize(6).Bold();
                            });
                        });

                        // Chave de Acesso
                        row.RelativeItem(5.5f).Padding(2).Column(c =>
                        {
                            c.Item().Text("CHAVE DE ACESSO").FontSize(4).Bold();
                            var chaveFormatada = string.Join(" ", Enumerable.Range(0, chaveAcesso.Length / 4).Select(i => chaveAcesso.Substring(i * 4, 4)));
                            c.Item().Text(chaveFormatada).Bold().FontSize(7.5f).AlignCenter();

                            c.Item().PaddingVertical(1).AlignCenter().MaxHeight(18).Svg(GerarCodigo128Svg(chaveAcesso));

                            c.Item().Text("Consulta de autenticidade no portal nacional da NF-e").AlignCenter().FontSize(4.5f);
                            c.Item().Text("www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora").AlignCenter().FontSize(4.5f);
                        });
                    });

                    // Natureza da Operação / Protocolo
                    mainCol.Item().Row(row =>
                    {
                        row.RelativeItem().Border(0.5f).BorderTop(0).Padding(2).Column(c =>
                        {
                            c.Item().Text("NATUREZA DA OPERAÇÃO").FontSize(4).Bold();
                            c.Item().Text(ide.natOp).Bold().FontSize(6.5f);
                        });
                        row.ConstantItem(260).Border(0.5f).BorderTop(0).BorderLeft(0).Padding(2).Column(c =>
                        {
                            c.Item().Text("PROTOCOLO DE AUTORIZAÇÃO DE USO").FontSize(4).Bold();
                            c.Item().Text($"{_nfe.protNFe?.infProt?.nProt} - {_nfe.protNFe?.infProt?.dhRecbto:dd/MM/yyyy HH:mm:ss}").Bold().FontSize(6.5f).AlignCenter();
                        });
                    });

                    // Inscrições
                    mainCol.Item().Row(row =>
                    {
                        row.RelativeItem().Border(0.5f).BorderTop(0).Padding(2).Column(c =>
                        {
                            c.Item().Text("INSCRIÇÃO ESTADUAL").FontSize(4).Bold();
                            c.Item().Text(emit.IE).FontSize(6.5f).AlignCenter();
                        });
                        row.RelativeItem().Border(0.5f).BorderTop(0).BorderLeft(0).Padding(2).Column(c =>
                        {
                            c.Item().Text("INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.").FontSize(4).Bold();
                            c.Item().Text(emit.IEST).FontSize(6.5f).AlignCenter();
                        });
                        row.RelativeItem().Border(0.5f).BorderTop(0).BorderLeft(0).Padding(2).Column(c =>
                        {
                            c.Item().Text("CNPJ").FontSize(4).Bold();
                            c.Item().Text(FormatCnpjCpf(emit.CNPJ ?? emit.CPF)).Bold().FontSize(6.5f).AlignCenter();
                        });
                    });

                    // Destinatário / Remetente
                    mainCol.Item().PaddingTop(2);
                    mainCol.Item().Text("DESTINATÁRIO / REMETENTE").FontSize(5).Bold();
                    mainCol.Item().Border(0.5f).Column(caixaDest =>
                    {
                        caixaDest.Item().Row(row =>
                        {
                            row.RelativeItem().Padding(2).Column(c =>
                            {
                                c.Item().Text("NOME / RAZÃO SOCIAL").FontSize(4).Bold();
                                c.Item().Text(dest?.xNome).Bold().FontSize(6.5f);
                            });
                            row.ConstantItem(180).BorderLeft(0.5f).Padding(2).Column(c =>
                            {
                                c.Item().Text("CNPJ / CPF").FontSize(4).Bold();
                                c.Item().Text(FormatCnpjCpf(dest?.CNPJ ?? dest?.CPF)).Bold().FontSize(6.5f).AlignCenter();
                            });
                            row.ConstantItem(90).BorderLeft(0.5f).Padding(2).Column(c =>
                            {
                                c.Item().Text("DATA DA EMISSÃO").FontSize(4).Bold();
                                c.Item().Text(ide.dhEmi.ToString("dd/MM/yyyy")).FontSize(6.5f).AlignCenter();
                            });
                        });
                        caixaDest.Item().BorderTop(0.5f).Row(row =>
                        {
                            row.RelativeItem().Padding(2).Column(c =>
                            {
                                c.Item().Text("ENDEREÇO").FontSize(4).Bold();
                                c.Item().Text($"{dest?.enderDest?.xLgr}, {dest?.enderDest?.nro}{(string.IsNullOrEmpty(dest?.enderDest?.xCpl) ? "" : " " + dest?.enderDest?.xCpl)}").FontSize(6);
                            });
                            row.ConstantItem(180).BorderLeft(0.5f).Padding(2).Column(c =>
                            {
                                c.Item().Text("BAIRRO / DISTRITO").FontSize(4).Bold();
                                c.Item().Text(dest?.enderDest?.xBairro).FontSize(6);
                            });
                            row.ConstantItem(90).BorderLeft(0.5f).Padding(2).Column(c =>
                            {
                                c.Item().Text("CEP").FontSize(4).Bold();
                                c.Item().Text(FormatCep(dest?.enderDest?.CEP)).FontSize(6).AlignCenter();
                            });
                            row.ConstantItem(90).BorderLeft(0.5f).Padding(2).Column(c =>
                            {
                                c.Item().Text("DATA SAÍDA / ENTRADA").FontSize(4).Bold();
                                c.Item().Text(ide.dhSaiEnt?.ToString("dd/MM/yyyy") ?? "").FontSize(6.5f).AlignCenter();
                            });
                        });
                        caixaDest.Item().BorderTop(0.5f).Row(row =>
                        {
                            row.RelativeItem().Padding(2).Column(c =>
                            {
                                c.Item().Text("MUNICÍPIO").FontSize(4).Bold();
                                c.Item().Text(dest?.enderDest?.xMun).FontSize(6);
                            });
                            row.ConstantItem(35).BorderLeft(0.5f).Padding(2).Column(c =>
                            {
                                c.Item().Text("UF").FontSize(4).Bold();
                                c.Item().Text(dest?.enderDest?.UF).FontSize(6).AlignCenter();
                            });
                            row.ConstantItem(145).BorderLeft(0.5f).Padding(2).Column(c =>
                            {
                                c.Item().Text("FONE / FAX").FontSize(4).Bold();
                                c.Item().Text(FormatFone(dest?.enderDest?.fone?.ToString())).FontSize(6).AlignCenter();
                            });
                            row.ConstantItem(130).BorderLeft(0.5f).Padding(2).Column(c =>
                            {
                                c.Item().Text("INSCRIÇÃO ESTADUAL").FontSize(4).Bold();
                                c.Item().Text(dest?.IE).FontSize(6).AlignCenter();
                            });
                            row.ConstantItem(90).BorderLeft(0.5f).Padding(2).Column(c =>
                            {
                                c.Item().Text("HORA DA SAÍDA").FontSize(4).Bold();
                                c.Item().Text(ide.dhSaiEnt?.ToString("HH:mm:ss") ?? "").FontSize(6.5f).AlignCenter();
                            });
                        });
                    });
                });
            });

            col.Item().PaddingTop(2);
        });
    }

    private void ComposeContent(IContainer container)
    {
        container.Column(col =>
        {
            var total = _nfe.NFe.infNFe.total.ICMSTot;
            var transp = _nfe.NFe.infNFe.transp;

            // 6. CÁLCULO DO IMPOSTO
            col.Item().Text("CÁLCULO DO IMPOSTO").FontSize(5).Bold();
            col.Item().Border(0.5f).Column(caixaImp =>
            {
                caixaImp.Item().Row(r =>
                {
                    r.RelativeItem().Padding(2).Column(c => { c.Item().Text("BASE DE CÁLC. DO ICMS").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vBC.ToString("N2")).AlignCenter().FontSize(6.5f); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("VALOR DO ICMS").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vICMS.ToString("N2")).AlignCenter().FontSize(6.5f); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("BASE CÁLC. ICMS S.T.").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vBCST.ToString("N2")).AlignCenter().FontSize(6.5f); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("VALOR ICMS S.T.").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vST.ToString("N2")).AlignCenter().FontSize(6.5f); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("VALOR TOTAL PRODUTOS").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vProd.ToString("N2")).AlignCenter().FontSize(6.5f); });
                });
                caixaImp.Item().BorderTop(0.5f).Row(r =>
                {
                    r.RelativeItem().Padding(2).Column(c => { c.Item().Text("VALOR DO FRETE").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vFrete.ToString("N2")).AlignCenter().FontSize(6.5f); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("VALOR DO SEGURO").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vSeg.ToString("N2")).AlignCenter().FontSize(6.5f); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("DESCONTO").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vDesc.ToString("N2")).AlignCenter().FontSize(6.5f); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("OUTRAS DESPESAS").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vOutro.ToString("N2")).AlignCenter().FontSize(6.5f); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("VALOR DO IPI").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vIPI.ToString("N2")).AlignCenter().FontSize(6.5f); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("VALOR TOTAL DA NOTA").FontSize(4).Bold().AlignCenter(); c.Item().Text(total.vNF.ToString("N2")).AlignCenter().Bold().FontSize(6.5f); });
                });
            });

            col.Item().PaddingTop(2);

            // 7. TRANSPORTADOR / VOLUMES
            col.Item().Text("TRANSPORTADOR / VOLUMES TRANSPORTADOS").FontSize(5).Bold();
            col.Item().Border(0.5f).Column(caixaTransp =>
            {
                caixaTransp.Item().Row(r =>
                {
                    r.RelativeItem(3).Padding(2).Column(c => { c.Item().Text("RAZÃO SOCIAL").FontSize(4).Bold(); c.Item().Text(transp.transporta?.xNome).FontSize(6); });
                    r.ConstantItem(130).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("FRETE POR CONTA").FontSize(4).Bold(); c.Item().Text(ObterDescricaoFrete(transp.modFrete)).FontSize(6).AlignCenter(); });
                    r.ConstantItem(80).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("CÓDIGO ANTT").FontSize(4).Bold(); c.Item().Text(transp.veicTransp?.RNTC).FontSize(6).AlignCenter(); });
                    r.ConstantItem(90).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("PLACA VEÍCULO").FontSize(4).Bold(); c.Item().Text(transp.veicTransp?.placa).FontSize(6).AlignCenter(); });
                    r.ConstantItem(30).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("UF").FontSize(4).Bold(); c.Item().Text(transp.veicTransp?.UF).FontSize(6).AlignCenter(); });
                    r.ConstantItem(130).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("CNPJ / CPF").FontSize(4).Bold(); c.Item().Text(FormatCnpjCpf(transp.transporta?.CNPJ ?? transp.transporta?.CPF)).FontSize(6).AlignCenter(); });
                });
                caixaTransp.Item().BorderTop(0.5f).Row(r =>
                {
                    r.RelativeItem(3).Padding(2).Column(c => { c.Item().Text("ENDEREÇO").FontSize(4).Bold(); c.Item().Text(transp.transporta?.xEnder).FontSize(6); });
                    r.ConstantItem(180).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("MUNICÍPIO").FontSize(4).Bold(); c.Item().Text(transp.transporta?.xMun).FontSize(6); });
                    r.ConstantItem(30).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("UF").FontSize(4).Bold(); c.Item().Text(transp.transporta?.UF).FontSize(6).AlignCenter(); });
                    r.ConstantItem(130).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("INSCRIÇÃO ESTADUAL").FontSize(4).Bold(); c.Item().Text(transp.transporta?.IE).FontSize(6).AlignCenter(); });
                });

                var vol = transp.vol?.FirstOrDefault();
                caixaTransp.Item().BorderTop(0.5f).Row(r =>
                {
                    r.ConstantItem(80).Padding(2).Column(c => { c.Item().Text("QUANTIDADE").FontSize(4).Bold(); c.Item().Text(vol?.qVol?.ToString() ?? "0").AlignCenter().FontSize(6); });
                    r.RelativeItem().BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("ESPÉCIE").FontSize(4).Bold(); c.Item().Text(vol?.esp).FontSize(6); });
                    r.ConstantItem(110).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("MARCA").FontSize(4).Bold(); c.Item().Text(vol?.marca).FontSize(6); });
                    r.ConstantItem(110).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("NUMERAÇÃO").FontSize(4).Bold(); c.Item().Text(vol?.nVol).FontSize(6); });
                    r.ConstantItem(110).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("PESO BRUTO").FontSize(4).Bold(); c.Item().Text(vol?.pesoB?.ToString("N3") ?? "0,000").AlignCenter().FontSize(6); });
                    r.ConstantItem(110).BorderLeft(0.5f).Padding(2).Column(c => { c.Item().Text("PESO LÍQUIDO").FontSize(4).Bold(); c.Item().Text(vol?.pesoL?.ToString("N3") ?? "0,000").AlignCenter().FontSize(6); });
                });
            });

            col.Item().PaddingTop(2);

            // 8. DADOS DOS PRODUTOS / SERVIÇOS
            col.Item().Text("DADOS DOS PRODUTOS / SERVIÇOS").FontSize(5).Bold();
            col.Item().Border(0.5f).Table(t =>
            {
                t.ColumnsDefinition(c =>
                {
                    c.ConstantColumn(60);
                    c.RelativeColumn();
                    c.ConstantColumn(45);
                    c.ConstantColumn(25);
                    c.ConstantColumn(25);
                    c.ConstantColumn(22);
                    c.ConstantColumn(55);
                    c.ConstantColumn(55);
                    c.ConstantColumn(60);
                    c.ConstantColumn(55);
                    c.ConstantColumn(55);
                    c.ConstantColumn(50);
                    c.ConstantColumn(25);
                    c.ConstantColumn(25);
                });

                t.Header(h =>
                {
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("CÓDIGO").FontSize(4).Bold().AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("DESCRIÇÃO DO PRODUTO / SERVIÇO").FontSize(4).Bold();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("NCM/SH").FontSize(4).Bold().AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("CST").FontSize(4).Bold().AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("CFOP").FontSize(4).Bold().AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("UN").FontSize(4).Bold().AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("QUANT.").FontSize(4).Bold().AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("V. UNIT").FontSize(4).Bold().AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("V. TOTAL").FontSize(4).Bold().AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("BC ICMS").FontSize(4).Bold().AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("V. ICMS").FontSize(4).Bold().AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("V. IPI").FontSize(4).Bold().AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).Padding(1.5f).Text("ALÍQ ICMS").FontSize(4).Bold().AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).Padding(1.5f).Text("ALÍQ IPI").FontSize(4).Bold().AlignCenter();
                });

                foreach (var det in _nfe.NFe.infNFe.det)
                {
                    var icms = det.imposto?.ICMS?.TipoICMS;
                    var ipi = det.imposto?.IPI?.TipoIPI;
                    string cstStr = ""; decimal bcIcms = 0; decimal vIcms = 0; decimal pIcms = 0;
                    decimal vIpi = 0; decimal pIpi = 0;

                    if (icms is NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual.Tipos.ICMSBasico bIcms)
                    {
                        var cstVal = bIcms.GetIcmsCst();
                        var csosnVal = bIcms.GetIcmsCsosn();
                        if (cstVal != 0)
                            cstStr = cstVal.CsticmsParaString();
                        else if (csosnVal != 0)
                            cstStr = csosnVal.CsosnicmsParaString();

                        bcIcms = bIcms.GetIcmsBcValue();
                        vIcms = bIcms.GetIcmsValue();
                        pIcms = bIcms.GetIcmsPercent();
                    }

                    if (ipi is NFe.Classes.Informacoes.Detalhe.Tributacao.Federal.Tipos.IPIBasico bIpi)
                    {
                        vIpi = bIpi.GetIpiValue();
                        pIpi = bIpi.GetIpiPercent();
                    }

                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(det.prod.cProd).FontSize(5.5f).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(det.prod.xProd + (string.IsNullOrEmpty(det.infAdProd) ? "" : $"\n{det.infAdProd}")).FontSize(5.5f);
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(det.prod.NCM).FontSize(5.5f).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(cstStr).FontSize(5.5f).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(det.prod.CFOP.ToString()).FontSize(5.5f).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(det.prod.uCom).FontSize(5.5f).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(det.prod.qCom.ToString("N4")).FontSize(5.5f).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(det.prod.vUnCom.ToString("N4")).FontSize(5.5f).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(det.prod.vProd.ToString("N2")).FontSize(5.5f).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(bcIcms.ToString("N2")).FontSize(5.5f).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(vIcms.ToString("N2")).FontSize(5.5f).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(vIpi.ToString("N2")).FontSize(5.5f).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(pIcms.ToString("N2")).FontSize(5.5f).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(1.5f).Text(pIpi.ToString("N2")).FontSize(5.5f).AlignCenter();
                }
            });
        });
    }

    private void ComposeFooter(IContainer container)
    {
        var infAdic = _nfe.NFe.infNFe.infAdic;

        container.Column(col =>
        {
            col.Item().PaddingTop(3).Text("DADOS ADICIONAIS").FontSize(5).Bold();
            col.Item().Row(r =>
            {
                r.RelativeItem().Border(0.5f).Padding(2).MinHeight(50).Column(c =>
                {
                    c.Item().Text("INFORMAÇÕES COMPLEMENTARES").FontSize(4).Bold();
                    c.Item().Text($"{infAdic?.infCpl}\n{infAdic?.infAdFisco}").FontSize(5.5f);
                });
                r.ConstantItem(300).Border(0.5f).BorderLeft(0).Padding(2).MinHeight(50).Column(c =>
                {
                    c.Item().Text("RESERVADO AO FISCO").FontSize(4).Bold();
                });
            });

            col.Item().PaddingTop(2).Row(r =>
            {
                r.RelativeItem().Text($"Impresso em {DateTime.Now:dd/MM/yyyy HH:mm:ss}").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                r.RelativeItem().AlignRight().Text("Powered by CoreWMS - Eder Gross Cichelero").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
            });
        });
    }

    private string ObterDescricaoFrete(ModalidadeFrete? modFrete)
    {
        return modFrete switch
        {
            ModalidadeFrete.mfContaEmitenteOumfContaRemetente => "0 - Remetente (CIF)",
            ModalidadeFrete.mfContaDestinatario => "1 - Destinatário (FOB)",
            ModalidadeFrete.mfContaTerceiros => "2 - Terceiros",
            ModalidadeFrete.mfProprioContaRemente => "3 - Próprio Remetente",
            ModalidadeFrete.mfProprioContaDestinatario => "4 - Próprio Destinatário",
            ModalidadeFrete.mfSemFrete => "9 - Sem Frete",
            _ => "9 - Sem Frete"
        };
    }

    private string FormatCnpjCpf(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var digits = Regex.Replace(value, @"\D", "");
        if (digits.Length == 11) return Convert.ToUInt64(digits).ToString(@"000\.000\.000\-00");
        if (digits.Length == 14) return Convert.ToUInt64(digits).ToString(@"00\.000\.000\/0000\-00");
        return value;
    }

    private string FormatCep(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var digits = Regex.Replace(value, @"\D", "");
        if (digits.Length == 8) return Convert.ToUInt64(digits).ToString(@"00000\-000");
        return value;
    }

    private string FormatFone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var digits = Regex.Replace(value, @"\D", "");
        if (digits.Length == 10) return Convert.ToUInt64(digits).ToString(@"\(00\) 0000\-0000");
        if (digits.Length == 11) return Convert.ToUInt64(digits).ToString(@"\(00\) 00000\-0000");
        return value;
    }

    private string GerarCodigo128Svg(string chave)
    {
        var digits = Regex.Replace(chave ?? "", @"\D", "");
        if (digits.Length % 2 != 0) digits = "0" + digits;

        var patterns = new string[]
        {
            "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
            "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
            "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
            "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
            "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
            "231131","213113","213311","213131","311123","311321","331121","312113","332111","312311",
            "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
            "112412","122114","122411","142112","142211","241211","221114","411112","421111","212114",
            "214112","214211","411212","421112","421211","212141","214121","412121","111143","111341",
            "131141","114113","114311","411113","411311","113141","114131","311141","411131","211412",
            "211214","211232","211322","211412","211214","211232","2331112"
        };

        var codeList = new List<int> { 105 };
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
        codeList.Add(106);

        int totalWidth = 0;
        foreach (var code in codeList)
        {
            var pat = patterns[code];
            foreach (char ch in pat) totalWidth += (ch - '0');
        }

        var sbSvg = new StringBuilder();
        sbSvg.Append($"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {totalWidth} 48\" preserveAspectRatio=\"none\" width=\"100%\" height=\"100%\">");
        sbSvg.Append("<rect width=\"100%\" height=\"100%\" fill=\"white\"/>");

        int x = 0;
        foreach (var code in codeList)
        {
            var pat = patterns[code];
            bool isBar = true;
            foreach (char ch in pat)
            {
                int w = ch - '0';
                if (isBar)
                {
                    sbSvg.Append($"<rect x=\"{x}\" y=\"0\" width=\"{w}\" height=\"48\" fill=\"black\"/>");
                }
                x += w;
                isBar = !isBar;
            }
        }
        sbSvg.Append("</svg>");
        return sbSvg.ToString();
    }
}