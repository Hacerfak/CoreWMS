using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using NFe.Utils.Email;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record SendNfeEmailCommand(Guid DocumentId, string DestinationEmail) : IRequest<IResult>;

public class SendNfeEmailHandler : IRequestHandler<SendNfeEmailCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<SendNfeEmailHandler> _logger;
    private readonly IWebHostEnvironment _env;

    public SendNfeEmailHandler(ApplicationDbContext db, ILogger<SendNfeEmailHandler> logger, IWebHostEnvironment env)
    {
        _db = db;
        _logger = logger;
        _env = env;
    }

    public async Task<IResult> Handle(SendNfeEmailCommand request, CancellationToken ct)
    {
        _logger.LogInformation("[EMAIL] A preparar envio de NF-e para: {Email}", request.DestinationEmail);

        var doc = await _db.CompanyFiscalDocuments
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não está disponível." });

        string caminhoXmlTemporario = string.Empty;

        try
        {
            string diretorioBase = Path.Combine(_env.ContentRootPath, "uploads", "NFePdf");

            // Define o nome do PDF de acordo com o tipo (DANFE, CC-e ou Cancelamento)
            string pdfFileName = doc.Type switch
            {
                FiscalDocumentType.CartaCorrecao => $"{doc.AccessKey}-cce.pdf",
                FiscalDocumentType.Cancelamento => $"{doc.AccessKey}-cancelamento.pdf",
                _ => $"{doc.AccessKey}-danfe.pdf"
            };

            string caminhoPdf = Path.Combine(diretorioBase, pdfFileName);

            // Fallback de compatibilidade se o arquivo tiver sido gravado com sufixo -danfe.pdf
            if (!File.Exists(caminhoPdf))
            {
                caminhoPdf = Path.Combine(diretorioBase, $"{doc.AccessKey}-danfe.pdf");
            }

            if (!File.Exists(caminhoPdf))
            {
                return Results.BadRequest(new { Message = "O PDF do documento fiscal não foi encontrado. Por favor, gere o PDF primeiro." });
            }

            caminhoXmlTemporario = Path.Combine(diretorioBase, $"{doc.AccessKey}_{Guid.NewGuid():N}.xml");
            await File.WriteAllTextAsync(caminhoXmlTemporario, doc.RawXml, ct);

            string identificadorDocumento = doc.OutboundOrder != null
                ? $"Pedido #{doc.OutboundOrder.OrderNumber}"
                : $"Documento Fiscal #{doc.AccessKey ?? doc.Id.ToString()}";

            string nomeRemetente = doc.Company?.TradeName
                ?? doc.OutboundOrder?.Company?.TradeName
                ?? "Departamento de Faturamento";

            var configEmail = new ConfiguracaoEmail(
                email: "faturacao@a-sua-empresa.com",
                senha: "senha-app-ou-smtp",
                assunto: $"Nota Fiscal Eletrônica - {identificadorDocumento}",
                mensagem: $"Olá!\n\nEm anexo, enviamos o seu documento fiscal (XML e PDF) referente a: {identificadorDocumento}.\nChave de Acesso: {doc.AccessKey}\n\nObrigado!",
                servidorSmtp: "smtp.a-sua-empresa.com",
                porta: 587,
                ssl: true,
                mensagemHtml: false,
                timeout: 30000,
                assincrono: false
            )
            {
                Nome = nomeRemetente
            };

            var emailBuilder = new EmailBuilder(configEmail);
            emailBuilder.AdicionarDestinatario(request.DestinationEmail);
            emailBuilder.AdicionarAnexo(caminhoPdf);
            emailBuilder.AdicionarAnexo(caminhoXmlTemporario);

            _logger.LogInformation("[EMAIL] A disparar a mensagem via SMTP...");
            emailBuilder.Enviar();

            _logger.LogInformation("[EMAIL] SUCESSO! E-mail enviado para {Email}", request.DestinationEmail);
            return Results.Ok(new { Message = "E-mail enviado com sucesso com PDF e XML em anexo!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[EMAIL - ERRO] Falha no envio via SMTP: {Message}", ex.Message);
            return Results.Problem(statusCode: 500, title: "Erro ao enviar E-mail", detail: ex.Message);
        }
        finally
        {
            if (!string.IsNullOrEmpty(caminhoXmlTemporario) && File.Exists(caminhoXmlTemporario))
            {
                try { File.Delete(caminhoXmlTemporario); } catch { /* Ignora falha na limpeza */ }
            }
        }
    }
}

public static class SendNfeEmailEndpoint
{
    public static void MapSendNfeEmailEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/fiscal/nfe/{documentId:guid}/email", async (Guid documentId, [FromQuery] string destinationEmail, IMediator mediator) =>
            await mediator.Send(new SendNfeEmailCommand(documentId, destinationEmail)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Identity.Constants.Permissions.Outbound.View);
    }
}