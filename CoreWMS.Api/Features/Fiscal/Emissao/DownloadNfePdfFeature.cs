using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Fiscal.Emissao.QuestPdf; // Namespace do novo PDF
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
        _logger.LogInformation("[DANFE] Iniciando geração nativa QuestPDF ID: {DocumentId}", request.DocumentId);

        var doc = await _db.OutboundFiscalDocuments
            .AsNoTracking()
            .Include(d => d.OutboundOrder)
                .ThenInclude(o => o.Company)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não disponível." });

        try
        {
            QuestPDF.Settings.License = LicenseType.Community;

            var nfeProc = FuncoesXml.XmlStringParaClasse<nfeProc>(doc.RawXml);

            // Obtém e converte a string Base64 da empresa para byte[]
            string? logoBase64 = doc.OutboundOrder?.Company?.LogoBase64; // Substitua pelo nome exato da propriedade
            byte[]? logoBytes = ConvertBase64ToBytes(logoBase64);

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
            _logger.LogError(ex, "[DANFE - ERRO FATAL] Erro ao gerar PDF: {Message}", ex.Message);
            return Results.Problem(statusCode: 500, title: "Erro ao gerar PDF", detail: ex.Message);
        }
    }

    private byte[]? ConvertBase64ToBytes(string? base64String)
    {
        if (string.IsNullOrWhiteSpace(base64String))
            return null;

        try
        {
            // Trata o prefixo Data URI ("data:image/png;base64,...") caso exista
            string cleanBase64 = base64String.Contains(",")
                ? base64String.Split(',')[1]
                : base64String;

            return Convert.FromBase64String(cleanBase64.Trim());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[DANFE] Falha ao converter string Base64 da logomarca da empresa.");
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