using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography.X509Certificates;

namespace CoreWMS.Api.Features.Identity.Companies;

// 1. Request / Response
public record CreateCompanyCommand(byte[] CertBytes, string Password, string Uf) : IRequest<IResult>;

// 2. Validator
public class CreateCompanyCommandValidator : AbstractValidator<CreateCompanyCommand>
{
    public CreateCompanyCommandValidator()
    {
        RuleFor(x => x.CertBytes).NotEmpty().WithMessage("O Certificado Digital é obrigatório.");
        RuleFor(x => x.Password).NotEmpty().WithMessage("A senha do certificado é obrigatória.");
        RuleFor(x => x.Uf).NotEmpty().Length(2).WithMessage("A UF deve conter 2 caracteres.");
    }
}

// 3. Handler
public class CreateCompanyHandler : IRequestHandler<CreateCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ISefazConsultaCadastroService _consultaCadastroService;

    public CreateCompanyHandler(ApplicationDbContext db, ISefazConsultaCadastroService consultaCadastroService)
    {
        _db = db;
        _consultaCadastroService = consultaCadastroService;
    }

    public async Task<IResult> Handle(CreateCompanyCommand request, CancellationToken ct)
    {
        var sefazData = _consultaCadastroService.Consultar(request.CertBytes, request.Password, request.Uf);

        if (await _db.Companies.AnyAsync(c => c.Cnpj == sefazData.Cnpj, ct))
            return Results.BadRequest(new { Message = $"Empresa com CNPJ {sefazData.Cnpj} já cadastrada." });

        var company = new Company(sefazData.Cnpj, sefazData.CorporateName, sefazData.State);

        company.UpdateDetails(
            corporateName: sefazData.CorporateName,
            tradeName: sefazData.TradeName,
            stateRegistration: sefazData.StateRegistration,
            cnae: sefazData.Cnae,
            crt: sefazData.Crt,
            municipalRegistration: null,
            iest: null,
            email: null,
            phone: null,
            zipCode: sefazData.ZipCode,
            street: sefazData.Street,
            number: sefazData.Number,
            complement: sefazData.Complement,
            neighborhood: sefazData.Neighborhood,
            cityName: sefazData.CityName,
            cityCode: sefazData.CityCode,
            state: sefazData.State,
            logoBase64: null
        );

        using var cert = X509CertificateLoader.LoadPkcs12(request.CertBytes, request.Password, X509KeyStorageFlags.EphemeralKeySet);
        company.SetCertificate(request.CertBytes, CryptoService.Encrypt(request.Password), cert.NotAfter);

        _db.Companies.Add(company);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/companies/{company.Id}", company.Adapt<CompanyDto>());
    }
}

// 4. Endpoint
public static class CreateCompanyEndpoints
{
    public static void MapCreateCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/companies", async (IFormFile certificateFile, [FromForm] string certificatePassword, [FromForm] string uf, IMediator mediator) =>
        {
            if (certificateFile == null || certificateFile.Length == 0)
                return Results.BadRequest(new { Message = "Certificado obrigatório." });

            using var ms = new MemoryStream();
            await certificateFile.CopyToAsync(ms);

            return await mediator.Send(new CreateCompanyCommand(ms.ToArray(), certificatePassword, uf));
        })
        .WithTags("Companies")
        .RequireAuthorization()
        .RequirePermission(Permissions.Companies.Manage)
        .DisableAntiforgery();
    }
}