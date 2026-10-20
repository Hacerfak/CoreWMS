using NFe.Classes;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Federal;
using NFe.Classes.Informacoes.Transporte;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.Text;
using System.Text.RegularExpressions;

namespace CoreWMS.Api.Infrastructure.Fiscal.Emissao.QuestPdf;

public class DanfeRetratoDocument : IDocument
{
    private readonly nfeProc _nfe;
    private readonly byte[]? _logoBytes;

    public DanfeRetratoDocument(nfeProc nfe, byte[]? logoBytes = null)
    {
        _nfe = nfe;
        _logoBytes = logoBytes;
    }

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(4, Unit.Millimetre);
            page.PageColor(Colors.White);
            page.DefaultTextStyle(x => x.FontSize(6.5f).FontFamily("Lato").FontColor(Colors.Black).LineHeight(1.15f));

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
        string chaveAcesso = _nfe.NFe.infNFe.Id?.Replace("NFe", "").Trim() ?? "";
        bool isHomologacao = ide.tpAmb == DFe.Classes.Flags.TipoAmbiente.Homologacao;

        container.Column(col =>
        {
            // 1. CANHOTO (Exibido na Folha 1)
            col.Item().ShowOnce().Border(0.5f).BorderColor(Colors.Black).Row(row =>
            {
                row.RelativeItem().Padding(2).Column(c =>
                {
                    c.Item().Text($"RECEBEMOS DE {emit.xNome?.ToUpper()} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO")
                        .FontSize(5.5f).Bold().FontColor(Colors.Black);

                    c.Item().PaddingTop(2).Row(r =>
                    {
                        r.ConstantItem(120).Text("DATA DE RECEBIMENTO").FontSize(5).Bold().FontColor(Colors.Black);
                        r.RelativeItem().PaddingLeft(10).Text("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR").FontSize(5).Bold().FontColor(Colors.Black);
                    });
                });

                row.ConstantItem(115).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).AlignCenter().Column(c =>
                {
                    c.Item().Text("NF-e").Bold().FontSize(10).FontColor(Colors.Black).AlignCenter();
                    c.Item().Text($"Nº {ide.nNF:000\\.000\\.000}").Bold().FontSize(8.5f).FontColor(Colors.Black).AlignCenter();
                    c.Item().Text($"SÉRIE {ide.serie:000}").Bold().FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                });
            });

            col.Item().ShowOnce().PaddingVertical(1).LineHorizontal(0.5f).LineColor(Colors.Black);

            // AVISO DE HOMOLOGAÇÃO
            if (isHomologacao)
            {
                col.Item().Background(Colors.Grey.Lighten3).Border(0.5f).BorderColor(Colors.Black).Padding(2).AlignCenter()
                   .Text("NF-E EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL").Bold().FontSize(7.5f).FontColor(Colors.Black);
            }

            // 2. EMITENTE / DANFE / CHAVE DE ACESSO
            col.Item().Border(0.5f).BorderColor(Colors.Black).Row(row =>
            {
                // EMITENTE + LOGO (Ajustado para evitar qualquer conflito de altura)
                row.RelativeItem(4.5f).Padding(2.5f).Row(r =>
                {
                    if (_logoBytes != null && _logoBytes.Length > 0)
                    {
                        r.ConstantItem(55).Height(40).AlignCenter().AlignMiddle().Image(_logoBytes).FitArea();
                    }

                    r.RelativeItem().PaddingLeft(3).Column(emitCol =>
                    {
                        emitCol.Item().Text("IDENTIFICAÇÃO DO EMITENTE").FontSize(5).Bold().FontColor(Colors.Black);
                        emitCol.Item().Text(emit.xNome).Bold().FontSize(8.5f).FontColor(Colors.Black);

                        if (!string.IsNullOrWhiteSpace(emit.xFant))
                            emitCol.Item().Text(emit.xFant).Bold().FontSize(7.5f).FontColor(Colors.Black);

                        emitCol.Item().PaddingTop(1).Text($"{emit.enderEmit?.xLgr}, {emit.enderEmit?.nro}{(string.IsNullOrEmpty(emit.enderEmit?.xCpl) ? "" : " - " + emit.enderEmit?.xCpl)}").FontSize(7).FontColor(Colors.Black);
                        emitCol.Item().Text($"{emit.enderEmit?.xBairro} - CEP: {FormatCep(emit.enderEmit?.CEP)}").FontSize(7).FontColor(Colors.Black);
                        emitCol.Item().Text($"{emit.enderEmit?.xMun} - {emit.enderEmit?.UF}").FontSize(7).FontColor(Colors.Black);

                        if (!string.IsNullOrEmpty(emit.enderEmit?.fone?.ToString()))
                            emitCol.Item().Text($"TEL: {FormatFone(emit.enderEmit?.fone?.ToString())}").FontSize(7).FontColor(Colors.Black);
                    });
                });

                // QUADRO DANFE
                row.ConstantItem(115).BorderLeft(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(2).AlignCenter().Column(c =>
                {
                    c.Item().Text("DANFE").Bold().FontSize(12).FontColor(Colors.Black).AlignCenter();
                    c.Item().Text("Documento Auxiliar da\nNota Fiscal Eletrônica").FontSize(5.5f).FontColor(Colors.Black).AlignCenter();

                    c.Item().PaddingVertical(2).Border(0.5f).BorderColor(Colors.Black).PaddingHorizontal(6).PaddingVertical(1).Row(r =>
                    {
                        r.RelativeItem().Text($"{(int)ide.tpNF} - {((int)ide.tpNF == 0 ? "ENTRADA" : "SAÍDA")}").Bold().FontSize(8).FontColor(Colors.Black).AlignCenter();
                    });

                    c.Item().Text($"Nº {ide.nNF:000\\.000\\.000}").Bold().FontSize(8.5f).FontColor(Colors.Black).AlignCenter();
                    c.Item().Text($"SÉRIE {ide.serie:000}").Bold().FontSize(8f).FontColor(Colors.Black).AlignCenter();

                    c.Item().AlignCenter().Text(x =>
                    {
                        x.Span("FOLHA ").FontSize(6.5f).FontColor(Colors.Black);
                        x.CurrentPageNumber().FontSize(6.5f).Bold().FontColor(Colors.Black);
                        x.Span(" / ").FontSize(6.5f).FontColor(Colors.Black);
                        x.TotalPages().FontSize(6.5f).Bold().FontColor(Colors.Black);
                    });
                });

                // CÓDIGO DE BARRAS E CHAVE DE ACESSO (100% DA LARGURA)
                row.RelativeItem(5.0f).Column(c =>
                {
                    // Código de barras ocupando toda a largura útil sem margens laterais
                    c.Item().Height(30).Svg(GerarCodigo128Svg(chaveAcesso));

                    c.Item().BorderTop(0.5f).BorderColor(Colors.Black).Padding(2).Column(cKey =>
                    {
                        cKey.Item().Text("CHAVE DE ACESSO").FontSize(5).Bold().FontColor(Colors.Black);
                        cKey.Item().Text(FormatChaveAcesso(chaveAcesso)).Bold().FontSize(8.5f).FontColor(Colors.Black).AlignCenter();
                    });

                    c.Item().BorderTop(0.5f).BorderColor(Colors.Black).Padding(1.5f).AlignCenter().Column(cAuth =>
                    {
                        cAuth.Item().Text("Consulta de autenticidade no portal nacional da NF-e").FontSize(5).FontColor(Colors.Black).AlignCenter();
                        cAuth.Item().Text("www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                    });
                });
            });

            // 3. NATUREZA DA OPERAÇÃO / PROTOCOLO
            col.Item().Row(row =>
            {
                row.RelativeItem().Border(0.5f).BorderTop(0).BorderColor(Colors.Black).Padding(2).Column(c =>
                {
                    c.Item().Text("NATUREZA DA OPERAÇÃO").FontSize(5).Bold().FontColor(Colors.Black);
                    c.Item().Text(ide.natOp).Bold().FontSize(8f).FontColor(Colors.Black);
                });

                row.ConstantItem(230).Border(0.5f).BorderTop(0).BorderLeft(0).BorderColor(Colors.Black).Padding(2).Column(c =>
                {
                    c.Item().Text("PROTOCOLO DE AUTORIZAÇÃO DE USO").FontSize(5).Bold().FontColor(Colors.Black);
                    c.Item().Text($"{_nfe.protNFe?.infProt?.nProt} - {_nfe.protNFe?.infProt?.dhRecbto:dd/MM/yyyy HH:mm:ss}")
                        .Bold().FontSize(8f).FontColor(Colors.Black).AlignCenter();
                });
            });

            // 4. INSCRIÇÕES
            col.Item().Row(row =>
            {
                row.RelativeItem().Border(0.5f).BorderTop(0).BorderColor(Colors.Black).Padding(2).Column(c =>
                {
                    c.Item().Text("INSCRIÇÃO ESTADUAL").FontSize(5).Bold().FontColor(Colors.Black);
                    c.Item().Text(emit.IE ?? "-").Bold().FontSize(8f).FontColor(Colors.Black).AlignCenter();
                });

                row.RelativeItem().Border(0.5f).BorderTop(0).BorderLeft(0).BorderColor(Colors.Black).Padding(2).Column(c =>
                {
                    c.Item().Text("INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.").FontSize(5).Bold().FontColor(Colors.Black);
                    c.Item().Text(emit.IEST ?? "-").Bold().FontSize(8f).FontColor(Colors.Black).AlignCenter();
                });

                row.RelativeItem().Border(0.5f).BorderTop(0).BorderLeft(0).BorderColor(Colors.Black).Padding(2).Column(c =>
                {
                    c.Item().Text("CNPJ").FontSize(5).Bold().FontColor(Colors.Black);
                    c.Item().Text(FormatCnpjCpf(emit.CNPJ ?? emit.CPF)).Bold().FontSize(8.5f).FontColor(Colors.Black).AlignCenter();
                });
            });

            col.Item().PaddingTop(2);

            // 5. DESTINATÁRIO / REMETENTE
            col.Item().Text("DESTINATÁRIO / REMETENTE").FontSize(5.5f).Bold().FontColor(Colors.Black);
            col.Item().Border(0.5f).BorderColor(Colors.Black).Column(caixaDest =>
            {
                caixaDest.Item().Row(row =>
                {
                    row.RelativeItem().Padding(2).Column(c =>
                    {
                        c.Item().Text("NOME / RAZÃO SOCIAL").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(dest?.xNome ?? "-").Bold().FontSize(8f).FontColor(Colors.Black);
                    });

                    row.ConstantItem(150).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("CNPJ / CPF").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(FormatCnpjCpf(dest?.CNPJ ?? dest?.CPF)).Bold().FontSize(8f).FontColor(Colors.Black).AlignCenter();
                    });

                    row.ConstantItem(85).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("DATA DA EMISSÃO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(ide.dhEmi.ToString("dd/MM/yyyy")).Bold().FontSize(8f).FontColor(Colors.Black).AlignCenter();
                    });
                });

                caixaDest.Item().BorderTop(0.5f).BorderColor(Colors.Black).Row(row =>
                {
                    row.RelativeItem().Padding(2).Column(c =>
                    {
                        c.Item().Text("ENDEREÇO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text($"{dest?.enderDest?.xLgr}, {dest?.enderDest?.nro}{(string.IsNullOrEmpty(dest?.enderDest?.xCpl) ? "" : " " + dest?.enderDest?.xCpl)}").FontSize(7.5f).FontColor(Colors.Black);
                    });

                    row.ConstantItem(135).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("BAIRRO / DISTRITO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(dest?.enderDest?.xBairro ?? "-").FontSize(7.5f).FontColor(Colors.Black);
                    });

                    row.ConstantItem(75).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("CEP").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(FormatCep(dest?.enderDest?.CEP)).FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                    });

                    row.ConstantItem(85).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("DATA SAÍDA / ENTRADA").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(ide.dhSaiEnt?.ToString("dd/MM/yyyy") ?? ide.dhEmi.ToString("dd/MM/yyyy")).Bold().FontSize(8f).FontColor(Colors.Black).AlignCenter();
                    });
                });

