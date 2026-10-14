using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Fiscal.Emissao.QuestPdf;
using DFe.Utils;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NFe.Classes;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record DownloadNfePdfQuery(Guid DocumentId) : IRequest<IResult>;

public class DownloadNfePdfHandler : IRequestHandler<DownloadNfePdfQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<DownloadNfePdfHandler> _logger;

    public DownloadNfePdfHandler(ApplicationDbContext db, ILogger<DownloadNfePdfHandler> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<IResult> Handle(DownloadNfePdfQuery request, CancellationToken ct)
    {
        _logger.LogInformation("[PDF FISCAL] Iniciando geração nativa QuestPDF ID: {DocumentId}", request.DocumentId);

        var doc = await _db.CompanyFiscalDocuments
            .AsNoTracking()
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
                .ThenInclude(o => o!.Company)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não disponível." });

        try
        {
            QuestPDF.Settings.License = LicenseType.Community;

            string? logoBase64 = doc.Company?.LogoBase64 ?? doc.OutboundOrder?.Company?.LogoBase64;
            byte[]? logoBytes = ConvertBase64ToBytes(logoBase64);

            // 1. SE FOR EVENTO FISCAL (Cancelamento ou Carta de Correção)
            if (doc.Type.IsEvent())
            {
                var mainNfeDoc = await _db.CompanyFiscalDocuments
                    .AsNoTracking()
                    .FirstOrDefaultAsync(d => d.AccessKey == doc.AccessKey
                                           && (int)d.Type >= 1 && (int)d.Type <= 6
                                           && !string.IsNullOrWhiteSpace(d.RawXml), ct);

                if (mainNfeDoc == null || string.IsNullOrWhiteSpace(mainNfeDoc.RawXml))
                    return Results.BadRequest(new { Message = "NF-e original vinculada ao evento não foi encontrada." });

                byte[] eventPdfBytes = await Task.Run(() =>
                {
                    IDocument document = new EventoNfeDocument(mainNfeDoc.RawXml, doc.RawXml, logoBytes);
                    return document.GeneratePdf();
                }, ct);

                string nomeArquivoEvento = doc.Type == FiscalDocumentType.CartaCorrecao
                    ? $"{doc.AccessKey}-cce.pdf"
                    : $"{doc.AccessKey}-cancelamento.pdf";

                return Results.File(eventPdfBytes, "application/pdf", nomeArquivoEvento);
            }

            // 2. SE FOR A NF-E PRINCIPAL (DANFE Retrato ou Paisagem)
            nfeProc? nfeProc;
            try
            {
                nfeProc = FuncoesXml.XmlStringParaClasse<nfeProc>(doc.RawXml);
            }
            catch
            {
                var nfe = FuncoesXml.XmlStringParaClasse<NFe.Classes.NFe>(doc.RawXml)
                    ?? throw new InvalidOperationException("Não foi possível desserializar o XML da NF-e.");
                nfeProc = new nfeProc { NFe = nfe };
            }

            byte[] pdfBytes = await Task.Run(() =>
            {
                IDocument document = nfeProc.NFe.infNFe.ide.tpImp == NFe.Classes.Informacoes.Identificacao.Tipos.TipoImpressao.tiPaisagem
                    ? new DanfePaisagemDocument(nfeProc, logoBytes)
                    : new DanfeRetratoDocument(nfeProc, logoBytes);

                return document.GeneratePdf();
            }, ct);

            string nomeArquivo = $"{doc.AccessKey}-danfe.pdf";
            return Results.File(pdfBytes, "application/pdf", nomeArquivo);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PDF FISCAL - ERRO FATAL] Erro ao gerar PDF: {Message}", ex.Message);
            return Results.Problem(statusCode: 500, title: "Erro ao gerar PDF", detail: ex.Message);
        }
    }

    private byte[]? ConvertBase64ToBytes(string? base64String)
    {
        if (string.IsNullOrWhiteSpace(base64String))
            return null;

        try
        {
            string cleanBase64 = base64String.Contains(",")
                ? base64String.Split(',')[1]
                : base64String;

            return Convert.FromBase64String(cleanBase64.Trim());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[PDF FISCAL] Falha ao converter string Base64 da logomarca da empresa.");
            return null;
        }
    }
}

public static class DownloadNfePdfEndpoints
{
    public static void MapDownloadNfePdfEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/fiscal/nfe/{documentId:guid}/pdf", async (Guid documentId, IMediator mediator) =>
            await mediator.Send(new DownloadNfePdfQuery(documentId)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Identity.Constants.Permissions.Outbound.View);
    }
}