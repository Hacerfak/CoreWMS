using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Companies;

public record ListAllCompaniesQuery() : IRequest<IResult>;

public class ListAllCompaniesHandler : IRequestHandler<ListAllCompaniesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListAllCompaniesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListAllCompaniesQuery request, CancellationToken ct)
    {
        var companies = await _db.Companies
            .AsNoTracking()
            .Select(c => new CompanyDto(
                c.Id,
                c.Cnpj,
                c.CorporateName,
                c.TradeName,
                c.StateRegistration,
                c.MunicipalRegistration,
                c.Iest,
                c.Cnae,
                c.Crt,
                c.Environment,
                c.NfeSerie,
                c.NfeNextNumber,
                c.Rntrc,
                c.Email,
                c.Phone,
                c.ZipCode,
                c.Street,
                c.Number,
                c.Complement,
                c.Neighborhood,
                c.CityName,
                c.CityCode,
                c.State,
                c.LogoBase64,
                c.CertificateExpiration,
                c.IsActive,
                c.CreatedAt,

                // Provedor de e-mail e dados de conexão
                c.EmailProvider,
                c.EmailSenderName,
                c.EmailSenderAddress,
                c.SmtpHost,
                c.SmtpPort,
                c.SmtpUser,
                c.SmtpEnableSsl,
                !string.IsNullOrEmpty(c.SmtpPassword),
                c.GoogleSenderEmail,
                !string.IsNullOrEmpty(c.GoogleRefreshToken)
            ))
            .ToListAsync(ct);

        return Results.Ok(companies);
    }
}

public static class ListAllCompaniesEndpoints
{
    public static void MapListAllCompaniesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/companies", async (IMediator mediator) =>
            await mediator.Send(new ListAllCompaniesQuery()))
            .WithTags("Companies")
            .RequireAuthorization()
            .RequirePermission(Permissions.Companies.Manage);
    }
}