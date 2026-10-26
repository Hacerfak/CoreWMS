using System.Text;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Identity.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Gmail.v1;
using Google.Apis.Gmail.v1.Data;
using Google.Apis.Services;
using Microsoft.EntityFrameworkCore;
using MimeKit;
using NFe.Utils.Email;

namespace CoreWMS.Api.Infrastructure.Services.Email;

public class CompanyEmailSenderService : IEmailSenderService
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<CompanyEmailSenderService> _logger;

    public CompanyEmailSenderService(
        ApplicationDbContext db,
        IConfiguration config,
        ILogger<CompanyEmailSenderService> logger)
    {
        _db = db;
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(SendEmailMessage message, CancellationToken ct = default)
    {
        var company = await _db.Companies
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == message.CompanyId, ct);

        if (company == null)
            throw new InvalidOperationException("Empresa remetente não encontrada.");

        if (company.EmailProvider == EmailProviderType.Disabled)
            throw new InvalidOperationException($"O serviço de envio de e-mails está desativado para a empresa '{company.CorporateName}'.");

        string senderName = !string.IsNullOrWhiteSpace(message.OverrideSenderName)
            ? message.OverrideSenderName
            : (!string.IsNullOrWhiteSpace(company.EmailSenderName)
                ? company.EmailSenderName
                : (!string.IsNullOrWhiteSpace(company.TradeName) ? company.TradeName : company.CorporateName));

        // 1. SMTP
        if (company.EmailProvider == EmailProviderType.Smtp)
        {
            await SendViaSmtpAsync(company, senderName, message, ct);
            return;
        }

        // 2. Google Workspace (OAuth 2.0)
        if (company.EmailProvider == EmailProviderType.GoogleWorkspace)
        {
            await SendViaGoogleOAuthAsync(company, senderName, message, ct);
            return;
        }

        throw new NotSupportedException($"Provedor de e-mail '{company.EmailProvider}' não suportado.");
    }

    private async Task SendViaSmtpAsync(Company company, string senderName, SendEmailMessage msg, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(company.SmtpHost))
            throw new InvalidOperationException("Servidor SMTP (Host) não configurado na empresa.");

        string password = "";
        if (!string.IsNullOrWhiteSpace(company.SmtpPassword))
        {
            password = CryptoService.Decrypt(company.SmtpPassword);
        }

        string tempDir = Path.Combine(Path.GetTempPath(), "CoreWMS_EmailAttachments", Guid.NewGuid().ToString("N"));
        var createdTempFiles = new List<string>();

        try
        {
            var configEmail = new ConfiguracaoEmail(
                email: company.SmtpUser ?? company.EmailSenderAddress ?? company.Email ?? "",
                senha: password,
                assunto: msg.Subject,
                mensagem: msg.HtmlBody,
                servidorSmtp: company.SmtpHost,
                porta: company.SmtpPort ?? 587,
                ssl: company.SmtpEnableSsl,
                mensagemHtml: true,
                timeout: 30000,
                assincrono: false
            )
            {
                Nome = senderName
            };

            var emailBuilder = new EmailBuilder(configEmail);
            emailBuilder.AdicionarDestinatario(msg.DestinationEmail);

            if (msg.Attachments != null && msg.Attachments.Any())
            {
                Directory.CreateDirectory(tempDir);
                foreach (var att in msg.Attachments)
                {
                    string filePath = Path.Combine(tempDir, att.FileName);
                    await File.WriteAllBytesAsync(filePath, att.Content, ct);
                    createdTempFiles.Add(filePath);
                    emailBuilder.AdicionarAnexo(filePath);
                }
            }

            _logger.LogInformation("[EMAIL SMTP] Enviando para {Dest} via {Host}:{Port}...", msg.DestinationEmail, company.SmtpHost, company.SmtpPort);
            emailBuilder.Enviar();
        }
        finally
        {
            foreach (var path in createdTempFiles)
            {
                try { if (File.Exists(path)) File.Delete(path); } catch { }
            }
            try { if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true); } catch { }
        }
    }

    private async Task SendViaGoogleOAuthAsync(Company company, string senderName, SendEmailMessage msg, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(company.GoogleRefreshToken))
            throw new InvalidOperationException("A conta do Google Workspace não está conectada. Clique em 'Conectar com o Google' no cadastro da empresa.");

        string refreshToken = CryptoService.Decrypt(company.GoogleRefreshToken);
        string senderEmail = company.GoogleSenderEmail ?? company.EmailSenderAddress ?? company.Email!;

        var clientId = _config["GoogleOAuth:ClientId"];
        var clientSecret = _config["GoogleOAuth:ClientSecret"];

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            throw new InvalidOperationException("Credenciais Google OAuth (ClientId/ClientSecret) não configuradas no appsettings.");

        var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
        {
            ClientSecrets = new ClientSecrets
            {
                ClientId = clientId,
                ClientSecret = clientSecret
            },
            Scopes = new[] { GmailService.Scope.GmailSend }
        });

        var tokenResponse = new TokenResponse { RefreshToken = refreshToken };
        var credential = new UserCredential(flow, company.Id.ToString(), tokenResponse);

        var gmailService = new GmailService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "CoreWMS"
        });

        var mimeMessage = new MimeMessage();
        mimeMessage.From.Add(new MailboxAddress(senderName, senderEmail));
        mimeMessage.To.Add(new MailboxAddress("", msg.DestinationEmail));
        mimeMessage.Subject = msg.Subject;

        var bodyBuilder = new BodyBuilder { HtmlBody = msg.HtmlBody };

        if (msg.Attachments != null && msg.Attachments.Any())
        {
            foreach (var att in msg.Attachments)
            {
                bodyBuilder.Attachments.Add(att.FileName, att.Content, ContentType.Parse(att.ContentType));
            }
        }

        mimeMessage.Body = bodyBuilder.ToMessageBody();

        using var memoryStream = new MemoryStream();
        await mimeMessage.WriteToAsync(memoryStream, ct);

        string rawMessage = Convert.ToBase64String(memoryStream.ToArray())
            .Replace('+', '-')
            .Replace('/', '_')
            .Replace("=", "");

        var gmailMessage = new Message { Raw = rawMessage };

        _logger.LogInformation("[GMAIL OAUTH] Disparando e-mail da conta {Sender} para {Dest}...", senderEmail, msg.DestinationEmail);
        await gmailService.Users.Messages.Send(gmailMessage, "me").ExecuteAsync(ct);
    }
}