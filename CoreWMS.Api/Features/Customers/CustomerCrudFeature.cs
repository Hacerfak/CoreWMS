using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

public record CustomerDto(Guid Id, Guid CompanyId, string Cnpj, string CorporateName, string? TradeName, string? StateRegistration, string? MunicipalRegistration, int Crt, string? Cnae, string? Street, string? Number, string? Complement, string? Neighborhood, int CityCode, string? CityName, string State, string? ZipCode, string? Email, string? Phone, bool RequireBatchControl, bool RequireExpirationControl, bool RequireSerialControl, bool AllowNegativeStock, bool AutoApproveReceiving, bool IsActive);
public record CreateCustomerCommand(string Cnpj, string CorporateName, string? TradeName, string? StateRegistration, string? MunicipalRegistration, int Crt, string? Cnae, string? Street, string? Number, string? Complement, string? Neighborhood, int CityCode, string? CityName, string State, string? ZipCode, string? Email, string? Phone, bool RequireBatchControl, bool RequireExpirationControl, bool RequireSerialControl, bool AllowNegativeStock, bool AutoApproveReceiving) : IRequest<IResult>;
public record UpdateCustomerCommand(Guid Id, string CorporateName, string? TradeName, string? StateRegistration, string? MunicipalRegistration, int Crt, string? Cnae, string? Street, string? Number, string? Complement, string? Neighborhood, int CityCode, string? CityName, string State, string? ZipCode, string? Email, string? Phone, bool RequireBatchControl, bool RequireExpirationControl, bool RequireSerialControl, bool AllowNegativeStock, bool AutoApproveReceiving) : IRequest<IResult>;
public record ListCustomersQuery(string? Search, bool OnlyActive = true) : IRequest<IResult>;

public class CreateCustomerHandler : IRequestHandler<CreateCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;
    public CreateCustomerHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor) { _db = db; _httpContextAccessor = httpContextAccessor; }

    public async Task<IResult> Handle(CreateCustomerCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        if (await _db.Customers.AnyAsync(c => c.CompanyId == companyId && c.Cnpj == request.Cnpj, ct))
            return Results.BadRequest(new { Message = "Já existe um cliente com este CNPJ nesta empresa." });

        var customer = new Customer(companyId, request.Cnpj, request.CorporateName, request.TradeName, request.StateRegistration, request.MunicipalRegistration, request.Crt, request.Cnae, request.Street, request.Number, request.Complement, request.Neighborhood, request.CityCode, request.CityName, request.State, request.ZipCode, request.Email, request.Phone, request.RequireBatchControl, request.RequireExpirationControl, request.RequireSerialControl, request.AllowNegativeStock, request.AutoApproveReceiving);
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(ct);
        return Results.Created($"/api/customers/{customer.Id}", customer);
    }
}

public class UpdateCustomerHandler : IRequestHandler<UpdateCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;
    public UpdateCustomerHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor) { _db = db; _httpContextAccessor = httpContextAccessor; }

    public async Task<IResult> Handle(UpdateCustomerCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct);
        if (customer == null) return Results.NotFound(new { Message = "Cliente não encontrado." });

        customer.Update(request.CorporateName, request.TradeName, request.StateRegistration, request.MunicipalRegistration, request.Crt, request.Cnae, request.Street, request.Number, request.Complement, request.Neighborhood, request.CityCode, request.CityName, request.State, request.ZipCode, request.Email, request.Phone, request.RequireBatchControl, request.RequireExpirationControl, request.RequireSerialControl, request.AllowNegativeStock, request.AutoApproveReceiving);
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Cadastro atualizado com sucesso." });
    }
}

public class ListCustomersHandler : IRequestHandler<ListCustomersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;
    public ListCustomersHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor) { _db = db; _httpContextAccessor = httpContextAccessor; }

    public async Task<IResult> Handle(ListCustomersQuery request, CancellationToken ct)
    {
        if (!Guid.TryParse(_httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        var q = _db.Customers.AsNoTracking().Where(c => c.CompanyId == companyId);
        if (request.OnlyActive) q = q.Where(c => c.IsActive);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            q = q.Where(c => c.CorporateName.ToLower().Contains(s) || c.Cnpj.Contains(s) || (c.TradeName != null && c.TradeName.ToLower().Contains(s)));
        }

        var list = await q.Select(c => new CustomerDto(c.Id, c.CompanyId, c.Cnpj, c.CorporateName, c.TradeName, c.StateRegistration, c.MunicipalRegistration, c.Crt, c.Cnae, c.Street, c.Number, c.Complement, c.Neighborhood, c.CityCode, c.CityName, c.State, c.ZipCode, c.Email, c.Phone, c.RequireBatchControl, c.RequireExpirationControl, c.RequireSerialControl, c.AllowNegativeStock, c.AutoApproveReceiving, c.IsActive)).ToListAsync(ct);
        return Results.Ok(list);
    }
}

public static class CustomerEndpoints
{
    public static void MapCustomerCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/customers").WithTags("Customers").RequireAuthorization();

        group.MapPost("/consult-sefaz/{cnpj}", async (string cnpj, string uf, ApplicationDbContext db, IHttpContextAccessor httpContext, ISefazConsultaCadastroService sefazService) =>
        {
            if (!Guid.TryParse(httpContext.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });
            var company = await db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId);
            if (company?.CertificateBytes == null || string.IsNullOrEmpty(company.CertificatePassword)) return Results.BadRequest(new { Message = "Certificado Digital A1 não cadastrado." });
            var certPassword = CryptoService.Decrypt(company.CertificatePassword);
            return Results.Ok(sefazService.Consultar(company.CertificateBytes, certPassword, uf, cnpj));
        }).RequirePermission(Permissions.Customers.Create);

        group.MapGet("/", async ([AsParameters] ListCustomersQuery query, IMediator mediator) => await mediator.Send(query)).RequirePermission(Permissions.Customers.View);
        group.MapPost("/", async (CreateCustomerCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Customers.Create);
        group.MapPut("/{id:guid}", async (Guid id, UpdateCustomerCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id })).RequirePermission(Permissions.Customers.Edit);
        group.MapDelete("/{id:guid}", async (Guid id, ApplicationDbContext db, IHttpContextAccessor httpContext) =>
        {
            if (!Guid.TryParse(httpContext.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });
            var customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId);
            if (customer == null) return Results.NotFound();
            customer.Deactivate();
            await db.SaveChangesAsync();
            return Results.Ok(new { Message = "Cliente inativado com sucesso." });
        }).RequirePermission(Permissions.Customers.Delete);
    }
}