using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Utils;
using FastReport;
using FastReport.Export.PdfSimple;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NFe.Classes;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record DownloadNfePdfQuery(Guid DocumentId) : IRequest<IResult>;

public class DownloadNfePdfHandler : IRequestHandler<DownloadNfePdfQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<DownloadNfePdfHandler> _logger;
    private readonly IWebHostEnvironment _env;

    public DownloadNfePdfHandler(ApplicationDbContext db, ILogger<DownloadNfePdfHandler> logger, IWebHostEnvironment env)
    {
        _db = db;
        _logger = logger;
        _env = env;
    }

    public async Task<IResult> Handle(DownloadNfePdfQuery request, CancellationToken ct)
    {
        _logger.LogInformation("[DANFE] A iniciar geração de PDF para o Documento Fiscal ID: {DocumentId}", request.DocumentId);

        var doc = await _db.OutboundFiscalDocuments
            .Include(d => d.OutboundOrder)
            .ThenInclude(o => o.Company)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não disponível." });

        try
        {
            var nfeProc = FuncoesXml.XmlStringParaClasse<nfeProc>(doc.RawXml);

            string frxPath = Path.Combine(_env.ContentRootPath, "Assets", "Fiscal", "NFeRetrato.frx");
            if (!File.Exists(frxPath)) return Results.Problem($"O template {frxPath} não foi encontrado.");

            string diretorioBase = Path.Combine(_env.ContentRootPath, "uploads", "NFePdf");
            if (!Directory.Exists(diretorioBase)) Directory.CreateDirectory(diretorioBase);

            string nomeArquivo = $"{doc.AccessKey}-danfe.pdf";
            string caminhoFinalPdf = Path.Combine(diretorioBase, nomeArquivo);

            // CORREÇÃO: Encapsula a renderização pesada (que usa CPU e IO síncrono) numa Background Task
            // para não estrangular as Workers Threads do Kestrel.
            await Task.Run(() =>
            {
                using var report = new Report();
                report.Load(frxPath);
                report.RegisterData(new[] { nfeProc }, "NFe", 20);
                report.GetDataSource("NFe").Enabled = true;

                ConfigurarParametrosDanfe(report, nfeProc, doc.Status == Entities.FiscalDocumentStatus.Canceled);

                report.Prepare();

                using var pdfExport = new PDFSimpleExport();
                report.Export(pdfExport, caminhoFinalPdf);
            }, ct);

            _logger.LogInformation("[DANFE] PDF gerado com sucesso: {Path}", caminhoFinalPdf);

            byte[] pdfBytes = await File.ReadAllBytesAsync(caminhoFinalPdf, ct);
            return Results.File(pdfBytes, "application/pdf", nomeArquivo);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[DANFE - ERRO FATAL] Erro ao gerar PDF: {Message}", ex.Message);
            return Results.Problem(statusCode: 500, title: "Erro ao gerar PDF", detail: ex.Message);
        }
    }

    private void ConfigurarParametrosDanfe(Report report, nfeProc proc, bool cancelado)
    {
        string resumoCanhoto = $"Emissão: {proc.NFe.infNFe.ide.dhEmi:dd/MM/yyyy} Dest/Reme: {proc.NFe.infNFe.dest.xNome} Valor Total: {proc.NFe.infNFe.total.ICMSTot.vNF:C}";
        string mensagem = cancelado ? "NFe Cancelada" : (proc.NFe.infNFe.ide.tpAmb == DFe.Classes.Flags.TipoAmbiente.Homologacao ? "NFe sem Valor Fiscal - HOMOLOGAÇÃO" : string.Empty);

        report.SetParameterValue("ResumoCanhoto", resumoCanhoto);
        report.SetParameterValue("Mensagem", mensagem);
        report.SetParameterValue("ConsultaAutenticidade", string.Empty);
        report.SetParameterValue("ContingenciaDescricao", string.Empty);
        report.SetParameterValue("ContingenciaValor", string.Empty);
        report.SetParameterValue("ContingenciaID", string.Empty);
        report.SetParameterValue("DuasLinhas", false);
        report.SetParameterValue("Desenvolvedor", "CoreWMS");
        report.SetParameterValue("QuebrarLinhasObservacao", true);
        report.SetParameterValue("ImprimirISSQN", false);
        report.SetParameterValue("ImprimirDescPorc", true);
        report.SetParameterValue("ImprimirTotalLiquido", true);
        report.SetParameterValue("ImprimirUnidQtdeValor", 1);
        report.SetParameterValue("ExibeCampoFatura", false);
        report.SetParameterValue("Logo", Array.Empty<byte>());
        report.SetParameterValue("ExibirTotalTributos", true);
        report.SetParameterValue("ExibeRetencoes", false);
        report.SetParameterValue("DecimaisValorUnitario", 4);
        report.SetParameterValue("DecimaisQuantidadeItem", 4);
        report.SetParameterValue("DataHoraImpressao", DateTime.Now);
    }
}

public static class DownloadNfePdfEndpoint
{
    public static void MapDownloadNfePdfEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/fiscal/nfe/{documentId:guid}/pdf", async (Guid documentId, IMediator mediator) =>
            await mediator.Send(new DownloadNfePdfQuery(documentId)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Identity.Constants.Permissions.Outbound.View);
    }
}