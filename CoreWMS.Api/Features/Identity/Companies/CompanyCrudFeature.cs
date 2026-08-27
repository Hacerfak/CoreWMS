using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Models;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Companies;

public record CompanyDto(Guid Id, string Cnpj, string CorporateName, string? TradeName, string State, bool IsActive, DateTime CreatedAt);
public record CreateCompanyCommand(byte[] CertBytes, string Password, string Uf) : IRequest<IResult>;
public record UpdateCompanyCommand(Guid Id, string CorporateName, string? TradeName, string State) : IRequest<IResult>;
public record DeleteCompanyCommand(Guid Id) : IRequest<IResult>;
public record ListAllCompaniesQuery() : IRequest<IResult>;

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
        SefazCompanyDataDto sefazData;
        try
        {
            sefazData = _consultaCadastroService.Consultar(request.CertBytes, request.Password, request.Uf);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = $"Falha na consulta SEFAZ: {ex.Message}" });
        }

        if (await _db.Companies.AnyAsync(c => c.Cnpj == sefazData.Cnpj, ct))
            return Results.BadRequest(new { Message = $"Empresa com CNPJ {sefazData.Cnpj} já cadastrada." });

        var company = new Company(sefazData.Cnpj, sefazData.CorporateName, sefazData.State);
        company.UpdateFiscalData(sefazData.CorporateName, sefazData.TradeName, sefazData.StateRegistration, null, sefazData.Crt, sefazData.Street, sefazData.Number, sefazData.Complement, sefazData.Neighborhood, sefazData.CityCode, sefazData.CityName, sefazData.State, sefazData.ZipCode);

        var encryptedPassword = CryptoService.Encrypt(request.Password);
        company.SetCertificate(request.CertBytes, encryptedPassword, sefazData.CertificateExpiration);

        _db.Companies.Add(company);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/companies/{company.Id}", new { company.Id, company.Cnpj, company.CorporateName, company.TradeName, company.State, company.CertificateExpiration });
    }
}

public class ListAllCompaniesHandler : IRequestHandler<ListAllCompaniesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListAllCompaniesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListAllCompaniesQuery request, CancellationToken ct)
    {
        var companies = await _db.Companies.AsNoTracking()
            .Select(c => new CompanyDto(c.Id, c.Cnpj, c.CorporateName, c.TradeName, c.State, c.IsActive, c.CreatedAt))
            .ToListAsync(ct);
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

        company.UpdateFiscalData(request.CorporateName, request.TradeName, company.StateRegistration, company.MunicipalRegistration, company.Crt, company.Street, company.Number, company.Complement, company.Neighborhood, company.CityCode, company.CityName, request.State, company.ZipCode);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Dados da empresa atualizados com sucesso." });
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
        return Results.Ok(new { Message = "Empresa removida com sucesso." });
    }
}

public static class CompanyCrudEndpoints
{
    public static void MapCompanyCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/companies").WithTags("Companies").RequireAuthorization();

        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListAllCompaniesQuery())).RequirePermission(Permissions.Companies.View);

        group.MapPost("/", async (IFormFile certificateFile, [FromForm] string certificatePassword, [FromForm] string uf, IMediator mediator) =>
        {
            if (certificateFile == null || certificateFile.Length == 0) return Results.BadRequest(new { Message = "Certificado obrigatório." });
            using var ms = new MemoryStream();
            await certificateFile.CopyToAsync(ms);
            return await mediator.Send(new CreateCompanyCommand(ms.ToArray(), certificatePassword, uf));
        }).RequirePermission(Permissions.Companies.Create).DisableAntiforgery();

        group.MapPut("/{id:guid}", async (Guid id, UpdateCompanyCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id })).RequirePermission(Permissions.Companies.Edit);
        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteCompanyCommand(id))).RequirePermission(Permissions.Companies.Delete);
    }
}