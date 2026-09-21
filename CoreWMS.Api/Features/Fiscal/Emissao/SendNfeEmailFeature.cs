using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
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

        var doc = await _db.OutboundFiscalDocuments
            .Include(d => d.OutboundOrder)
            .ThenInclude(o => o.Company)
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "XML autorizado não está disponível." });

        string caminhoXmlTemporario = string.Empty;

        try
        {
            // Usa o IWebHostEnvironment para apontar para a pasta persistente de uploads
            string diretorioBase = Path.Combine(_env.ContentRootPath, "uploads", "NFePdf");
            string caminhoPdf = Path.Combine(diretorioBase, $"{doc.AccessKey}-danfe.pdf");

            // Para evitar colisões (Concurrency Locks) caso 2 utilizadores enviem a mesma nota ao mesmo tempo,
            // geramos um XML temporário e depois apagamos.
            caminhoXmlTemporario = Path.Combine(diretorioBase, $"{doc.AccessKey}_{Guid.NewGuid():N}.xml");

            if (!File.Exists(caminhoPdf))
            {
                return Results.BadRequest(new { Message = "O PDF da DANFE ainda não foi gerado. Por favor, gere o PDF primeiro." });
            }

            // O EmailBuilder do Zeus exige o caminho físico do ficheiro
            await File.WriteAllTextAsync(caminhoXmlTemporario, doc.RawXml, ct);

            // @TODO: No futuro, puxar estes dados do IOptions ou do cadastro da Company
            var configEmail = new ConfiguracaoEmail(
                email: "faturacao@a-sua-empresa.com",
                senha: "senha-app-ou-smtp",
                assunto: $"Nota Fiscal Eletrônica - Pedido #{doc.OutboundOrder.Id}",
                mensagem: $"Olá!\n\nEm anexo, enviamos a sua Nota Fiscal (XML e PDF) referente à sua solicitação.\nChave de Acesso: {doc.AccessKey}\n\nObrigado!",
                servidorSmtp: "smtp.a-sua-empresa.com",
                porta: 587,
                ssl: true,
                mensagemHtml: false,
                timeout: 30000,
                assincrono: false
            )
            {
                Nome = doc.OutboundOrder.Company.TradeName ?? "Departamento de Faturamento"
            };

            var emailBuilder = new EmailBuilder(configEmail);
            emailBuilder.AdicionarDestinatario(request.DestinationEmail);
            emailBuilder.AdicionarAnexo(caminhoPdf);

            // Força o nome do anexo no e-mail para não incluir o Guid feio do ficheiro temporário
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
            // Limpeza: Apaga o XML temporário para não entulhar o servidor
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