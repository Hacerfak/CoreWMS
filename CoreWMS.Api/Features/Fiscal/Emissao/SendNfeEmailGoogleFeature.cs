using System.Text;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Gmail.v1;
using Google.Apis.Gmail.v1.Data;
using Google.Apis.Services;
using MediatR;
using Microsoft.EntityFrameworkCore;
using MimeKit;
using Microsoft.AspNetCore.Mvc;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record SendNfeEmailGoogleCommand(Guid DocumentId, string DestinationEmail) : IRequest<IResult>;

public class SendNfeEmailGoogleHandler : IRequestHandler<SendNfeEmailGoogleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<SendNfeEmailGoogleHandler> _logger;
    private readonly IWebHostEnvironment _env;

    public SendNfeEmailGoogleHandler(ApplicationDbContext db, ILogger<SendNfeEmailGoogleHandler> logger, IWebHostEnvironment env)
    {
        _db = db;
        _logger = logger;
        _env = env;
    }

    public async Task<IResult> Handle(SendNfeEmailGoogleCommand request, CancellationToken ct)
    {
        _logger.LogInformation("[GMAIL API] A iniciar envio de NF-e para: {Email}", request.DestinationEmail);

        var doc = await _db.CompanyFiscalDocuments
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não disponível." });

        try
        {
            string diretorioBase = Path.Combine(_env.ContentRootPath, "uploads", "NFePdf");

            string pdfFileName = doc.Type switch
            {
                FiscalDocumentType.CartaCorrecao => $"{doc.AccessKey}-cce.pdf",
                FiscalDocumentType.Cancelamento => $"{doc.AccessKey}-cancelamento.pdf",
                _ => $"{doc.AccessKey}-danfe.pdf"
            };

            string caminhoPdf = Path.Combine(diretorioBase, pdfFileName);

            if (!File.Exists(caminhoPdf))
            {
                caminhoPdf = Path.Combine(diretorioBase, $"{doc.AccessKey}-danfe.pdf");
            }

            if (!File.Exists(caminhoPdf))
                return Results.BadRequest(new { Message = "O PDF do documento fiscal não foi encontrado. Gere o PDF primeiro." });

            var remetenteEmail = "faturacao@a-sua-empresa.com";
            var remetenteNome = doc.Company?.TradeName
                ?? doc.OutboundOrder?.Company?.TradeName
                ?? "Faturação CoreWMS";

            string identificadorDocumento = doc.OutboundOrder != null
                ? $"Pedido #{doc.OutboundOrder.OrderNumber}"
                : $"Documento Fiscal #{doc.AccessKey ?? doc.Id.ToString()}";

            var mimeMessage = new MimeMessage();
            mimeMessage.From.Add(new MailboxAddress(remetenteNome, remetenteEmail));
            mimeMessage.To.Add(new MailboxAddress("", request.DestinationEmail));
            mimeMessage.Subject = $"Nota Fiscal Eletrônica - {identificadorDocumento}";

            var builder = new BodyBuilder
            {
                TextBody = $"Olá!\n\nEm anexo, enviamos a sua Nota Fiscal referente a: {identificadorDocumento}.\nChave de Acesso: {doc.AccessKey}\n\nObrigado!"
            };

            builder.Attachments.Add(caminhoPdf);

            // Anexa o XML diretamente da memória sem tocar no disco
            var xmlBytes = Encoding.UTF8.GetBytes(doc.RawXml);
            using var xmlStream = new MemoryStream(xmlBytes);

            string xmlFileName = doc.Type.IsEvent() ? $"{doc.AccessKey}-procEvento.xml" : $"{doc.AccessKey}-procNFe.xml";
            builder.Attachments.Add(xmlFileName, xmlStream, ContentType.Parse("text/xml"));

            mimeMessage.Body = builder.ToMessageBody();

            string credPath = Path.Combine(_env.ContentRootPath, "google-credentials.json");
            if (!File.Exists(credPath))
                return Results.Problem("Ficheiro de credenciais do Google Workspace não encontrado no servidor.");

            var serviceAccountCred = CredentialFactory.FromFile<ServiceAccountCredential>(credPath);

            var credential = serviceAccountCred.ToGoogleCredential()
                .CreateScoped(GmailService.Scope.GmailSend)
                .CreateWithUser(remetenteEmail);

            var gmailService = new GmailService(new BaseClientService.Initializer
            {
                HttpClientInitializer = credential,
                ApplicationName = "CoreWMS"
            });

            using var memoryStream = new MemoryStream();
            await mimeMessage.WriteToAsync(memoryStream, ct);

            string rawMessage = Convert.ToBase64String(memoryStream.ToArray())
                .Replace('+', '-')
                .Replace('/', '_')
                .Replace("=", "");

            var gmailMessage = new Message { Raw = rawMessage };

            await gmailService.Users.Messages.Send(gmailMessage, "me").ExecuteAsync(ct);

            _logger.LogInformation("[GMAIL API] SUCESSO! E-mail enviado com anexos para {Email}", request.DestinationEmail);
            return Results.Ok(new { Message = "E-mail enviado com sucesso via Google Workspace!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[GMAIL API - ERRO] Falha no envio via Google: {Message}", ex.Message);
            return Results.Problem(statusCode: 500, title: "Erro ao enviar E-mail via Google Workspace", detail: ex.Message);
        }
    }
}

public static class SendNfeEmailGoogleEndpoint
{
    public static void MapSendNfeEmailGoogleEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/fiscal/nfe/{documentId:guid}/email-google", async (Guid documentId, [FromQuery] string destinationEmail, IMediator mediator) =>
            await mediator.Send(new SendNfeEmailGoogleCommand(documentId, destinationEmail)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Identity.Constants.Permissions.Outbound.View);
    }
}