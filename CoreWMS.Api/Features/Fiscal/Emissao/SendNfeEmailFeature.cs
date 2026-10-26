using System.Text;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Email;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record SendNfeEmailCommand(Guid DocumentId, string? DestinationEmail = null) : IRequest<IResult>;

public class SendNfeEmailHandler : IRequestHandler<SendNfeEmailCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IEmailSenderService _emailSender;
    private readonly IConfiguration _config;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<SendNfeEmailHandler> _logger;

    public SendNfeEmailHandler(
        ApplicationDbContext db,
        IEmailSenderService emailSender,
        IConfiguration config,
        IHttpContextAccessor httpContextAccessor,
        ILogger<SendNfeEmailHandler> logger)
    {
        _db = db;
        _emailSender = emailSender;
        _config = config;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
    }

    public async Task<IResult> Handle(SendNfeEmailCommand request, CancellationToken ct)
    {
        var doc = await _db.CompanyFiscalDocuments
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
                .ThenInclude(o => o!.Customer)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null)
            return Results.NotFound(new { Message = "Documento fiscal não encontrado." });

        if (string.IsNullOrWhiteSpace(doc.RawXml))
            return Results.BadRequest(new { Message = "XML autorizado não disponível para envio." });

        // Identifica o e-mail destino: manual ou automático do depositante (Customer)
        string destinationEmail = !string.IsNullOrWhiteSpace(request.DestinationEmail)
            ? request.DestinationEmail.Trim()
            : (doc.OutboundOrder?.Customer?.Email?.Trim() ?? string.Empty);

        if (string.IsNullOrWhiteSpace(destinationEmail))
        {
            return Results.BadRequest(new
            {
                Message = "Nenhum endereço de e-mail informado e o depositante não possui e-mail cadastrado."
            });
        }

        var companyId = doc.CompanyId != Guid.Empty
            ? doc.CompanyId
            : (doc.OutboundOrder?.CompanyId ?? Guid.Empty);

        if (companyId == Guid.Empty)
            return Results.BadRequest(new { Message = "Empresa emitente não identificada." });

        var requestHttp = _httpContextAccessor.HttpContext?.Request;
        string baseUrl = _config["App:PublicBaseUrl"]
            ?? (requestHttp != null ? $"{requestHttp.Scheme}://{requestHttp.Host}" : "https://corewms.com.br");

        string danfePublicUrl = $"{baseUrl.TrimEnd('/')}/public/danfe/{doc.AccessKey}";
        string identificador = doc.OutboundOrder != null
            ? $"Pedido #{doc.OutboundOrder.OrderNumber}"
            : $"NF-e #{doc.AccessKey}";

        string xmlFileName = doc.Type.IsEvent() ? $"{doc.AccessKey}-procEvento.xml" : $"{doc.AccessKey}-procNFe.xml";
        var xmlAttachment = new EmailAttachment(xmlFileName, Encoding.UTF8.GetBytes(doc.RawXml), "text/xml");

        string htmlBody = $@"
<!DOCTYPE html>
<html>
<head><meta charset=""utf-8""/><style>body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b; }} .card {{ background: #fff; border-radius: 12px; padding: 32px; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }} .btn {{ background: #ea580c; color: #fff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold; margin: 18px 0; }} .key {{ font-family: monospace; background: #f1f5f9; padding: 10px; border-radius: 6px; font-weight: bold; text-align: center; word-break: break-all; }}</style></head>
<body>
  <div class=""card"">
    <h2 style=""margin-top: 0; color: #0f172a;"">Nota Fiscal Eletrônica Autorizada</h2>
    <p>A nota fiscal referente a <strong>{identificador}</strong> foi autorizada com sucesso na SEFAZ.</p>
    <div class=""key"">{doc.AccessKey}</div>
    <div style=""text-align: center;"">
      <a href=""{danfePublicUrl}"" target=""_blank"" class=""btn"">Visualizar / Imprimir DANFE Online</a>
    </div>
    <p style=""font-size: 13px; color: #64748b;"">
      • O arquivo XML autorizado encontra-se anexado a esta mensagem.<br/>
      • A DANFE pode ser consultada a qualquer momento através do link acima.
    </p>
  </div>
</body>
</html>";

        try
        {
            await _emailSender.SendAsync(new SendEmailMessage(
                CompanyId: companyId,
                DestinationEmail: destinationEmail,
                Subject: $"Nota Fiscal Eletrônica - {identificador}",
                HtmlBody: htmlBody,
                Attachments: new List<EmailAttachment> { xmlAttachment }
            ), ct);

            _logger.LogInformation("[DISPARO NF-E] E-mail enviado com sucesso para {Email} (Doc: {DocId})", destinationEmail, doc.Id);
            return Results.Ok(new { Message = $"E-mail com XML e link da DANFE enviado com sucesso para {destinationEmail}!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[DISPARO NF-E - ERRO] Falha ao enviar para {Email}: {Msg}", destinationEmail, ex.Message);
            return Results.Problem(statusCode: 500, title: "Erro ao enviar e-mail", detail: ex.Message);
        }
    }
}

public static class SendNfeEmailEndpoints
{
    public static void MapSendNfeEmailEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/fiscal/nfe/{documentId:guid}/email", async (Guid documentId, [FromQuery] string? destinationEmail, IMediator mediator) =>
            await mediator.Send(new SendNfeEmailCommand(documentId, destinationEmail)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Identity.Constants.Permissions.Outbound.View);
    }
}