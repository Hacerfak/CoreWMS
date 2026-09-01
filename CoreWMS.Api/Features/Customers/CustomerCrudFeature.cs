using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

// ==========================================
// 1. CONTRATOS E DTOs
// ==========================================
public record CustomerDto(Guid Id, Guid CompanyId, string Cnpj, string CorporateName, string? TradeName, string? StateRegistration, string? MunicipalRegistration, int Crt, string? Cnae, string? Street, string? Number, string? Complement, string? Neighborhood, int CityCode, string? CityName, string State, string? ZipCode, string? Email, string? Phone, bool RequireBatchControl, bool RequireExpirationControl, bool RequireSerialControl, bool AllowNegativeStock, bool AutoApproveReceiving, bool IsActive);

public record CreateCustomerCommand(string Cnpj, string CorporateName, string? TradeName, string? StateRegistration, string? MunicipalRegistration, int Crt, string? Cnae, string? Street, string? Number, string? Complement, string? Neighborhood, int CityCode, string? CityName, string State, string? ZipCode, string? Email, string? Phone, bool RequireBatchControl, bool RequireExpirationControl, bool RequireSerialControl, bool AllowNegativeStock, bool AutoApproveReceiving) : IRequest<IResult>;
public record UpdateCustomerCommand(Guid Id, string CorporateName, string? TradeName, string? StateRegistration, string? MunicipalRegistration, int Crt, string? Cnae, string? Street, string? Number, string? Complement, string? Neighborhood, int CityCode, string? CityName, string State, string? ZipCode, string? Email, string? Phone, bool RequireBatchControl, bool RequireExpirationControl, bool RequireSerialControl, bool AllowNegativeStock, bool AutoApproveReceiving) : IRequest<IResult>;

public record ListCustomersQuery(string? Search, bool OnlyActive = true) : IRequest<IResult>;

// NOVO: Commands/Queries para operações que estavam "inline"
public record DeleteCustomerCommand(Guid Id) : IRequest<IResult>;
public record ConsultCustomerSefazQuery(string Cnpj, string Uf) : IRequest<IResult>;

// ==========================================
// 2. VALIDADORES
// ==========================================
public class CreateCustomerCommandValidator : AbstractValidator<CreateCustomerCommand>
{
    public CreateCustomerCommandValidator()
    {
        RuleFor(x => x.Cnpj).NotEmpty().Length(14).WithMessage("O CNPJ deve conter exatamente 14 caracteres numéricos.");
        RuleFor(x => x.CorporateName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.State).NotEmpty().MaximumLength(2);
    }
}

public class UpdateCustomerCommandValidator : AbstractValidator<UpdateCustomerCommand>
{
    public UpdateCustomerCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CorporateName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.State).NotEmpty().MaximumLength(2);
    }
}

// ==========================================
// 3. HANDLERS
// ==========================================
public class CreateCustomerHandler : IRequestHandler<CreateCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CreateCustomerHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> Handle(CreateCustomerCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        if (await _db.Customers.AnyAsync(c => c.CompanyId == companyId && c.Cnpj == request.Cnpj, ct))
            return Results.BadRequest(new { Message = "Já existe um cliente com este CNPJ nesta empresa." });

        var customer = new Customer(
            companyId, request.Cnpj, request.CorporateName, request.TradeName,
            request.StateRegistration, request.MunicipalRegistration, request.Crt,
            request.Cnae, request.Street, request.Number, request.Complement,
            request.Neighborhood, request.CityCode, request.CityName, request.State,
            request.ZipCode, request.Email, request.Phone, request.RequireBatchControl,
            request.RequireExpirationControl, request.RequireSerialControl,
            request.AllowNegativeStock, request.AutoApproveReceiving);

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/customers/{customer.Id}", customer.Adapt<CustomerDto>());
    }
}

public class UpdateCustomerHandler : IRequestHandler<UpdateCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public UpdateCustomerHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> Handle(UpdateCustomerCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "Cabeçalho X-Company-Id é obrigatório." });

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct);
        if (customer == null) return Results.NotFound(new { Message = "Cliente não encontrado." });

        customer.Update(request.CorporateName, request.TradeName, request.StateRegistration, request.MunicipalRegistration, request.Crt, request.Cnae, request.Street, request.Number, request.Complement, request.Neighborhood, request.CityCode, request.CityName, request.State, request.ZipCode, request.Email, request.Phone, request.RequireBatchControl, request.RequireExpirationControl, request.RequireSerialControl, request.AllowNegativeStock, request.AutoApproveReceiving);

        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class ListCustomersHandler : IRequestHandler<ListCustomersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public ListCustomersHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

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

        var list = await q.ProjectToType<CustomerDto>().ToListAsync(ct);
        return Results.Ok(list);
    }
}

// NOVO: Handler de Exclusão Física/Lógica isolado
public class DeleteCustomerHandler : IRequestHandler<DeleteCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public DeleteCustomerHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<IResult> Handle(DeleteCustomerCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct);
        if (customer == null) return Results.NotFound();

        customer.Deactivate(); // Exclusão Lógica
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// NOVO: Handler de Consulta SEFAZ isolado
public class ConsultCustomerSefazHandler : IRequestHandler<ConsultCustomerSefazQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ISefazConsultaCadastroService _sefazService;

    public ConsultCustomerSefazHandler(ApplicationDbContext db, IHttpContextAccessor httpContextAccessor, ISefazConsultaCadastroService sefazService)
    {
        _db = db;
        _httpContextAccessor = httpContextAccessor;
        _sefazService = sefazService;
    }

    public async Task<IResult> Handle(ConsultCustomerSefazQuery request, CancellationToken ct)
    {
        if (!Guid.TryParse(_httpContextAccessor.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, ct);

        if (company?.CertificateBytes == null || string.IsNullOrEmpty(company.CertificatePassword))
            return Results.BadRequest(new { Message = "Certificado Digital A1 não cadastrado na Matriz." });

        var certPassword = CryptoService.Decrypt(company.CertificatePassword);

        // A falha da SEFAZ lança exceção interceptada pelo GlobalExceptionHandler
        var sefazData = _sefazService.Consultar(company.CertificateBytes, certPassword, request.Uf, request.Cnpj);

        return Results.Ok(sefazData);
    }
}

// ==========================================
// 4. ENDPOINTS
// ==========================================
public static class CustomerEndpoints
{
    public static void MapCustomerCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/customers").WithTags("Customers").RequireAuthorization();

        group.MapPost("/consult-sefaz/{cnpj}", async (string cnpj, string uf, IMediator mediator) =>
            await mediator.Send(new ConsultCustomerSefazQuery(cnpj, uf)))
            .RequirePermission(Permissions.Customers.Create);

        group.MapGet("/", async ([AsParameters] ListCustomersQuery query, IMediator mediator) =>
            await mediator.Send(query))
            .RequirePermission(Permissions.Customers.View);

        group.MapPost("/", async (CreateCustomerCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .RequirePermission(Permissions.Customers.Create);

        group.MapPut("/{id:guid}", async (Guid id, UpdateCustomerCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
            .RequirePermission(Permissions.Customers.Edit);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteCustomerCommand(id)))
            .RequirePermission(Permissions.Customers.Delete);
    }
}