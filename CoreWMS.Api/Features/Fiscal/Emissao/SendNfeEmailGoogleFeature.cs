using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Gmail.v1;
using Google.Apis.Gmail.v1.Data;
using Google.Apis.Services;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record SendNfeEmailGoogleCommand(Guid DocumentId, string DestinationEmail) : IRequest<IResult>;

public class SendNfeEmailGoogleHandler : IRequestHandler<SendNfeEmailGoogleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<SendNfeEmailGoogleHandler> _logger;
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _config;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public SendNfeEmailGoogleHandler(
        ApplicationDbContext db,
        ILogger<SendNfeEmailGoogleHandler> logger,
        IWebHostEnvironment env,
        IConfiguration config,
        IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _logger = logger;
        _env = env;
        _config = config;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> Handle(SendNfeEmailGoogleCommand request, CancellationToken ct)
    {
        _logger.LogInformation("[GMAIL API] Iniciando envio de NF-e para: {Email}", request.DestinationEmail);

        var doc = await _db.CompanyFiscalDocuments
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não disponível." });

        try
        {
            var requestHttp = _httpContextAccessor.HttpContext?.Request;
            string baseUrl = _config["App:PublicBaseUrl"]
                ?? (requestHttp != null ? $"{requestHttp.Scheme}://{requestHttp.Host}" : "https://corewms.com.br");

            string danfePublicUrl = $"{baseUrl.TrimEnd('/')}/public/danfe/{doc.AccessKey}";

            var remetenteEmail = _config["GoogleWorkspace:SenderEmail"] ?? "faturacao@a-sua-empresa.com";
            var remetenteNome = doc.Company?.TradeName
                ?? doc.Company?.CorporateName
                ?? doc.OutboundOrder?.Company?.TradeName
                ?? "Faturamento CoreWMS";

            string identificadorDocumento = doc.OutboundOrder != null
                ? $"Pedido #{doc.OutboundOrder.OrderNumber}"
                : $"Documento Fiscal #{doc.AccessKey}";

            var mimeMessage = new MimeMessage();
            mimeMessage.From.Add(new MailboxAddress(remetenteNome, remetenteEmail));
            mimeMessage.To.Add(new MailboxAddress("", request.DestinationEmail));
            mimeMessage.Subject = $"Nota Fiscal Eletrônica - {identificadorDocumento}";

            var builder = new BodyBuilder
            {
                HtmlBody = $@"
<!DOCTYPE html>
<html>
<head>
  <meta charset=""utf-8""/>
  <style>
    body {{ font-family: Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }}
    .card {{ background-color: #ffffff; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }}
    .header {{ font-size: 18px; font-weight: bold; color: #0f172a; margin-bottom: 12px; }}
    .text {{ font-size: 14px; line-height: 1.5; color: #334155; margin-bottom: 16px; }}
    .btn {{ display: inline-block; background-color: #ea580c; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin: 16px 0; }}
    .key-box {{ background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; font-family: monospace; font-size: 13px; font-weight: bold; word-break: break-all; color: #0f172a; margin-bottom: 20px; text-align: center; }}
    .footer {{ font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }}
  </style>
</head>
<body>
  <div class=""card"">
    <div class=""header"">{remetenteNome}</div>
    <div class=""text"">
      Olá,<br/><br/>
      A sua Nota Fiscal Eletrônica referente a <strong>{identificadorDocumento}</strong> foi autorizada com sucesso na SEFAZ.
    </div>

    <div class=""key-box"">
      {doc.AccessKey}
    </div>

    <div style=""text-align: center;"">
      <a href=""{danfePublicUrl}"" target=""_blank"" class=""btn"">
        Visualizar e Imprimir DANFE Online
      </a>
    </div>

    <div class=""text"" style=""margin-top: 18px; font-size: 13px;"">
      • O arquivo XML autorizado encontra-se anexado a este e-mail.<br/>
      • O documento pode ser consultado a qualquer momento pelo link acima.
    </div>

    <div class=""footer"">
      Esta é uma mensagem automática enviada pelo CoreWMS Fiscal.
    </div>
  </div>
</body>
</html>"
            };

            // Anexa o XML diretamente da memória sem tocar no disco
            var xmlBytes = Encoding.UTF8.GetBytes(doc.RawXml);
            string xmlFileName = doc.Type.IsEvent() ? $"{doc.AccessKey}-procEvento.xml" : $"{doc.AccessKey}-procNFe.xml";
            builder.Attachments.Add(xmlFileName, xmlBytes, ContentType.Parse("text/xml"));

            mimeMessage.Body = builder.ToMessageBody();

            string credPath = Path.Combine(_env.ContentRootPath, "google-credentials.json");
            if (!File.Exists(credPath))
                return Results.Problem("Arquivo de credenciais do Google Workspace não encontrado no servidor.");

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

            _logger.LogInformation("[GMAIL API] Sucesso! E-mail com XML e link da DANFE enviado para {Email}", request.DestinationEmail);
            return Results.Ok(new { Message = "E-mail com XML e link da DANFE enviado com sucesso via Google Workspace!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[GMAIL API - ERRO] Falha no envio: {Message}", ex.Message);
            return Results.Problem(statusCode: 500, title: "Erro ao enviar E-mail via Google Workspace", detail: ex.Message);
        }
    }
}

public static class SendNfeEmailGoogleEndpoints
{
    public static void MapSendNfeEmailGoogleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/fiscal/nfe/{documentId:guid}/email-google", async (Guid documentId, [FromQuery] string destinationEmail, IMediator mediator) =>
            await mediator.Send(new SendNfeEmailGoogleCommand(documentId, destinationEmail)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Identity.Constants.Permissions.Outbound.View);
    }
}