using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;

namespace CoreWMS.Api.Features.Identity.Companies;

// 1. Request
public record SyncCompanySefazCommand(Guid Id) : IRequest<IResult>;

// 2. Handler
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
            return Results.BadRequest(new { Message = "Certificado Digital não configurado. Instale o certificado A1 antes de sincronizar." });

        try
        {
            var password = CryptoService.Decrypt(company.CertificatePassword);
            var sefazData = await _sefazService.ConsultarAsync(company.CertificateBytes, password, company.State, company.Cnpj);

            // Sugestão futura: Utilizar os dados para invocar o company.UpdateDetails(...) aqui
            return Results.Ok(sefazData);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = "A SEFAZ rejeitou a consulta ou está offline.", Details = ex.Message });
        }
    }
}

// 3. Endpoint
public static class SyncCompanySefazEndpoints
{
    public static void MapSyncCompanySefazEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/companies/{id:guid}/sync-sefaz", async (Guid id, IMediator mediator) =>
            await mediator.Send(new SyncCompanySefazCommand(id)))
            .WithTags("Companies")
            .RequireAuthorization()
            .RequirePermission(Permissions.Companies.Manage);
    }
}