using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Google.Apis.Auth.OAuth2; // O namespace base da Auth
using Google.Apis.Gmail.v1;
using Google.Apis.Gmail.v1.Data;
using Google.Apis.Services;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

// 1. O Request (Command)
public record SendNfeEmailGoogleCommand(Guid DocumentId, string DestinationEmail) : IRequest<IResult>;

// 2. O Handler (Regra de Negócio)
public class SendNfeEmailGoogleHandler : IRequestHandler<SendNfeEmailGoogleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<SendNfeEmailGoogleHandler> _logger;

    public SendNfeEmailGoogleHandler(ApplicationDbContext db, ILogger<SendNfeEmailGoogleHandler> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<IResult> Handle(SendNfeEmailGoogleCommand request, CancellationToken ct)
    {
        _logger.LogInformation("[GMAIL API] A iniciar envio de NF-e para: {Email}", request.DestinationEmail);

        var doc = await _db.OutboundFiscalDocuments
            .Include(d => d.OutboundOrder)
            .ThenInclude(o => o.Company)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não disponível." });

        try
        {
            // 1. Localizar os ficheiros gerados
            string diretorioBase = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "NFePdf");
            string caminhoPdf = Path.Combine(diretorioBase, $"{doc.AccessKey}-danfe.pdf");
            string caminhoXml = Path.Combine(diretorioBase, $"{doc.AccessKey}.xml");

            if (!File.Exists(caminhoPdf))
                return Results.BadRequest(new { Message = "O PDF da DANFE não foi encontrado. Gere o PDF primeiro." });

            await File.WriteAllTextAsync(caminhoXml, doc.RawXml, ct);

            // =================================================================
            // 2. CONSTRUIR A MENSAGEM COM MIMEKIT
            // =================================================================
            var mimeMessage = new MimeMessage();
            var remetenteEmail = "faturacao@a-sua-empresa.com"; // TODO: Puxar do BD
            var remetenteNome = doc.OutboundOrder.Company.TradeName ?? "Faturação CoreWMS";

            mimeMessage.From.Add(new MailboxAddress(remetenteNome, remetenteEmail));
            mimeMessage.To.Add(new MailboxAddress("", request.DestinationEmail));
            mimeMessage.Subject = $"Nota Fiscal Eletrónica - Pedido #{doc.OutboundOrder.Id}";

            var builder = new BodyBuilder
            {
                TextBody = $"Olá!\n\nEm anexo, enviamos a sua Nota Fiscal (XML e PDF) referente ao seu pedido.\nChave de Acesso: {doc.AccessKey}\n\nObrigado!"
            };

            builder.Attachments.Add(caminhoPdf);
            builder.Attachments.Add(caminhoXml);
            mimeMessage.Body = builder.ToMessageBody();

            // =================================================================
            // 3. AUTENTICAÇÃO OAUTH 2.0 SEGURA (Google Workspace Service Account)
            // =================================================================
            string credPath = Path.Combine(Directory.GetCurrentDirectory(), "google-credentials.json");
            if (!File.Exists(credPath))
                return Results.Problem("Ficheiro de credenciais do Google Workspace não encontrado no servidor.");

            // 1. Lemos o arquivo informando explicitamente que é uma Service Account
            var serviceAccountCred = CredentialFactory.FromFile<ServiceAccountCredential>(credPath);

            // 2. Convertê-la com segurança para o formato padrão do SDK
            var credential = serviceAccountCred.ToGoogleCredential()
                .CreateScoped(GmailService.Scope.GmailSend)
                .CreateWithUser(remetenteEmail); // Impersonation (Domain-Wide Delegation)

            var gmailService = new GmailService(new BaseClientService.Initializer
            {
                HttpClientInitializer = credential,
                ApplicationName = "CoreWMS"
            });

            // =================================================================
            // 4. CONVERSÃO E ENVIO (Raw Base64Url Format exigido pela Google)
            // =================================================================
            using var memoryStream = new MemoryStream();
            await mimeMessage.WriteToAsync(memoryStream, ct);

            // A Google exige um Base64 URL-safe
            string rawMessage = Convert.ToBase64String(memoryStream.ToArray())
                .Replace('+', '-')
                .Replace('/', '_')
                .Replace("=", "");

            var gmailMessage = new Message { Raw = rawMessage };

            _logger.LogInformation("[GMAIL API] A disparar a mensagem de forma segura via REST...");

            // "me" indica que quem envia é o e-mail impersonado no CreateWithUser
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

// 3. O Endpoint (Exposição da Rota)
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