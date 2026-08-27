using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Models;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography.X509Certificates;

namespace CoreWMS.Api.Features.Identity.Companies;

// 1. CONTRATOS & DTOs[cite: 5]
public record CompanyDto(
    Guid Id, string Cnpj, string CorporateName, string? TradeName,
    string? StateRegistration, string? MunicipalRegistration, string? Iest, string? Cnae, int Crt,
    string? Email, string? Phone,
    string? ZipCode, string? Street, string? Number, string? Complement, string? Neighborhood, string? CityName, int CityCode, string State,
    string? LogoBase64, DateTime? CertificateExpiration, bool IsActive, DateTime CreatedAt);

public record CreateCompanyCommand(byte[] CertBytes, string Password, string Uf) : IRequest<IResult>;

public record UpdateCompanyCommand(
    Guid Id, string CorporateName, string? TradeName, string? StateRegistration,
    string? Cnae, int Crt, string? MunicipalRegistration, string? Iest,
    string? Email, string? Phone,
    string? ZipCode, string? Street, string? Number, string? Complement, string? Neighborhood, string? CityName, int CityCode, string State,
    string? LogoBase64) : IRequest<IResult>;

public record UploadCertificateCommand(Guid Id, byte[] CertBytes, string Password) : IRequest<IResult>;
public record DeleteCompanyCommand(Guid Id) : IRequest<IResult>;
public record ListAllCompaniesQuery() : IRequest<IResult>;
public record SyncCompanySefazCommand(Guid Id) : IRequest<IResult>;

// 2. VALIDADORES[cite: 5]
public class CreateCompanyCommandValidator : AbstractValidator<CreateCompanyCommand>
{
    public CreateCompanyCommandValidator()
    {
        RuleFor(x => x.CertBytes).NotEmpty().WithMessage("O Certificado Digital é obrigatório.");
        RuleFor(x => x.Password).NotEmpty().WithMessage("A senha do certificado é obrigatória.");
        RuleFor(x => x.Uf).NotEmpty().Length(2).WithMessage("A UF deve conter 2 caracteres.");
    }
}

public class UpdateCompanyCommandValidator : AbstractValidator<UpdateCompanyCommand>
{
    public UpdateCompanyCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CorporateName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.State).NotEmpty().Length(2);
    }
}

// 3. HANDLERS[cite: 5]
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
        // Sem try/catch: se a SEFAZ falhar, o GlobalExceptionHandler devolve 500 ou 400
        var sefazData = _consultaCadastroService.Consultar(request.CertBytes, request.Password, request.Uf);

        if (await _db.Companies.AnyAsync(c => c.Cnpj == sefazData.Cnpj, ct))
            return Results.BadRequest(new { Message = $"Empresa com CNPJ {sefazData.Cnpj} já cadastrada." });

        var company = new Company(sefazData.Cnpj, sefazData.CorporateName, sefazData.State);

        // A mágica acontece aqui: Repassamos TODOS os dados mapeados do SefazCompanyDataDto
        company.UpdateDetails(
            corporateName: sefazData.CorporateName,
            tradeName: sefazData.TradeName,
            stateRegistration: sefazData.StateRegistration,
            cnae: sefazData.Cnae,       // Preenchido!
            crt: sefazData.Crt,         // Preenchido! (Convertido de String para Int pelo ResolverCrt)
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

public class ListAllCompaniesHandler : IRequestHandler<ListAllCompaniesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListAllCompaniesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListAllCompaniesQuery request, CancellationToken ct)
    {
        var companies = await _db.Companies.AsNoTracking().ProjectToType<CompanyDto>().ToListAsync(ct);
        return Results.Ok(companies);
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

        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class UploadCertificateHandler : IRequestHandler<UploadCertificateCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UploadCertificateHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UploadCertificateCommand request, CancellationToken ct)
    {
        var company = await _db.Companies.FindAsync(new object[] { request.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        // Sem try/catch! O X509CertificateLoader do .NET 10 lança a exceção direto pro GlobalExceptionHandler
        using var cert = X509CertificateLoader.LoadPkcs12(request.CertBytes, request.Password, X509KeyStorageFlags.EphemeralKeySet);

        company.SetCertificate(request.CertBytes, CryptoService.Encrypt(request.Password), cert.NotAfter);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Expiration = cert.NotAfter });
    }
}

public class SyncCompanySefazHandler : IRequestHandler<SyncCompanySefazCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ISefazConsultaCadastroService _sefazService;

    public SyncCompanySefazHandler(ApplicationDbContext db, ISefazConsultaCadastroService sefazService)
    {
        _db = db;
        _sefazService = sefazService;
    }

    public async Task<IResult> Handle(SyncCompanySefazCommand request, CancellationToken ct)
    {
        var company = await _db.Companies.FindAsync(new object[] { request.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        if (company.CertificateBytes == null || string.IsNullOrEmpty(company.CertificatePassword))
            return Results.BadRequest(new { Message = "Certificado Digital não configurado. Instale o certificado A1 na aba ao lado antes de sincronizar." });

        // A consulta roda 100% no servidor, sem o usuário precisar digitar a senha do certificado novamente!
        try
        {
            var password = CryptoService.Decrypt(company.CertificatePassword);
            var sefazData = _sefazService.Consultar(company.CertificateBytes, password, company.State, company.Cnpj);
            return Results.Ok(sefazData);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = "A SEFAZ rejeitou a consulta ou está offline.", Details = ex.Message });
        }
    }
}

public class DeleteCompanyHandler : IRequestHandler<DeleteCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteCompanyHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteCompanyCommand request, CancellationToken ct)
    {
        var company = await _db.Companies.FindAsync(new object[] { request.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        _db.Companies.Remove(company);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

// 4. ENDPOINTS[cite: 5]
public static class CompanyCrudEndpoints
{
    public static void MapCompanyCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/companies").WithTags("Companies").RequireAuthorization();

        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListAllCompaniesQuery()))
            .RequirePermission(Permissions.Companies.Manage);

        group.MapPost("/", async (IFormFile certificateFile, [FromForm] string certificatePassword, [FromForm] string uf, IMediator mediator) =>
        {
            if (certificateFile == null || certificateFile.Length == 0) return Results.BadRequest(new { Message = "Certificado obrigatório." });
            using var ms = new MemoryStream();
            await certificateFile.CopyToAsync(ms);
            return await mediator.Send(new CreateCompanyCommand(ms.ToArray(), certificatePassword, uf));
        }).RequirePermission(Permissions.Companies.Manage).DisableAntiforgery();

        group.MapPut("/{id:guid}", async (Guid id, UpdateCompanyCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
            .RequirePermission(Permissions.Companies.Manage);

        group.MapPut("/{id:guid}/certificate", async (Guid id, IFormFile certificateFile, [FromForm] string certificatePassword, IMediator mediator) =>
        {
            if (certificateFile == null || certificateFile.Length == 0) return Results.BadRequest(new { Message = "Certificado obrigatório." });
            using var ms = new MemoryStream();
            await certificateFile.CopyToAsync(ms);
            return await mediator.Send(new UploadCertificateCommand(id, ms.ToArray(), certificatePassword));
        }).RequirePermission(Permissions.Companies.Manage).DisableAntiforgery();

        group.MapPost("/{id:guid}/sync-sefaz", async (Guid id, IMediator mediator) =>
            await mediator.Send(new SyncCompanySefazCommand(id)))
            .RequirePermission(Permissions.Companies.Manage);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteCompanyCommand(id)))
            .RequirePermission(Permissions.Companies.Manage);
    }
}