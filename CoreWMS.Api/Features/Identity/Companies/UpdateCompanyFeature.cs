using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Identity.Companies;

public record UpdateCompanyCommand(
    Guid Id,
    string CorporateName,
    string? TradeName,
    string? StateRegistration,
    string? Cnae,
    int Crt,
    int Environment,
    int NfeSerie,
    int NfeNextNumber,
    string? Rntrc,
    string? MunicipalRegistration,
    string? Iest,
    string? Email,
    string? Phone,
    string? ZipCode,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    string? CityName,
    int CityCode,
    string State,
    string? LogoBase64,

    // Configurações de E-mail
    EmailProviderType EmailProvider,
    string? EmailSenderName,
    string? EmailSenderAddress,
    string? SmtpHost,
    int? SmtpPort,
    string? SmtpUser,
    string? SmtpPassword,
    bool SmtpEnableSsl = true
) : IRequest<IResult>;

public class UpdateCompanyCommandValidator : AbstractValidator<UpdateCompanyCommand>
{
    public UpdateCompanyCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CorporateName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.State).NotEmpty().Length(2);
        RuleFor(x => x.Environment).InclusiveBetween(1, 2);
        RuleFor(x => x.NfeSerie).GreaterThanOrEqualTo(1);
        RuleFor(x => x.NfeNextNumber).GreaterThanOrEqualTo(1);

        When(x => x.EmailProvider == EmailProviderType.Smtp, () =>
        {
            RuleFor(x => x.SmtpHost).NotEmpty().WithMessage("Servidor SMTP (Host) é obrigatório.");
            RuleFor(x => x.SmtpPort).GreaterThan(0).WithMessage("Porta SMTP inválida.");
            RuleFor(x => x.EmailSenderAddress).NotEmpty().EmailAddress().WithMessage("E-mail do remetente é obrigatório.");
        });
    }
}

public class UpdateCompanyHandler : IRequestHandler<UpdateCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateCompanyHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateCompanyCommand request, CancellationToken ct)
    {
        var company = await _db.Companies.FindAsync(new object[] { request.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        company.UpdateDetails(
            request.CorporateName, request.TradeName, request.StateRegistration,
            request.Cnae, request.Crt, request.MunicipalRegistration, request.Iest,
            request.Email, request.Phone,
            request.ZipCode, request.Street, request.Number, request.Complement, request.Neighborhood, request.CityName, request.CityCode, request.State,
            request.LogoBase64);

        company.UpdateEnvironment(request.Environment);
        company.UpdateNfeAndTransportDetails(request.NfeSerie, request.NfeNextNumber, request.Rntrc);

        if (request.EmailProvider == EmailProviderType.Smtp)
        {
            company.ConfigureSmtp(
                senderName: request.EmailSenderName,
                senderAddress: request.EmailSenderAddress ?? request.Email ?? "faturamento@empresa.com.br",
                host: request.SmtpHost!,
                port: request.SmtpPort ?? 587,
                user: request.SmtpUser ?? "",
                rawPassword: request.SmtpPassword,
                enableSsl: request.SmtpEnableSsl
            );
        }
        else if (request.EmailProvider == EmailProviderType.Disabled)
        {
            company.DisableEmailProvider();
        }

        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public static class UpdateCompanyEndpoints
{
    public static void MapUpdateCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/companies/{id:guid}", async (Guid id, UpdateCompanyCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
            .WithTags("Companies")
            .RequireAuthorization()
            .RequirePermission(Permissions.Companies.Manage);
    }
}