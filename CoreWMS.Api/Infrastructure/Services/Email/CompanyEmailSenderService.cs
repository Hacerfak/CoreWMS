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
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using MimeKit;

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

        // 1. DISPARO VIA SMTP
        if (company.EmailProvider == EmailProviderType.Smtp)
        {
            await SendViaSmtpAsync(company, senderName, message, ct);
            return;
        }

        // 2. DISPARO VIA GOOGLE WORKSPACE (OAUTH 2.0)
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

        // O endereço do remetente precisa ser um e-mail válido (ex: nfe@empresa.com.br)
        string senderEmail = !string.IsNullOrWhiteSpace(company.EmailSenderAddress)
            ? company.EmailSenderAddress.Trim()
            : (!string.IsNullOrWhiteSpace(company.Email) ? company.Email.Trim() : "nao-responder@corewms.com.br");

        var mimeMessage = new MimeMessage();
        mimeMessage.From.Add(new MailboxAddress(senderName, senderEmail));
        mimeMessage.To.Add(new MailboxAddress("", msg.DestinationEmail.Trim()));
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

        string password = "";
        if (!string.IsNullOrWhiteSpace(company.SmtpPassword))
        {
            try { password = CryptoService.Decrypt(company.SmtpPassword); }
            catch (Exception ex) { throw new InvalidOperationException("Não foi possível descriptografar a senha do SMTP.", ex); }
        }

        using var client = new SmtpClient();

        // Configuração de segurança de conexão
        SecureSocketOptions socketOptions;
        if (!company.SmtpEnableSsl)
        {
            socketOptions = SecureSocketOptions.None;
        }
        else if (company.SmtpPort == 465)
        {
            socketOptions = SecureSocketOptions.SslOnConnect;
        }
        else
        {
            socketOptions = SecureSocketOptions.StartTlsWhenAvailable;
        }

        int port = company.SmtpPort ?? 587;

        _logger.LogInformation("[EMAIL SMTP] Conectando a {Host}:{Port} (SSL: {Ssl})...", company.SmtpHost, port, socketOptions);
        await client.ConnectAsync(company.SmtpHost, port, socketOptions, ct);

        // O usuário de autenticação pode ser QUALQUER texto ("api", "apikey", login de sistema ou e-mail)
        if (!string.IsNullOrWhiteSpace(company.SmtpUser))
        {
            _logger.LogInformation("[EMAIL SMTP] Autenticando com usuário: {User}...", company.SmtpUser);
            await client.AuthenticateAsync(company.SmtpUser.Trim(), password, ct);
        }

        _logger.LogInformation("[EMAIL SMTP] Disparando e-mail de {Sender} para {Dest}...", senderEmail, msg.DestinationEmail);
        await client.SendAsync(mimeMessage, ct);
        await client.DisconnectAsync(true, ct);
        _logger.LogInformation("[EMAIL SMTP] E-mail enviado com sucesso para {Dest}!", msg.DestinationEmail);
    }

    private async Task SendViaGoogleOAuthAsync(Company company, string senderName, SendEmailMessage msg, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(company.GoogleRefreshToken))
            throw new InvalidOperationException("A conta do Google Workspace não está conectada. Clique em 'Conectar com o Google Workspace' no cadastro da empresa.");

        string refreshToken;
        try { refreshToken = CryptoService.Decrypt(company.GoogleRefreshToken); }
        catch (Exception ex) { throw new InvalidOperationException("Não foi possível descriptografar o token do Google.", ex); }

        // 1. Define o e-mail do grupo preenchido no cadastro como endereço oficial de resposta e remetente
        string replyToEmail = !string.IsNullOrWhiteSpace(company.EmailSenderAddress)
            ? company.EmailSenderAddress.Trim()
            : (company.GoogleSenderEmail ?? company.Email!);

        // Tenta usar o e-mail do grupo no From. Caso o Gmail exija a conta autenticada, ele respeitará o Reply-To.
        string fromEmail = !string.IsNullOrWhiteSpace(company.EmailSenderAddress)
            ? company.EmailSenderAddress.Trim()
            : (company.GoogleSenderEmail ?? company.Email!);

        var clientId = _config["GoogleOAuth:ClientId"];
        var clientSecret = _config["GoogleOAuth:ClientSecret"];

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            throw new InvalidOperationException("Credenciais Google OAuth (ClientId/ClientSecret) não configuradas no ambiente.");

        var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
        {
            ClientSecrets = new ClientSecrets { ClientId = clientId, ClientSecret = clientSecret },
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
        mimeMessage.From.Add(new MailboxAddress(senderName, fromEmail));
        mimeMessage.To.Add(new MailboxAddress("", msg.DestinationEmail.Trim()));

        // CABEÇALHO ESSENCIAL: Garante que qualquer resposta vá para a caixa do grupo
        mimeMessage.ReplyTo.Add(new MailboxAddress(senderName, replyToEmail));

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

        _logger.LogInformation("[GMAIL OAUTH] Disparando e-mail (From: {From}, Reply-To: {ReplyTo}) para {Dest}...", fromEmail, replyToEmail, msg.DestinationEmail);
        await gmailService.Users.Messages.Send(gmailMessage, "me").ExecuteAsync(ct);
        _logger.LogInformation("[GMAIL OAUTH] E-mail enviado com sucesso via Gmail API!");
    }
}