                caixaDest.Item().BorderTop(0.5f).BorderColor(Colors.Black).Row(row =>
                {
                    row.RelativeItem().Padding(2).Column(c =>
                    {
                        c.Item().Text("MUNICÍPIO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(dest?.enderDest?.xMun ?? "-").FontSize(7.5f).FontColor(Colors.Black);
                    });

                    row.ConstantItem(30).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("UF").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(dest?.enderDest?.UF ?? "-").Bold().FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                    });

                    row.ConstantItem(105).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("FONE / FAX").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(FormatFone(dest?.enderDest?.fone?.ToString())).FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                    });

                    row.ConstantItem(105).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("INSCRIÇÃO ESTADUAL").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(dest?.IE ?? "ISENTO").FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                    });

                    row.ConstantItem(85).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("HORA DA SAÍDA").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(ide.dhSaiEnt?.ToString("HH:mm:ss") ?? ide.dhEmi.ToString("HH:mm:ss")).Bold().FontSize(8f).FontColor(Colors.Black).AlignCenter();
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
            col.Item().Text("CÁLCULO DO IMPOSTO").FontSize(5.5f).Bold().FontColor(Colors.Black);
            col.Item().Border(0.5f).BorderColor(Colors.Black).Column(caixaImp =>
            {
                caixaImp.Item().Row(r =>
                {
                    r.RelativeItem().Padding(2).Column(c =>
                    {
                        c.Item().Text("BASE DE CÁLC. DO ICMS").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vBC.ToString("N2")).Bold().FontSize(8f).FontColor(Colors.Black).AlignRight();
                    });

                    r.RelativeItem().BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("VALOR DO ICMS").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vICMS.ToString("N2")).Bold().FontSize(8f).FontColor(Colors.Black).AlignRight();
                    });

                    r.RelativeItem().BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("BASE CÁLC. ICMS S.T.").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vBCST.ToString("N2")).Bold().FontSize(8f).FontColor(Colors.Black).AlignRight();
                    });

                    r.RelativeItem().BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("VALOR ICMS S.T.").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vST.ToString("N2")).Bold().FontSize(8f).FontColor(Colors.Black).AlignRight();
                    });

                    r.RelativeItem(1.4f).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("VALOR TOTAL DOS PRODUTOS").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vProd.ToString("N2")).Bold().FontSize(8.5f).FontColor(Colors.Black).AlignRight();
                    });
                });

                caixaImp.Item().BorderTop(0.5f).BorderColor(Colors.Black).Row(r =>
                {
                    r.RelativeItem().Padding(2).Column(c =>
                    {
                        c.Item().Text("VALOR DO FRETE").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vFrete.ToString("N2")).Bold().FontSize(8f).FontColor(Colors.Black).AlignRight();
                    });

                    r.RelativeItem().BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("VALOR DO SEGURO").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vSeg.ToString("N2")).Bold().FontSize(8f).FontColor(Colors.Black).AlignRight();
                    });

                    r.RelativeItem().BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("DESCONTO").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vDesc.ToString("N2")).Bold().FontSize(8f).FontColor(Colors.Black).AlignRight();
                    });

                    r.RelativeItem().BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("OUTRAS DESPESAS").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vOutro.ToString("N2")).Bold().FontSize(8f).FontColor(Colors.Black).AlignRight();
                    });

                    r.RelativeItem().BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("VALOR DO IPI").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vIPI.ToString("N2")).Bold().FontSize(8f).FontColor(Colors.Black).AlignRight();
                    });

                    r.RelativeItem(1.4f).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("VALOR TOTAL DA NOTA").FontSize(5.5f).Bold().FontColor(Colors.Black).AlignCenter();
                        c.Item().Text(total.vNF.ToString("N2")).Bold().FontSize(9.5f).FontColor(Colors.Black).AlignRight();
                    });
                });
            });

            col.Item().PaddingTop(2);

            // 7. TRANSPORTADOR / VOLUMES TRANSPORTADOS
            col.Item().Text("TRANSPORTADOR / VOLUMES TRANSPORTADOS").FontSize(5.5f).Bold().FontColor(Colors.Black);
            col.Item().Border(0.5f).BorderColor(Colors.Black).Column(caixaTransp =>
            {
                caixaTransp.Item().Row(r =>
                {
                    r.RelativeItem(3.2f).Padding(2).Column(c =>
                    {
                        c.Item().Text("RAZÃO SOCIAL").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(transp.transporta?.xNome ?? "-").Bold().FontSize(7.5f).FontColor(Colors.Black);
                    });

                    r.ConstantItem(120).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("FRETE POR CONTA").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(ObterDescricaoFrete(transp.modFrete)).FontSize(7f).FontColor(Colors.Black).AlignCenter();
                    });

                    r.ConstantItem(65).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("CÓDIGO ANTT").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(transp.veicTransp?.RNTC ?? "-").FontSize(7f).FontColor(Colors.Black).AlignCenter();
                    });

                    r.ConstantItem(75).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("PLACA VEÍCULO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(transp.veicTransp?.placa ?? "-").Bold().FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                    });

                    r.ConstantItem(25).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("UF").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(transp.veicTransp?.UF ?? "-").Bold().FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                    });

                    r.ConstantItem(120).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("CNPJ / CPF").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(FormatCnpjCpf(transp.transporta?.CNPJ ?? transp.transporta?.CPF)).Bold().FontSize(8f).FontColor(Colors.Black).AlignCenter();
                    });
                });

                caixaTransp.Item().BorderTop(0.5f).BorderColor(Colors.Black).Row(r =>
                {
                    r.RelativeItem(3.2f).Padding(2).Column(c =>
                    {
                        c.Item().Text("ENDEREÇO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(transp.transporta?.xEnder ?? "-").FontSize(7.5f).FontColor(Colors.Black);
                    });

                    r.ConstantItem(140).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("MUNICÍPIO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(transp.transporta?.xMun ?? "-").FontSize(7.5f).FontColor(Colors.Black);
                    });

                    r.ConstantItem(25).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("UF").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(transp.transporta?.UF ?? "-").Bold().FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                    });

                    r.ConstantItem(120).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("INSCRIÇÃO ESTADUAL").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(transp.transporta?.IE ?? "-").FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                    });
                });

                var vol = transp.vol?.FirstOrDefault();
                caixaTransp.Item().BorderTop(0.5f).BorderColor(Colors.Black).Row(r =>
                {
                    r.ConstantItem(60).Padding(2).Column(c =>
                    {
                        c.Item().Text("QUANTIDADE").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(vol?.qVol?.ToString() ?? "0").Bold().FontSize(7.5f).FontColor(Colors.Black).AlignCenter();
                    });

                    r.RelativeItem().BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("ESPÉCIE").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(vol?.esp ?? "-").FontSize(7.5f).FontColor(Colors.Black);
                    });

                    r.ConstantItem(80).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("MARCA").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(vol?.marca ?? "-").FontSize(7.5f).FontColor(Colors.Black);
                    });

                    r.ConstantItem(80).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("NUMERAÇÃO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(vol?.nVol ?? "-").FontSize(7.5f).FontColor(Colors.Black);
                    });

                    r.ConstantItem(85).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("PESO BRUTO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(vol?.pesoB?.ToString("N3") ?? "0,000").Bold().FontSize(7.5f).FontColor(Colors.Black).AlignRight();
                    });

                    r.ConstantItem(85).BorderLeft(0.5f).BorderColor(Colors.Black).Padding(2).Column(c =>
                    {
                        c.Item().Text("PESO LÍQUIDO").FontSize(5).Bold().FontColor(Colors.Black);
                        c.Item().Text(vol?.pesoL?.ToString("N3") ?? "0,000").Bold().FontSize(7.5f).FontColor(Colors.Black).AlignRight();
                    });
                });
            });

            col.Item().PaddingTop(2);

            // 8. DADOS DOS PRODUTOS / SERVIÇOS
            col.Item().Text("DADOS DOS PRODUTOS / SERVIÇOS").FontSize(5.5f).Bold().FontColor(Colors.Black);
            col.Item().Border(0.5f).BorderColor(Colors.Black).Table(t =>
            {
                t.ColumnsDefinition(c =>
                {
                    c.ConstantColumn(46);        // CÓDIGO
                    c.RelativeColumn();          // DESCRIÇÃO
                    c.ConstantColumn(38);        // NCM
                    c.ConstantColumn(24);        // CST
                    c.ConstantColumn(24);        // CFOP
                    c.ConstantColumn(20);        // UN
                    c.ConstantColumn(42);        // QUANT.
                    c.ConstantColumn(42);        // V. UNIT
                    c.ConstantColumn(46);        // V. TOTAL
                    c.ConstantColumn(42);        // BC ICMS
                    c.ConstantColumn(40);        // V. ICMS
                    c.ConstantColumn(38);        // V. IPI
                    c.ConstantColumn(24);        // ALÍQ ICMS
                    c.ConstantColumn(22);        // ALÍQ IPI
                });

                t.Header(h =>
                {
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("CÓDIGO").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("DESCRIÇÃO DO PRODUTO / SERVIÇO").FontSize(5).Bold().FontColor(Colors.Black);
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("NCM/SH").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("CST").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("CFOP").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("UN").FontSize(5).Bold().FontColor(Colors.Black).AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("QUANT.").FontSize(5).Bold().FontColor(Colors.Black).AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("V. UNIT").FontSize(5).Bold().FontColor(Colors.Black).AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("V. TOTAL").FontSize(5).Bold().FontColor(Colors.Black).AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("BC ICMS").FontSize(5).Bold().FontColor(Colors.Black).AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("V. ICMS").FontSize(5).Bold().FontColor(Colors.Black).AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("V. IPI").FontSize(5).Bold().FontColor(Colors.Black).AlignRight();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("ALÍQ ICMS").FontSize(4.5f).Bold().FontColor(Colors.Black).AlignCenter();
                    h.Cell().Background(Colors.Grey.Lighten3).BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text("ALÍQ IPI").FontSize(4.5f).Bold().FontColor(Colors.Black).AlignCenter();
                });

                foreach (var det in _nfe.NFe.infNFe.det)
                {
                    var icmsData = ExtrairIcms(det.imposto?.ICMS);
                    var ipiData = ExtrairIpi(det.imposto?.IPI);

                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(det.prod.cProd).Bold().FontSize(6.5f).FontColor(Colors.Black).AlignCenter();

                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Column(c =>
                    {
                        c.Item().Text(det.prod.xProd).Bold().FontSize(7f).FontColor(Colors.Black);
                        if (!string.IsNullOrWhiteSpace(det.infAdProd))
                        {
                            c.Item().Text(det.infAdProd).FontSize(6f).FontColor(Colors.Black);
                        }
                    });

                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(det.prod.NCM).FontSize(6.5f).FontColor(Colors.Black).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(icmsData.Cst).Bold().FontSize(6.5f).FontColor(Colors.Black).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(det.prod.CFOP.ToString()).Bold().FontSize(6.5f).FontColor(Colors.Black).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(det.prod.uCom).FontSize(6.5f).FontColor(Colors.Black).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(det.prod.qCom.ToString("N4")).Bold().FontSize(6.5f).FontColor(Colors.Black).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(det.prod.vUnCom.ToString("N4")).FontSize(6.5f).FontColor(Colors.Black).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(det.prod.vProd.ToString("N2")).Bold().FontSize(7f).FontColor(Colors.Black).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(icmsData.BaseCalculo.ToString("N2")).FontSize(6.5f).FontColor(Colors.Black).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(icmsData.Valor.ToString("N2")).FontSize(6.5f).FontColor(Colors.Black).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(ipiData.Valor.ToString("N2")).FontSize(6.5f).FontColor(Colors.Black).AlignRight();
                    t.Cell().BorderBottom(0.5f).BorderRight(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(icmsData.Aliquota > 0 ? $"{icmsData.Aliquota:N0}%" : "-").FontSize(6.5f).FontColor(Colors.Black).AlignCenter();
                    t.Cell().BorderBottom(0.5f).BorderColor(Colors.Black).Padding(1.5f).Text(ipiData.Aliquota > 0 ? $"{ipiData.Aliquota:N0}%" : "-").FontSize(6.5f).FontColor(Colors.Black).AlignCenter();
                }
            });
        });
    }

    private void ComposeFooter(IContainer container)
    {
        var infAdic = _nfe.NFe.infNFe.infAdic;

        container.Column(col =>
        {
            col.Item().PaddingTop(3).Text("DADOS ADICIONAIS").FontSize(5.5f).Bold().FontColor(Colors.Black);
            col.Item().Row(r =>
            {
                r.RelativeItem().Border(0.5f).BorderColor(Colors.Black).Padding(2.5f).MinHeight(55).Column(c =>
                {
                    c.Item().Text("INFORMAÇÕES COMPLEMENTARES").FontSize(5).Bold().FontColor(Colors.Black);
                    c.Item().Text($"{infAdic?.infCpl}\n{infAdic?.infAdFisco}".Trim()).FontSize(6.5f).FontColor(Colors.Black).LineHeight(1.15f);
                });

                r.ConstantItem(220).Border(0.5f).BorderLeft(0).BorderColor(Colors.Black).Padding(2.5f).MinHeight(55).Column(c =>
                {
                    c.Item().Text("RESERVADO AO FISCO").FontSize(5).Bold().FontColor(Colors.Black);
                });
            });

            col.Item().PaddingTop(2).Row(r =>
            {
                r.RelativeItem().Text($"Impresso em {DateTime.Now:dd/MM/yyyy HH:mm:ss}").FontSize(5).FontColor(Colors.Black);
                r.RelativeItem().AlignRight().Text("CoreWMS - Sistema de Gestão de Armazéns").FontSize(5).FontColor(Colors.Black);
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

    private string FormatChaveAcesso(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length != 44) return key;
        return Regex.Replace(key, ".{4}", "$0 ").Trim();
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

    private string GerarCodigo128Svg(string chave)
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
        // preserveAspectRatio="none" garante que o código preencha 100% da largura útil sem margens laterais
        sbSvg.Append($"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {totalWidth} 48\" preserveAspectRatio=\"none\" width=\"100%\" height=\"30\">");
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