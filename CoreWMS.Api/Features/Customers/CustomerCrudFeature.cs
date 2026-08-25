using System.Security.Claims;
using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

// DTOs
public record CustomerDto(
    Guid Id,
    Guid CompanyId,
    string Cnpj,
    string CorporateName,
    string? TradeName,
    string? StateRegistration,
    string? MunicipalRegistration,
    int Crt,
    string? Cnae,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    int CityCode,
    string? CityName,
    string State,
    string? ZipCode,
    string? Email,
    string? Phone,
    bool RequireBatchControl,
    bool RequireExpirationControl,
    bool RequireSerialControl,
    bool AllowNegativeStock,
    bool AutoApproveReceiving,
    bool IsActive
);

public record CreateCustomerCommand(
    string Cnpj,
    string CorporateName,
    string? TradeName,
    string? StateRegistration,
    string? MunicipalRegistration,
    int Crt,
    string? Cnae,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    int CityCode,
    string? CityName,
    string State,
    string? ZipCode,
    string? Email,
    string? Phone,
    bool RequireBatchControl,
    bool RequireExpirationControl,
    bool RequireSerialControl,
    bool AllowNegativeStock,
    bool AutoApproveReceiving
) : ICommand<IResult>;

public record UpdateCustomerCommand(
    Guid Id,
    string CorporateName,
    string? TradeName,
    string? StateRegistration,
    string? MunicipalRegistration,
    int Crt,
    string? Cnae,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    int CityCode,
    string? CityName,
    string State,
    string? ZipCode,
    string? Email,
    string? Phone,
    bool RequireBatchControl,
    bool RequireExpirationControl,
    bool RequireSerialControl,
    bool AllowNegativeStock,
    bool AutoApproveReceiving
) : ICommand<IResult>;

public record ListCustomersQuery(string? Search, bool OnlyActive = true) : IQuery<IResult>;

