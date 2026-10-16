using System.Globalization;
using CoreWMS.Api.Features.Billing.Entities;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CoreWMS.Api.Features.Billing.Documents;

public class BillingCyclePdfDocument : IDocument
{
    private static readonly CultureInfo PtBr = new("pt-BR");
    private readonly BillingCycle _cycle;
    private readonly DateTime _emissaoData;

    public BillingCyclePdfDocument(BillingCycle cycle, DateTime emissaoData)
    {
        _cycle = cycle;
        _emissaoData = emissaoData;
    }

    public DocumentMetadata GetMetadata() => DocumentMetadata.Default;

    public void Compose(IDocumentContainer container)
    {
        container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(30);
            page.DefaultTextStyle(x => x.FontFamily("Lato").FontSize(9).FontColor(Colors.Grey.Darken3));

            page.Header().Element(ComposeHeader);
            page.Content().Element(ComposeContent);
            page.Footer().Element(ComposeFooter);
        });
    }

    // CABEÇALHO DO DOCUMENTO
    private void ComposeHeader(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().Column(c =>
                {
                    c.Item().Text("EXTRATO DE FATURAMENTO LOGÍSTICO").FontSize(16).Bold().FontColor(Colors.Blue.Darken3);
                    c.Item().Text($"Operação 3PL & Armazenagem Geral").FontSize(10).FontColor(Colors.Grey.Darken1);
                });

                row.RelativeItem().AlignRight().Column(c =>
                {
                    c.Item().Text($"Competência: {_cycle.ReferenceMonth}").FontSize(12).Bold().FontColor(Colors.Grey.Darken4);
                    c.Item().Text($"Período: {_cycle.StartDate:dd/MM/yyyy} a {_cycle.EndDate:dd/MM/yyyy}").FontSize(9).FontColor(Colors.Grey.Medium);
                });
            });

            col.Item().PaddingTop(8).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);

            // DADOS DO DEPOSITANTE
            col.Item().PaddingTop(6).Row(row =>
            {
                row.RelativeItem(2).Column(c =>
                {
                    c.Item().Text(t =>
                    {
                        t.Span("Depositante: ").Bold();
                        t.Span(_cycle.Customer?.CorporateName ?? "Não identificado");
                    });
                    c.Item().Text(t =>
                    {
                        t.Span("CNPJ: ").Bold();
                        t.Span(_cycle.Customer?.Cnpj ?? "-");
                    });
                });

                row.RelativeItem(1).AlignRight().Column(c =>
                {
                    c.Item().Text(t =>
                    {
                        t.Span("Situação: ").Bold();
                        t.Span(_cycle.Status.ToString() == "Draft" || _cycle.Status.ToString() == "1" ? "Aberto" : "Fechado / Auditado")
                            .FontColor(_cycle.Status.ToString() == "Draft" || _cycle.Status.ToString() == "1" ? Colors.Green.Darken2 : Colors.Grey.Darken2);
                    });
                    c.Item().Text(t =>
                    {
                        t.Span("Emissão: ").Bold();
                        t.Span($"{_emissaoData:dd/MM/yyyy HH:mm}");
                    });
                });
            });

            col.Item().PaddingTop(8).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
        });
    }

    // CORPO PRINCIPAL
    private void ComposeContent(IContainer container)
    {
        container.PaddingTop(12).Column(col =>
        {
            // 1. CARDS DE RESUMO FINANCEIRO (KPIS)
            col.Item().Element(ComposeSummaryCards);

            col.Item().PaddingTop(14);

            // 2. CONSOLIDADO POR NOTA FISCAL DE ENTRADA (ESTILO 3PL)
            col.Item().Element(ComposeNfeTable);

            col.Item().PaddingTop(14);

            // 3. EXTRATO DOS SERVIÇOS FATURADOS
            col.Item().Element(ComposeServicesTable);
        });
    }

    // 1. CARDS DE INDICADORES
    private void ComposeSummaryCards(IContainer container)
    {
        decimal dailyTotal = 0;
        decimal eventsTotal = 0;
        decimal manualTotal = 0;

        foreach (var item in _cycle.Items)
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

        container.Row(row =>
        {
            row.RelativeItem().Element(c => CardBlock(c, "TOTAL GERAL", _cycle.TotalAmount, Colors.Green.Darken3, Colors.Green.Lighten5));
            row.Spacing(8);
            row.RelativeItem().Element(c => CardBlock(c, "DIÁRIAS (ARMAZ./SEGURO)", dailyTotal, Colors.Purple.Darken3, Colors.Purple.Lighten5));
            row.Spacing(8);
            row.RelativeItem().Element(c => CardBlock(c, "EVENTOS (RECEB./EXPED.)", eventsTotal, Colors.Blue.Darken3, Colors.Blue.Lighten5));
            row.Spacing(8);
            row.RelativeItem().Element(c => CardBlock(c, "AVULSOS / EXTRAS", manualTotal, Colors.Amber.Darken3, Colors.Amber.Lighten5));
        });

        static void CardBlock(IContainer c, string title, decimal amount, string textColor, string bgColor)
        {
            c.Background(bgColor)
             .Border(1)
             .BorderColor(textColor)
             .Padding(8)
             .Column(col =>
             {
                 col.Item().Text(title).FontSize(7).Bold().FontColor(textColor);
                 col.Item().PaddingTop(2).Text($"R$ {amount.ToString("N2", PtBr)}").FontSize(12).Bold().FontColor(textColor);
             });
        }
    }

    // 2. TABELA POR NOTA FISCAL DE ENTRADA
    private void ComposeNfeTable(IContainer container)
    {
        var nfeGroups = GroupItemsByNfe();

        container.Column(col =>
        {
            col.Item().Text("1. CONSOLIDADO POR NOTA FISCAL DE ENTRADA (CUSTÓDIA 3PL)").FontSize(10).Bold().FontColor(Colors.Grey.Darken4);

            col.Item().PaddingTop(4).Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(3); // NF-e
                    columns.RelativeColumn(2); // Data Entrada
                    columns.RelativeColumn(2); // Volumes
                    columns.RelativeColumn(2); // Handling In
                    columns.RelativeColumn(2); // Armazenagem
                    columns.RelativeColumn(2); // Seguro
                    columns.RelativeColumn(3); // Total NF
                });

                table.Header(header =>
                {
                    header.Cell().Element(HeaderStyle).Text("NF-e Entrada");
                    header.Cell().Element(HeaderStyle).Text("Entrada");
                    header.Cell().Element(HeaderStyle).AlignRight().Text("Volumes");
                    header.Cell().Element(HeaderStyle).AlignRight().Text("Handling In");
                    header.Cell().Element(HeaderStyle).AlignRight().Text("Armazenagem");
                    header.Cell().Element(HeaderStyle).AlignRight().Text("Seguro");
                    header.Cell().Element(HeaderStyle).AlignRight().Text("Total R$");
                });

                bool alternate = false;
                foreach (var g in nfeGroups)
                {
                    var bg = alternate ? Colors.Grey.Lighten4 : Colors.White;
                    alternate = !alternate;

                    table.Cell().Element(c => CellStyle(c, bg)).Text($"NF #{g.NfeNumber}").Bold();
                    table.Cell().Element(c => CellStyle(c, bg)).Text($"{g.EntryDate:dd/MM/yyyy}");
                    table.Cell().Element(c => CellStyle(c, bg)).AlignRight().Text(g.VolumeTotal.ToString("N0", PtBr));
                    table.Cell().Element(c => CellStyle(c, bg)).AlignRight().Text($"R$ {g.HandlingInTotal.ToString("N2", PtBr)}");
                    table.Cell().Element(c => CellStyle(c, bg)).AlignRight().Text($"R$ {g.StorageTotal.ToString("N2", PtBr)}");
                    table.Cell().Element(c => CellStyle(c, bg)).AlignRight().Text($"R$ {g.AdValoremTotal.ToString("N2", PtBr)}");
                    table.Cell().Element(c => CellStyle(c, bg)).AlignRight().Text($"R$ {g.TotalAmount.ToString("N2", PtBr)}").Bold().FontColor(Colors.Green.Darken3);
                }

                // Linha de Total
                table.Cell().ColumnSpan(2).Element(FooterStyle).Text("TOTAL DAS NOTAS FISCAIS").Bold();
                table.Cell().Element(FooterStyle).AlignRight().Text(nfeGroups.Sum(g => g.VolumeTotal).ToString("N0", PtBr)).Bold();
                table.Cell().Element(FooterStyle).AlignRight().Text($"R$ {nfeGroups.Sum(g => g.HandlingInTotal).ToString("N2", PtBr)}").Bold();
                table.Cell().Element(FooterStyle).AlignRight().Text($"R$ {nfeGroups.Sum(g => g.StorageTotal).ToString("N2", PtBr)}").Bold();
                table.Cell().Element(FooterStyle).AlignRight().Text($"R$ {nfeGroups.Sum(g => g.AdValoremTotal).ToString("N2", PtBr)}").Bold();
                table.Cell().Element(FooterStyle).AlignRight().Text($"R$ {nfeGroups.Sum(g => g.TotalAmount).ToString("N2", PtBr)}").Bold().FontColor(Colors.Green.Darken3);
            });
        });
    }

    // 3. TABELA DOS SERVIÇOS FATURADOS
    private void ComposeServicesTable(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().Text("2. EXTRATO GERAL DOS SERVIÇOS PRESTADOS").FontSize(10).Bold().FontColor(Colors.Grey.Darken4);

            col.Item().PaddingTop(4).Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(2); // Data
                    columns.RelativeColumn(3); // Documento
                    columns.RelativeColumn(6); // Serviço / Descrição
                    columns.RelativeColumn(2); // Qtd
                    columns.RelativeColumn(3); // Total R$
                });

                table.Header(header =>
                {
                    header.Cell().Element(HeaderStyle).Text("Data");
                    header.Cell().Element(HeaderStyle).Text("Documento");
                    header.Cell().Element(HeaderStyle).Text("Serviço / Descrição");
                    header.Cell().Element(HeaderStyle).AlignRight().Text("Volume");
                    header.Cell().Element(HeaderStyle).AlignRight().Text("Valor R$");
                });

                bool alternate = false;
                foreach (var item in _cycle.Items.OrderBy(i => i.ChargeDate).ThenBy(i => i.Description))
                {
                    var bg = alternate ? Colors.Grey.Lighten4 : Colors.White;
                    alternate = !alternate;

                    var docLabel = !string.IsNullOrWhiteSpace(item.DocumentNumber) && !item.DocumentNumber.Contains('/')
                        ? $"NF #{item.DocumentNumber}"
                        : (item.DocumentType ?? "Consolidado");

                    table.Cell().Element(c => CellStyle(c, bg)).Text($"{item.ChargeDate:dd/MM/yyyy}");
                    table.Cell().Element(c => CellStyle(c, bg)).Text(docLabel);
                    table.Cell().Element(c => CellStyle(c, bg)).Text(item.Description ?? item.BillingService?.Name ?? "-");
                    table.Cell().Element(c => CellStyle(c, bg)).AlignRight().Text(item.QuantityTotal.ToString("N0", PtBr));
                    table.Cell().Element(c => CellStyle(c, bg)).AlignRight().Text($"R$ {item.ServiceTotal.ToString("N2", PtBr)}").Bold();
                }

                table.Cell().ColumnSpan(3).Element(FooterStyle).Text("TOTAL FATURADO").Bold();
                table.Cell().Element(FooterStyle).AlignRight().Text(_cycle.Items.Sum(i => i.QuantityTotal).ToString("N0", PtBr)).Bold();
                table.Cell().Element(FooterStyle).AlignRight().Text($"R$ {_cycle.TotalAmount.ToString("N2", PtBr)}").Bold().FontColor(Colors.Green.Darken3);
            });
        });
    }

    // RODAPÉ
    private void ComposeFooter(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
            col.Item().PaddingTop(4).Row(row =>
            {
                row.RelativeItem().Text("Documento para simples conferência e faturamento. Emitido por CoreWMS.")
                   .FontSize(8).FontColor(Colors.Grey.Darken1);

                row.RelativeItem().AlignRight().Text(x =>
                {
                    x.DefaultTextStyle(t => t.FontSize(8).FontColor(Colors.Grey.Darken1));
                    x.Span("Página ");
                    x.CurrentPageNumber();
                    x.Span(" de ");
                    x.TotalPages();
                });
            });
        });
    }

    // ESTILOS VISUAIS
    private static IContainer HeaderStyle(IContainer container) =>
        container.Background(Colors.Blue.Darken3).Padding(4).DefaultTextStyle(x => x.SemiBold().FontColor(Colors.White).FontSize(8));

    private static IContainer CellStyle(IContainer container, string bg) =>
        container.Background(bg).PaddingVertical(3).PaddingHorizontal(4).DefaultTextStyle(x => x.FontSize(8));

    private static IContainer FooterStyle(IContainer container) =>
        container.Background(Colors.Grey.Lighten3).PaddingVertical(4).PaddingHorizontal(4).DefaultTextStyle(x => x.FontSize(8));

    // AGRUPADOR AUXILIAR
    private List<NfeGroupPdfDto> GroupItemsByNfe()
    {
        var map = new Dictionary<string, NfeGroupPdfDto>();

        foreach (var item in _cycle.Items)
        {
            var isManual = item.DocumentType?.Equals("Manual", StringComparison.OrdinalIgnoreCase) == true;
            if (isManual) continue;

            var nfeKey = !string.IsNullOrWhiteSpace(item.DocumentNumber) && !item.DocumentNumber.Contains('/')
                ? item.DocumentNumber
                : "Geral";

            if (!map.TryGetValue(nfeKey, out var group))
            {
                group = new NfeGroupPdfDto
                {
                    NfeNumber = nfeKey,
                    EntryDate = item.ChargeDate
                };
                map[nfeKey] = group;
            }

            var desc = (item.Description ?? "").ToLowerInvariant();

            if (desc.Contains("recebimento") || item.DocumentType == "NF-e Entrada")
                group.HandlingInTotal += item.ServiceTotal;
            else if (desc.Contains("ad-valorem") || desc.Contains("seguro"))
                group.AdValoremTotal += item.ServiceTotal;
            else
                group.StorageTotal += item.ServiceTotal;

            group.TotalAmount += item.ServiceTotal;
            group.VolumeTotal = Math.Max(group.VolumeTotal, item.QuantityTotal);
        }

        return map.Values.OrderByDescending(v => v.TotalAmount).ToList();
    }

    private class NfeGroupPdfDto
    {
        public string NfeNumber { get; set; } = "";
        public DateTime EntryDate { get; set; }
        public decimal VolumeTotal { get; set; }
        public decimal HandlingInTotal { get; set; }
        public decimal StorageTotal { get; set; }
        public decimal AdValoremTotal { get; set; }
        public decimal TotalAmount { get; set; }
    }
}