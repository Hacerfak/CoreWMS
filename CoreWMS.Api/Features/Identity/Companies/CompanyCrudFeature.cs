using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Models;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Companies;

// ==============================================================================
// 1. CONTRATOS & DTOs
// ==============================================================================
public record CompanyDto(Guid Id, string Cnpj, string CorporateName, string? TradeName, string State, bool IsActive, DateTime CreatedAt);
public record CreateCompanyCommand(byte[] CertBytes, string Password, string Uf) : ICommand<IResult>;
public record UpdateCompanyCommand(Guid Id, string CorporateName, string? TradeName, string State) : ICommand<IResult>;
public record DeleteCompanyCommand(Guid Id) : ICommand<IResult>;
public record ListAllCompaniesQuery() : IQuery<IResult>;

// ==============================================================================
// 2. HANDLERS
// ==============================================================================
public class CreateCompanyHandler : ICommandHandler<CreateCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ISefazConsultaCadastroService _consultaCadastroService;

    public CreateCompanyHandler(ApplicationDbContext db, ISefazConsultaCadastroService consultaCadastroService)
    {
        _db = db;
        _consultaCadastroService = consultaCadastroService;
    }

    public async Task<IResult> HandleAsync(CreateCompanyCommand command, CancellationToken ct = default)
    {
        SefazCompanyDataDto sefazData;
        try
        {
            sefazData = _consultaCadastroService.Consultar(command.CertBytes, command.Password, command.Uf);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = $"Falha na consulta SEFAZ: {ex.Message}" });
        }

        var exists = await _db.Companies.AnyAsync(c => c.Cnpj == sefazData.Cnpj, ct);
        if (exists)
        {
            return Results.BadRequest(new { Message = $"Empresa com CNPJ {sefazData.Cnpj} já cadastrada." });
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

        // Criptografa a senha do certificado com AES-256 antes de persistir
        var encryptedPassword = CryptoService.Encrypt(command.Password);
        company.SetCertificate(command.CertBytes, encryptedPassword, sefazData.CertificateExpiration);

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

public class ListAllCompaniesHandler : IQueryHandler<ListAllCompaniesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListAllCompaniesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(ListAllCompaniesQuery query, CancellationToken ct = default)
    {
        var companies = await _db.Companies
            .Select(c => new CompanyDto(c.Id, c.Cnpj, c.CorporateName, c.TradeName, c.State, c.IsActive, c.CreatedAt))
            .ToListAsync(ct);

        return Results.Ok(companies);
    }
}

public class UpdateCompanyHandler : ICommandHandler<UpdateCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateCompanyHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(UpdateCompanyCommand command, CancellationToken ct = default)
    {
        var company = await _db.Companies.FindAsync(new object[] { command.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        company.UpdateFiscalData(
            corporateName: command.CorporateName,
            tradeName: command.TradeName,
            stateRegistration: company.StateRegistration,
            municipalRegistration: company.MunicipalRegistration,
            crt: company.Crt,
            street: company.Street,
            number: company.Number,
            complement: company.Complement,
            neighborhood: company.Neighborhood,
            cityCode: company.CityCode,
            cityName: company.CityName,
            state: command.State,
            zipCode: company.ZipCode
        );

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Dados da empresa atualizados com sucesso." });
    }
}

public class DeleteCompanyHandler : ICommandHandler<DeleteCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteCompanyHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(DeleteCompanyCommand command, CancellationToken ct = default)
    {
        var company = await _db.Companies.FindAsync(new object[] { command.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        _db.Companies.Remove(company);
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Empresa removida com sucesso." });
    }
}

// ==============================================================================
// 3. ENDPOINTS
// ==============================================================================
public static class CompanyCrudEndpoints
{
    public static void MapCompanyCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/companies").WithTags("Companies").RequireAuthorization();

        group.MapGet("/", async (IQueryHandler<ListAllCompaniesQuery, IResult> h, CancellationToken ct) =>
            await h.HandleAsync(new ListAllCompaniesQuery(), ct))
            .RequirePermission(Permissions.Companies.View);

        group.MapPost("/", async (
            IFormFile certificateFile,
            [FromForm] string certificatePassword,
            [FromForm] string uf,
            [FromServices] ICommandHandler<CreateCompanyCommand, IResult> handler,
            CancellationToken ct) =>
        {
            if (certificateFile == null || certificateFile.Length == 0)
                return Results.BadRequest(new { Message = "O arquivo do Certificado Digital A1 (.pfx) é obrigatório." });

            if (string.IsNullOrWhiteSpace(certificatePassword) || string.IsNullOrWhiteSpace(uf))
                return Results.BadRequest(new { Message = "Senha do certificado e UF são obrigatórios." });

            using var memoryStream = new MemoryStream();
            await certificateFile.CopyToAsync(memoryStream, ct);
            var certBytes = memoryStream.ToArray();

            var command = new CreateCompanyCommand(certBytes, certificatePassword, uf);
            return await handler.HandleAsync(command, ct);
        })
        .RequirePermission(Permissions.Companies.Create)
        .DisableAntiforgery();

        group.MapPut("/{id:guid}", async (Guid id, UpdateCompanyCommand cmd, ICommandHandler<UpdateCompanyCommand, IResult> h, CancellationToken ct) =>
            await h.HandleAsync(cmd with { Id = id }, ct))
            .RequirePermission(Permissions.Companies.Edit);

        group.MapDelete("/{id:guid}", async (Guid id, ICommandHandler<DeleteCompanyCommand, IResult> h, CancellationToken ct) =>
            await h.HandleAsync(new DeleteCompanyCommand(id), ct))
            .RequirePermission(Permissions.Companies.Delete);
    }
}