// HANDLERS
public class CreateCustomerHandler : ICommandHandler<CreateCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CreateCustomerHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> HandleAsync(CreateCustomerCommand command, CancellationToken ct = default)
    {
        var companyIdHeader = _httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString();
        if (!Guid.TryParse(companyIdHeader, out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        var exists = await _db.Customers.AnyAsync(c => c.CompanyId == companyId && c.Cnpj == command.Cnpj, ct);
        if (exists)
            return Results.BadRequest(new { Message = "Já existe um cliente depositante cadastrado com este CNPJ nesta empresa." });

        var customer = new Customer(
            companyId, command.Cnpj, command.CorporateName, command.TradeName, command.StateRegistration,
            command.MunicipalRegistration, command.Crt, command.Cnae, command.Street, command.Number, command.Complement,
            command.Neighborhood, command.CityCode, command.CityName, command.State, command.ZipCode,
            command.Email, command.Phone, command.RequireBatchControl, command.RequireExpirationControl,
            command.RequireSerialControl, command.AllowNegativeStock, command.AutoApproveReceiving
        );

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/customers/{customer.Id}", new { customer.Id, Message = "Cliente depositante cadastrado com sucesso." });
    }
}

public class UpdateCustomerHandler : ICommandHandler<UpdateCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public UpdateCustomerHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> HandleAsync(UpdateCustomerCommand command, CancellationToken ct = default)
    {
        var companyIdHeader = _httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString();
        if (!Guid.TryParse(companyIdHeader, out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == command.Id && c.CompanyId == companyId, ct);
        if (customer == null)
            return Results.NotFound(new { Message = "Cliente depositante não encontrado." });

        customer.Update(
            command.CorporateName, command.TradeName, command.StateRegistration, command.MunicipalRegistration,
            command.Crt, command.Cnae, command.Street, command.Number, command.Complement, command.Neighborhood,
            command.CityCode, command.CityName, command.State, command.ZipCode, command.Email, command.Phone,
            command.RequireBatchControl, command.RequireExpirationControl, command.RequireSerialControl,
            command.AllowNegativeStock, command.AutoApproveReceiving
        );

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Cadastro do cliente depositante atualizado com sucesso." });
    }
}

public class ListCustomersHandler : IQueryHandler<ListCustomersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public ListCustomersHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> HandleAsync(ListCustomersQuery query, CancellationToken ct = default)
    {
        var companyIdHeader = _httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString();
        if (!Guid.TryParse(companyIdHeader, out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        var q = _db.Customers.AsNoTracking().Where(c => c.CompanyId == companyId);

        if (query.OnlyActive)
            q = q.Where(c => c.IsActive);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim().ToLower();
            q = q.Where(c => c.CorporateName.ToLower().Contains(search) || c.Cnpj.Contains(search) || (c.TradeName != null && c.TradeName.ToLower().Contains(search)));
        }

        var list = await q.Select(c => new CustomerDto(
            c.Id, c.CompanyId, c.Cnpj, c.CorporateName, c.TradeName, c.StateRegistration, c.MunicipalRegistration,
            c.Crt, c.Cnae, c.Street, c.Number, c.Complement, c.Neighborhood, c.CityCode, c.CityName, c.State,
            c.ZipCode, c.Email, c.Phone, c.RequireBatchControl, c.RequireExpirationControl, c.RequireSerialControl,
            c.AllowNegativeStock, c.AutoApproveReceiving, c.IsActive
        )).ToListAsync(ct);

        return Results.Ok(list);
    }
}

// ENDPOINTS
public static class CustomerEndpoints
{
    public static void MapCustomerCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/customers")
            .WithTags("Customers")
            .RequireAuthorization();

        // Consulta de CNPJ do Depositante na SEFAZ via Certificado da Empresa ativa
        group.MapPost("/consult-sefaz/{cnpj}", async (
            string cnpj,
            string uf,
            ApplicationDbContext db,
            IHttpContextAccessor httpContext,
            ISefazConsultaCadastroService sefazService) =>
        {
            var companyIdHeader = httpContext.HttpContext?.Request.Headers["X-Company-Id"].ToString();
            if (!Guid.TryParse(companyIdHeader, out var companyId))
                return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

            var company = await db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId);
            if (company?.CertificateBytes == null || string.IsNullOrEmpty(company.CertificatePassword))
                return Results.BadRequest(new { Message = "A empresa selecionada não possui Certificado Digital A1 cadastrado para consultar a SEFAZ." });

            var certPassword = CryptoService.Decrypt(company.CertificatePassword);
            var result = sefazService.Consultar(company.CertificateBytes, certPassword, uf, cnpj);
            return Results.Ok(result);
        }).RequirePermission(Permissions.Customers.Create);

        group.MapGet("/", async ([AsParameters] ListCustomersQuery query, IQueryHandler<ListCustomersQuery, IResult> handler) =>
            await handler.HandleAsync(query)).RequirePermission(Permissions.Customers.View);

        group.MapPost("/", async (CreateCustomerCommand cmd, ICommandHandler<CreateCustomerCommand, IResult> handler) =>
            await handler.HandleAsync(cmd)).RequirePermission(Permissions.Customers.Create);

        group.MapPut("/{id:guid}", async (Guid id, UpdateCustomerCommand cmd, ICommandHandler<UpdateCustomerCommand, IResult> handler) =>
            await handler.HandleAsync(cmd with { Id = id })).RequirePermission(Permissions.Customers.Edit);

        group.MapDelete("/{id:guid}", async (Guid id, ApplicationDbContext db, IHttpContextAccessor httpContext) =>
        {
            var companyIdHeader = httpContext.HttpContext?.Request.Headers["X-Company-Id"].ToString();
            if (!Guid.TryParse(companyIdHeader, out var companyId))
                return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

            var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId);
            if (customer == null) return Results.NotFound();

            customer.Deactivate();
            await db.SaveChangesAsync();
            return Results.Ok(new { Message = "Cliente depositante inativado com sucesso." });
        }).RequirePermission(Permissions.Customers.Delete);
    }
}