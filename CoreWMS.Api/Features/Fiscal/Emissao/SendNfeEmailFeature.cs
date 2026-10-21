using System;
using System.IO;
using System.Text;
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
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NFe.Utils.Email;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record SendNfeEmailCommand(Guid DocumentId, string DestinationEmail) : IRequest<IResult>;

public class SendNfeEmailHandler : IRequestHandler<SendNfeEmailCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<SendNfeEmailHandler> _logger;
    private readonly IWebHostEnvironment _env;
    private readonly IConfiguration _config;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public SendNfeEmailHandler(
        ApplicationDbContext db,
        ILogger<SendNfeEmailHandler> logger,
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

    public async Task<IResult> Handle(SendNfeEmailCommand request, CancellationToken ct)
    {
        _logger.LogInformation("[EMAIL SMTP] Preparando envio de NF-e para: {Email}", request.DestinationEmail);

        var doc = await _db.CompanyFiscalDocuments
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não disponível." });

        string caminhoXmlTemporario = string.Empty;

        try
        {
            // Resolução da URL base pública da aplicação
            var requestHttp = _httpContextAccessor.HttpContext?.Request;
            string baseUrl = _config["App:PublicBaseUrl"]
                ?? (requestHttp != null ? $"{requestHttp.Scheme}://{requestHttp.Host}" : "https://corewms.com.br");

            string danfePublicUrl = $"{baseUrl.TrimEnd('/')}/public/danfe/{doc.AccessKey}";

            string identificadorDocumento = doc.OutboundOrder != null
                ? $"Pedido #{doc.OutboundOrder.OrderNumber}"
                : $"Documento Fiscal #{doc.AccessKey}";

            string nomeRemetente = doc.Company?.TradeName
                ?? doc.Company?.CorporateName
                ?? doc.OutboundOrder?.Company?.TradeName
                ?? "Faturamento CoreWMS";

            // Salva o XML em pasta temporária apenas durante o disparo do Zeus
            string tempDir = Path.Combine(Path.GetTempPath(), "CoreWMS_XmlCache");
            Directory.CreateDirectory(tempDir);
            string xmlFileName = doc.Type.IsEvent() ? $"{doc.AccessKey}-procEvento.xml" : $"{doc.AccessKey}-procNFe.xml";
            caminhoXmlTemporario = Path.Combine(tempDir, xmlFileName);
            await File.WriteAllTextAsync(caminhoXmlTemporario, doc.RawXml, Encoding.UTF8, ct);

            // Template HTML do E-mail
            string mensagemHtml = $@"
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
    <div class=""header"">{nomeRemetente}</div>
    <div class=""text"">
      Olá,<br/><br/>
      Informamos que a sua Nota Fiscal Eletrônica referente a <strong>{identificadorDocumento}</strong> foi autorizada com sucesso.
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
      • O arquivo XML autorizado encontra-se anexado a esta mensagem.<br/>
      • A DANFE pode ser visualizada ou impressa em PDF a qualquer momento pelo link acima.
    </div>

    <div class=""footer"">
      Esta é uma mensagem automática enviada pelo sistema CoreWMS Fiscal.
    </div>
  </div>
</body>
</html>";

            var configEmail = new ConfiguracaoEmail(
                email: _config["Email:SmtpUser"] ?? "faturacao@a-sua-empresa.com",
                senha: _config["Email:SmtpPassword"] ?? "senha-app-ou-smtp",
                assunto: $"Nota Fiscal Eletrônica - {identificadorDocumento}",
                mensagem: mensagemHtml,
                servidorSmtp: _config["Email:SmtpHost"] ?? "smtp.a-sua-empresa.com",
                porta: int.TryParse(_config["Email:SmtpPort"], out int port) ? port : 587,
                ssl: true,
                mensagemHtml: true,
                timeout: 30000,
                assincrono: false
            )
            {
                Nome = nomeRemetente
            };

            var emailBuilder = new EmailBuilder(configEmail);
            emailBuilder.AdicionarDestinatario(request.DestinationEmail);
            emailBuilder.AdicionarAnexo(caminhoXmlTemporario);

            _logger.LogInformation("[EMAIL SMTP] Disparando e-mail para {Email}...", request.DestinationEmail);
            emailBuilder.Enviar();

            _logger.LogInformation("[EMAIL SMTP] Sucesso! E-mail enviado para {Email}", request.DestinationEmail);
            return Results.Ok(new { Message = "E-mail com XML e link da DANFE enviado com sucesso!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[EMAIL SMTP - ERRO] Falha no envio: {Message}", ex.Message);
            return Results.Problem(statusCode: 500, title: "Erro ao enviar E-mail", detail: ex.Message);
        }
        finally
        {
            if (!string.IsNullOrEmpty(caminhoXmlTemporario) && File.Exists(caminhoXmlTemporario))
            {
                try { File.Delete(caminhoXmlTemporario); } catch { }
            }
        }
    }
}

public static class SendNfeEmailEndpoints
{
    public static void MapSendNfeEmailEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/fiscal/nfe/{documentId:guid}/email", async (Guid documentId, [FromQuery] string destinationEmail, IMediator mediator) =>
            await mediator.Send(new SendNfeEmailCommand(documentId, destinationEmail)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Identity.Constants.Permissions.Outbound.View);
    }
}