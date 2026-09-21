using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

// 1. Request
public record ConsultCustomerSefazQuery(string Cnpj, string Uf) : IRequest<IResult>;

// 2. Handler
public class ConsultCustomerSefazHandler : IRequestHandler<ConsultCustomerSefazQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly ISefazConsultaCadastroService _sefazService;

    public ConsultCustomerSefazHandler(ApplicationDbContext db, ITenantProvider tenant, ISefazConsultaCadastroService sefazService)
    {
        _db = db;
        _tenant = tenant;
        _sefazService = sefazService;
    }

    public async Task<IResult> Handle(ConsultCustomerSefazQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, ct);

        if (company?.CertificateBytes == null || string.IsNullOrEmpty(company.CertificatePassword))
            return Results.BadRequest(new { Message = "Certificado Digital A1 não cadastrado na Matriz." });

        var certPassword = CryptoService.Decrypt(company.CertificatePassword);
        var sefazData = await _sefazService.ConsultarAsync(company.CertificateBytes, certPassword, request.Uf, request.Cnpj);

        return Results.Ok(sefazData);
    }
}

// 3. Endpoint
public static class ConsultCustomerSefazEndpoints
{
    public static void MapConsultCustomerSefazEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/customers/consult-sefaz/{cnpj}", async (string cnpj, string uf, IMediator mediator) =>
            await mediator.Send(new ConsultCustomerSefazQuery(cnpj, uf)))
           .WithTags("Customers")
           .RequireAuthorization()
           .RequirePermission(Permissions.Customers.Create);
    }
}