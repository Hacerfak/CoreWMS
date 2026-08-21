using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Models;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Onboarding;

// ==============================================================================
// 1. CONTRATOS
// ==============================================================================
public record RegisterCompanyCommand(byte[] CertBytes, string Password, string Uf) : ICommand<IResult>;

// ==============================================================================
// 2. HANDLER
// ==============================================================================
public class RegisterCompanyHandler : ICommandHandler<RegisterCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ISefazConsultaCadastroService _consultaCadastroService;

    public RegisterCompanyHandler(ApplicationDbContext db, ISefazConsultaCadastroService consultaCadastroService)
    {
        _db = db;
        _consultaCadastroService = consultaCadastroService;
    }

    public async Task<IResult> HandleAsync(RegisterCompanyCommand command, CancellationToken ct = default)
    {
        SefazCompanyDataDto sefazData;
        try
        {
            sefazData = _consultaCadastroService.Consultar(command.CertBytes, command.Password, command.Uf);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = $"Falha no Onboarding SEFAZ: {ex.Message}" });
        }

        var exists = await _db.Companies.AnyAsync(c => c.Cnpj == sefazData.Cnpj, ct);
        if (exists)
        {
            return Results.BadRequest(new { Message = $"A empresa com CNPJ {sefazData.Cnpj} já está cadastrada no sistema." });
        }

        var company = new Company(sefazData.Cnpj, sefazData.CorporateName, sefazData.State);

        company.UpdateFiscalData(
            corporateName: sefazData.CorporateName,
            tradeName: sefazData.TradeName,
            stateRegistration: sefazData.StateRegistration,
            municipalRegistration: null,
            crt: sefazData.Crt,
            street: sefazData.Street,
            number: sefazData.Number,
            complement: sefazData.Complement,
            neighborhood: sefazData.Neighborhood,
            cityCode: sefazData.CityCode,
            cityName: sefazData.CityName,
            state: sefazData.State,
            zipCode: sefazData.ZipCode
        );

        company.SetCertificate(command.CertBytes, command.Password, sefazData.CertificateExpiration);

        _db.Companies.Add(company);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/companies/{company.Id}", new
        {
            company.Id,
            company.Cnpj,
            company.CorporateName,
            company.TradeName,
            company.State,
            company.CertificateExpiration
        });
    }
}

// ==============================================================================
// 3. ENDPOINT
// ==============================================================================
public static class OnboardingCompanyEndpoint
{
    public static void MapOnboardingCompanyEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/onboarding/companies", async (
            IFormFile certificateFile,
            [FromForm] string certificatePassword,
            [FromForm] string uf,
            [FromServices] ICommandHandler<RegisterCompanyCommand, IResult> handler,
            CancellationToken ct) =>
        {
            if (certificateFile == null || certificateFile.Length == 0)
                return Results.BadRequest(new { Message = "O arquivo do Certificado Digital A1 (.pfx) é obrigatório." });

            if (string.IsNullOrWhiteSpace(certificatePassword) || string.IsNullOrWhiteSpace(uf))
                return Results.BadRequest(new { Message = "Senha do certificado e UF são obrigatórios." });

            using var memoryStream = new MemoryStream();
            await certificateFile.CopyToAsync(memoryStream, ct);
            var certBytes = memoryStream.ToArray();

            var command = new RegisterCompanyCommand(certBytes, certificatePassword, uf);
            return await handler.HandleAsync(command, ct);
        })
        .WithTags("Onboarding")
        .RequireAuthorization()
        .DisableAntiforgery();
    }
}