namespace CoreWMS.Api.Infrastructure.Services.Email;

public record EmailAttachment(
    string FileName,
    byte[] Content,
    string ContentType
);

public record SendEmailMessage(
    Guid CompanyId,
    string DestinationEmail,
    string Subject,
    string HtmlBody,
    List<EmailAttachment>? Attachments = null,
    string? OverrideSenderName = null
);

public interface IEmailSenderService
{
    Task SendAsync(SendEmailMessage message, CancellationToken ct = default);
}