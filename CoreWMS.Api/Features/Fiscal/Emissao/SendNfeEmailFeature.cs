using System.Text;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Email;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record SendNfeEmailCommand(Guid DocumentId, string DestinationEmail) : IRequest<IResult>;

public class SendNfeEmailHandler : IRequestHandler<SendNfeEmailCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IEmailSenderService _emailSender;
    private readonly IConfiguration _config;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public SendNfeEmailHandler(
        ApplicationDbContext db,
        IEmailSenderService emailSender,
        IConfiguration config,
        IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _emailSender = emailSender;
        _config = config;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> Handle(SendNfeEmailCommand request, CancellationToken ct)
    {
        var doc = await _db.CompanyFiscalDocuments
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não disponível para envio." });

        var companyId = doc.CompanyId != Guid.Empty
            ? doc.CompanyId
            : (doc.OutboundOrder?.CompanyId ?? Guid.Empty);

        if (companyId == Guid.Empty)
            return Results.BadRequest(new { Message = "Empresa emitente não identificada." });

        var requestHttp = _httpContextAccessor.HttpContext?.Request;
        string baseUrl = _config["App:PublicBaseUrl"]
            ?? (requestHttp != null ? $"{requestHttp.Scheme}://{requestHttp.Host}" : "https://corewms.com.br");

        string danfePublicUrl = $"{baseUrl.TrimEnd('/')}/public/danfe/{doc.AccessKey}";
        string identificador = doc.OutboundOrder != null ? $"Pedido #{doc.OutboundOrder.OrderNumber}" : $"NF-e #{doc.AccessKey}";

        string xmlFileName = doc.Type.IsEvent() ? $"{doc.AccessKey}-procEvento.xml" : $"{doc.AccessKey}-procNFe.xml";
        var xmlAttachment = new EmailAttachment(xmlFileName, Encoding.UTF8.GetBytes(doc.RawXml), "text/xml");

        string htmlBody = $@"
<!DOCTYPE html>
<html>
<head><meta charset=""utf-8""/><style>body {{ font-family: sans-serif; background-color: #f8fafc; padding: 20px; }} .card {{ background: #fff; border-radius: 8px; padding: 24px; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; }} .btn {{ background: #ea580c; color: #fff !important; padding: 10px 20px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold; margin: 16px 0; }}</style></head>
<body>
  <div class=""card"">
    <h2>Nota Fiscal Eletrônica Autorizada</h2>
    <p>A nota fiscal referente a <strong>{identificador}</strong> está autorizada pela SEFAZ.</p>
    <p style=""font-family: monospace; background: #f1f5f9; padding: 10px; border-radius: 6px;"">{doc.AccessKey}</p>
    <div style=""text-align: center;""><a href=""{danfePublicUrl}"" target=""_blank"" class=""btn"">Visualizar / Imprimir DANFE</a></div>
    <p style=""font-size: 12px; color: #64748b;"">• O arquivo XML autorizado encontra-se anexado.</p>
  </div>
</body>
</html>";

        try
        {
            await _emailSender.SendAsync(new SendEmailMessage(
            CompanyId: companyId, // Sem o ".Value"
            DestinationEmail: request.DestinationEmail,
            Subject: $"Nota Fiscal Eletrônica - {identificador}",
            HtmlBody: htmlBody,
            Attachments: new List<EmailAttachment> { xmlAttachment }
        ), ct);

            return Results.Ok(new { Message = "E-mail com XML e link da DANFE enviado com sucesso!" });
        }
        catch (Exception ex)
        {
            return Results.Problem(statusCode: 500, title: "Erro ao enviar e-mail", detail: ex.Message);
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