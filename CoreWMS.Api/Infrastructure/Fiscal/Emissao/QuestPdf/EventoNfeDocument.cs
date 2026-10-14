using System.Text;
using System.Text.RegularExpressions;
using DFe.Utils;
using NFe.Classes;
using NFe.Classes.Servicos.Consulta;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CoreWMS.Api.Infrastructure.Fiscal.Emissao.QuestPdf;

public class EventoNfeDocument : IDocument
{
    private nfeProc? _nfeProc;
    private NFe.Classes.NFe _nfe = null!;
    private procEventoNFe _procEventoNFe = null!;
    private readonly byte[]? _logo;
    private static readonly string _fontFamily = "Lato";

    public EventoNfeDocument(string xmlNfe, string xmlEvento, byte[]? logo = null)
    {
        _logo = logo;
        CarregarXmlNfe(xmlNfe);
        CarregarXmlEvento(xmlEvento);
    }

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(15, Unit.Millimetre);
            page.DefaultTextStyle(x => x.FontSize(7).FontFamily(_fontFamily).LineHeight(1.15f));

            page.Header().Element(Cabecalho);
            page.Content().Element(Conteudo);
            page.Footer().Element(Rodape);
        });
    }

    private void Cabecalho(IContainer container)
    {
        var detEvento = _procEventoNFe.evento.infEvento.detEvento;
        var infEvento = _procEventoNFe.evento.infEvento;
        var retInfEvento = _procEventoNFe.retEvento.infEvento;
        string chaveAcesso = infEvento.chNFe ?? _nfe.infNFe.Id.Replace("NFe", "");

        container.Column(column =>
        {
            // 1. TÍTULO PRINCIPAL DO EVENTO
            column.Item().Border(0.5f).Padding(4).Column(c =>
            {
                c.Item().AlignCenter().Text(detEvento.descEvento?.ToUpper() ?? "REPRESENTAÇÃO DE EVENTO FISCAL").FontSize(11).Bold();
                c.Item().AlignCenter().Text("Não possui valor fiscal. Simples representação do evento indicado abaixo.\nCONSULTE A AUTENTICIDADE NO SITE DA SEFAZ AUTORIZADORA").FontSize(6).FontColor(Colors.Grey.Darken2);
            });

            column.Item().PaddingTop(6);

            // 2. DADOS DA NOTA FISCAL VINCULADA
            column.Item().Text("NOTA FISCAL ELETRÔNICA - NF-e").FontSize(7.5f).Bold();

            column.Item().Border(0.5f).Table(t =>
            {
                t.ColumnsDefinition(cd =>
                {
                    cd.ConstantColumn(45);
                    cd.ConstantColumn(45);
                    cd.ConstantColumn(65);
                    cd.ConstantColumn(75);
                    cd.RelativeColumn();
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("MODELO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(_nfe.infNFe.ide.mod.ToString()).FontSize(7.5f).Bold().AlignCenter();
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("SÉRIE").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(_nfe.infNFe.ide.serie.ToString("D3")).FontSize(7.5f).Bold().AlignCenter();
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("NÚMERO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(_nfe.infNFe.ide.nNF.ToString("D9")).FontSize(7.5f).Bold().AlignCenter();
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("MÊS/ANO EMISSÃO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(_nfe.infNFe.ide.dhEmi.ToString("MM/yyyy")).FontSize(7.5f).Bold().AlignCenter();
                });

                // CÓDIGO DE BARRAS 128 VETORIAL (SVG)
                t.Cell().RowSpan(2).Border(0.5f).Padding(2).AlignCenter().Column(tx =>
                {
                    tx.Item().MaxHeight(18).Svg(GerarCodigo128Svg(chaveAcesso));
                    tx.Item().Text(string.Join(" ", Enumerable.Range(0, chaveAcesso.Length / 4).Select(i => chaveAcesso.Substring(i * 4, 4)))).FontSize(6).Bold().AlignCenter();
                });

                t.Cell().ColumnSpan(4).Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("CHAVE DE ACESSO DA NF-E").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(chaveAcesso).FontSize(6.5f).Bold().AlignCenter();
                });
            });

            column.Item().PaddingTop(6);

            // 3. DADOS DO EVENTO SEFAZ
            column.Item().Text("DADOS DO EVENTO").FontSize(7.5f).Bold();

            column.Item().Border(0.5f).Table(t =>
            {
                t.ColumnsDefinition(cd =>
                {
                    cd.ConstantColumn(45);
                    cd.RelativeColumn();
                    cd.ConstantColumn(120);
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("ÓRGÃO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(infEvento.cOrgao.ToString()).FontSize(7).Bold().AlignCenter();
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("AMBIENTE").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(infEvento.tpAmb.ToString() == "Producao" ? "1 - PRODUÇÃO" : "2 - HOMOLOGAÇÃO - SEM VALOR FISCAL").FontSize(7).Bold();
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("DATA E HORA DO EVENTO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(infEvento.dhEvento.ToString("dd/MM/yyyy HH:mm:ss")).FontSize(7).Bold().AlignCenter();
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("EVENTO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(((int)infEvento.tpEvento).ToString()).FontSize(7).Bold().AlignCenter();
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("DESCRIÇÃO DO EVENTO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text(detEvento.descEvento ?? "").FontSize(7).Bold();
                });

                t.Cell().Border(0.5f).Padding(2).Row(r =>
                {
                    r.RelativeItem().Column(tx =>
                    {
                        tx.Item().Text("SEQ. EVENTO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                        tx.Item().Text(infEvento.nSeqEvento.ToString()).FontSize(7).Bold().AlignCenter();
                    });
                    r.RelativeItem().BorderLeft(0.5f).PaddingLeft(2).Column(tx =>
                    {
                        tx.Item().Text("VERSÃO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                        tx.Item().Text(infEvento.verEvento ?? "1.00").FontSize(7).Bold().AlignCenter();
                    });
                });

                t.Cell().ColumnSpan(2).Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("STATUS SEFAZ").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text($"{retInfEvento.cStat} - {retInfEvento.xMotivo}").FontSize(7).Bold();
                });

                t.Cell().Border(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("PROTOCOLO DE HOMOLOGAÇÃO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text($"{retInfEvento.nProt} - {retInfEvento.dhRegEvento:dd/MM/yyyy HH:mm:ss}").FontSize(6.5f).Bold().AlignCenter();
                });
            });
        });
    }

    private void Conteudo(IContainer container)
    {
        var detEvento = _procEventoNFe.evento.infEvento.detEvento;

        container.Column(column =>
        {
            column.Item().PaddingTop(6);

            // EMITENTE
            column.Item().Text("EMITENTE").FontSize(7.5f).Bold();
            column.Item().Border(0.5f).Column(c =>
            {
                c.Item().Row(r =>
                {
                    r.RelativeItem(3).Padding(2).Column(tx =>
                    {
                        tx.Item().Text("RAZÃO SOCIAL").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                        tx.Item().Text(_nfe.infNFe.emit.xNome ?? "").Bold();
                    });
                    r.RelativeItem(1.5f).BorderLeft(0.5f).Padding(2).Column(tx =>
                    {
                        tx.Item().Text("CNPJ / CPF").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                        tx.Item().Text(_nfe.infNFe.emit.CNPJ ?? _nfe.infNFe.emit.CPF ?? "").Bold().AlignCenter();
                    });
                    r.RelativeItem(1.5f).BorderLeft(0.5f).Padding(2).Column(tx =>
                    {
                        tx.Item().Text("INSCRIÇÃO ESTADUAL").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                        tx.Item().Text(_nfe.infNFe.emit.IE ?? "").Bold().AlignCenter();
                    });
                });
                c.Item().BorderTop(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("ENDEREÇO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text($"{_nfe.infNFe.emit.enderEmit.xLgr}, {_nfe.infNFe.emit.enderEmit.nro} - {_nfe.infNFe.emit.enderEmit.xBairro} - {_nfe.infNFe.emit.enderEmit.xMun}/{_nfe.infNFe.emit.enderEmit.UF} - CEP: {_nfe.infNFe.emit.enderEmit.CEP}");
                });
            });

            column.Item().PaddingTop(6);

            // DESTINATÁRIO
            column.Item().Text("DESTINATÁRIO").FontSize(7.5f).Bold();
            column.Item().Border(0.5f).Column(c =>
            {
                c.Item().Row(r =>
                {
                    r.RelativeItem(3).Padding(2).Column(tx =>
                    {
                        tx.Item().Text("RAZÃO SOCIAL").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                        tx.Item().Text(_nfe.infNFe.dest?.xNome ?? "").Bold();
                    });
                    r.RelativeItem(1.5f).BorderLeft(0.5f).Padding(2).Column(tx =>
                    {
                        tx.Item().Text("CNPJ / CPF").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                        tx.Item().Text(_nfe.infNFe.dest?.CNPJ ?? _nfe.infNFe.dest?.CPF ?? "").Bold().AlignCenter();
                    });
                    r.RelativeItem(1.5f).BorderLeft(0.5f).Padding(2).Column(tx =>
                    {
                        tx.Item().Text("INSCRIÇÃO ESTADUAL").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                        tx.Item().Text(_nfe.infNFe.dest?.IE ?? "ISENTO").Bold().AlignCenter();
                    });
                });
                c.Item().BorderTop(0.5f).Padding(2).Column(tx =>
                {
                    tx.Item().Text("ENDEREÇO").FontSize(4.5f).FontColor(Colors.Grey.Darken1);
                    tx.Item().Text($"{_nfe.infNFe.dest?.enderDest?.xLgr}, {_nfe.infNFe.dest?.enderDest?.nro} - {_nfe.infNFe.dest?.enderDest?.xBairro} - {_nfe.infNFe.dest?.enderDest?.xMun}/{_nfe.infNFe.dest?.enderDest?.UF} - CEP: {_nfe.infNFe.dest?.enderDest?.CEP}");
                });
            });

            // CONDIÇÕES DE USO (Apenas quando houver, como na CC-e)
            if (!string.IsNullOrWhiteSpace(detEvento.xCondUso))
            {
                column.Item().PaddingTop(6);
                column.Item().Text("CONDIÇÕES DE USO").FontSize(7.5f).Bold();
                column.Item().Border(0.5f).Padding(3).Text(Regex.Replace(detEvento.xCondUso.Replace("\r", "").Replace("\n", " "), @"\s+", " ")).FontSize(6).FontColor(Colors.Grey.Darken2);
            }

            column.Item().PaddingTop(6);

            // CONTEÚDO ESPECÍFICO DO EVENTO (Texto da Correção ou Justificativa do Cancelamento)
            string tituloSecao = !string.IsNullOrWhiteSpace(detEvento.xCorrecao) ? "TEXTO DA CARTA DE CORREÇÃO" : "JUSTIFICATIVA DO CANCELAMENTO";
            string textoConteudo = detEvento.xCorrecao ?? detEvento.xJust ?? "Sem texto complementar registrado no evento.";

            column.Item().Text(tituloSecao).FontSize(7.5f).Bold();
            column.Item().Border(0.5f).MinHeight(80).Padding(4).Column(c =>
            {
                c.Item().Text(Regex.Replace(textoConteudo.Replace("\r", "").Replace("\n", " "), @"\s+", " ")).FontSize(7.5f).Bold();
            });
        });
    }

    private void Rodape(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().PaddingTop(4).Row(r =>
            {
                r.RelativeItem().Text($"Impresso em {DateTime.Now:dd/MM/yyyy HH:mm:ss}").FontSize(5).FontColor(Colors.Grey.Darken1);
                r.RelativeItem().AlignRight().Text("Powered by CoreWMS - Eder Gross Cichelero").FontSize(5).FontColor(Colors.Grey.Darken1);
            });
        });
    }

    private void CarregarXmlNfe(string xmlNfe)
    {
        try
        {
            _nfeProc = FuncoesXml.XmlStringParaClasse<nfeProc>(xmlNfe);
            _nfe = _nfeProc.NFe;
        }
        catch
        {
            _nfe = FuncoesXml.XmlStringParaClasse<NFe.Classes.NFe>(xmlNfe)
                ?? throw new ArgumentException("XML da NF-e inválido para renderização do evento.");
        }
    }

    private void CarregarXmlEvento(string xmlEvento)
    {
        try
        {
            _procEventoNFe = FuncoesXml.XmlStringParaClasse<procEventoNFe>(xmlEvento)
                ?? throw new ArgumentException("XML do evento fiscal inválido.");
        }
        catch (Exception ex)
        {
            throw new ArgumentException($"Erro ao desserializar procEventoNFe: {ex.Message}");
        }
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