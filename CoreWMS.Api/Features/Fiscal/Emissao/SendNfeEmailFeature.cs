using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NFe.Utils.Email;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

// 1. O Request (Command)
public record SendNfeEmailCommand(Guid DocumentId, string DestinationEmail) : IRequest<IResult>;

// 2. O Handler (Regra de Negócio)
public class SendNfeEmailHandler : IRequestHandler<SendNfeEmailCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<SendNfeEmailHandler> _logger;

    public SendNfeEmailHandler(ApplicationDbContext db, ILogger<SendNfeEmailHandler> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<IResult> Handle(SendNfeEmailCommand request, CancellationToken ct)
    {
        _logger.LogInformation("[EMAIL] A preparar envio de NF-e para: {Email}", request.DestinationEmail);

        var doc = await _db.OutboundFiscalDocuments
            .Include(d => d.OutboundOrder)
            .ThenInclude(o => o.Company)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não está disponível." });

        try
        {
            string diretorioBase = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "NFePdf");
            string caminhoPdf = Path.Combine(diretorioBase, $"{doc.AccessKey}-danfe.pdf");
            string caminhoXml = Path.Combine(diretorioBase, $"{doc.AccessKey}.xml");

            if (!File.Exists(caminhoPdf))
            {
                return Results.BadRequest(new { Message = "O PDF da DANFE ainda não foi gerado. Por favor, gere o PDF primeiro." });
            }

            // O EmailBuilder do Zeus exige o caminho físico do ficheiro
            await File.WriteAllTextAsync(caminhoXml, doc.RawXml, ct);

            // TODO: No futuro, puxar estes dados do IOptions ou do cadastro da Company
            var configEmail = new ConfiguracaoEmail(
                email: "faturacao@a-sua-empresa.com",
                senha: "senha-app-ou-smtp",
                assunto: $"Nota Fiscal Eletrónica - Pedido #{doc.OutboundOrder.Id}",
                mensagem: $"Olá!\n\nEm anexo, enviamos a sua Nota Fiscal (XML e PDF) referente à sua solicitação.\nChave de Acesso: {doc.AccessKey}\n\nObrigado!",
                servidorSmtp: "smtp.a-sua-empresa.com",
                porta: 587,
                ssl: true,
                mensagemHtml: false,
                timeout: 30000,
                assincrono: false
            )
            {
                Nome = doc.OutboundOrder.Company.TradeName ?? "Departamento de Faturação"
            };

            var emailBuilder = new EmailBuilder(configEmail);
            emailBuilder.AdicionarDestinatario(request.DestinationEmail);
            emailBuilder.AdicionarAnexo(caminhoPdf);
            emailBuilder.AdicionarAnexo(caminhoXml);

            _logger.LogInformation("[EMAIL] A disparar a mensagem via SMTP (Síncrono)...");
            emailBuilder.Enviar();
            _logger.LogInformation("[EMAIL] SUCESSO! E-mail enviado para {Email}", request.DestinationEmail);

            return Results.Ok(new { Message = "E-mail enviado com sucesso com PDF e XML em anexo!" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[EMAIL - ERRO] Falha no envio via SMTP: {Message}", ex.Message);
            return Results.Problem(statusCode: 500, title: "Erro ao enviar E-mail", detail: ex.Message);
        }
    }
}

// 3. O Endpoint (Exposição da Rota)
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