using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Email;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace CoreWMS.Api.Features.Identity.Companies;

public record TestCompanyEmailCommand(Guid CompanyId, string DestinationEmail) : IRequest<IResult>;

public class TestCompanyEmailHandler : IRequestHandler<TestCompanyEmailCommand, IResult>
{
    private readonly IEmailSenderService _emailSender;

    public TestCompanyEmailHandler(IEmailSenderService emailSender)
    {
        _emailSender = emailSender;
    }

    public async Task<IResult> Handle(TestCompanyEmailCommand request, CancellationToken ct)
    {
        string htmlBody = $@"
<div style=""font-family: sans-serif; padding: 20px; background: #f8fafc;"">
  <div style=""background: #fff; padding: 24px; border-radius: 8px; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0;"">
    <h3 style=""color: #047857; margin-top: 0;"">✓ Teste de Envio Concluído com Sucesso!</h3>
    <p>Este e-mail confirma que as credenciais e parâmetros de envio da empresa estão configurados e prontos para uso em notas fiscais e relatórios.</p>
    <p style=""font-size: 12px; color: #64748b;"">Disparado em {DateTime.UtcNow:dd/MM/yyyy HH:mm:ss} UTC.</p>
  </div>
</div>";

        try
        {
            await _emailSender.SendAsync(new SendEmailMessage(
                CompanyId: request.CompanyId,
                DestinationEmail: request.DestinationEmail,
                Subject: "[CoreWMS] Teste de Conexão de E-mail",
                HtmlBody: htmlBody
            ), ct);

            return Results.Ok(new { Message = $"E-mail de teste enviado com sucesso para {request.DestinationEmail}!" });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
    }
}

public static class TestCompanyEmailEndpoints
{
    public static void MapTestCompanyEmailEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/companies/{id:guid}/test-email", async (Guid id, [FromQuery] string destinationEmail, IMediator mediator) =>
            await mediator.Send(new TestCompanyEmailCommand(id, destinationEmail)))
            .WithTags("Companies")
            .RequireAuthorization()
            .RequirePermission(Permissions.Companies.Manage);
    }
}