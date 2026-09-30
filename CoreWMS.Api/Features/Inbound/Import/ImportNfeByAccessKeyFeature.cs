using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Classes.Flags;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Import;

public record ImportNfeByAccessKeyCommand(string AccessKey) : IRequest<IResult>;

public class ImportNfeByAccessKeyCommandValidator : AbstractValidator<ImportNfeByAccessKeyCommand>
{
    public ImportNfeByAccessKeyCommandValidator()
    {
        RuleFor(x => x.AccessKey)
            .NotEmpty().WithMessage("Informe a chave de acesso da NF-e.")
            .Length(44).WithMessage("A chave de acesso deve conter exatamente 44 dígitos numéricos.")
            .Matches(@"^\d{44}$").WithMessage("A chave de acesso deve ser composta apenas por números.");
    }
}

public class ImportNfeByAccessKeyHandler : IRequestHandler<ImportNfeByAccessKeyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly ISefazDistDFeService _sefazService;
    private readonly IMediator _mediator;

    public ImportNfeByAccessKeyHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        ISefazDistDFeService sefazService,
        IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _sefazService = sefazService;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(ImportNfeByAccessKeyCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var cleanKey = request.AccessKey.Trim();

        // 1. Valida se a NF-e já foi importada no WMS
        var existingOrder = await _db.InboundOrders
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.AccessKey == cleanKey, ct);

        if (existingOrder != null)
        {
            return Results.BadRequest(new { Message = $"NF-e Chave '{cleanKey}' já foi importada anteriormente no recebimento #{existingOrder.AccessKey}." });
        }

        // 2. Obtém os dados da Empresa e Certificado A1
        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company == null || company.CertificateBytes == null)
        {
            return Results.BadRequest(new { Message = "Certificado Digital A1 da Empresa não está configurado." });
        }

        // 3. Consulta e faz o download do XML na SEFAZ (com Ciência da Operação 210210 automática)
        var resultadoSefaz = await _sefazService.BaixarDocumentoPorChaveAsync(company, cleanKey, TipoAmbiente.Producao, ct);

        if (!resultadoSefaz.Sucesso || !resultadoSefaz.Documentos.Any())
        {
            return Results.BadRequest(new { Message = string.IsNullOrEmpty(resultadoSefaz.Mensagem) ? "Nenhum XML retornado pela SEFAZ." : resultadoSefaz.Mensagem });
        }

        var docProc = resultadoSefaz.Documentos.FirstOrDefault(d => d.Schema.ToLower().Contains("procnfe"))
                   ?? resultadoSefaz.Documentos.FirstOrDefault(d => !d.Schema.ToLower().Contains("resnfe") && !d.Schema.ToLower().Contains("evento"));

        if (docProc == null)
        {
            return Results.BadRequest(new { Message = "A SEFAZ confirmou o resumo da nota, mas o arquivo XML completo (procNFe) ainda não está liberado. Tente novamente em instantes." });
        }

        string xmlContent = docProc.XmlDescompactado;

        // 4. Executa a importação do XML pelo handler nativo do WMS
        var importXmlCommand = new ImportInboundXmlCommand(new List<string> { xmlContent });
        var importResult = await _mediator.Send(importXmlCommand, ct);

        // 5. Garante que o evento de Ciência (210210) fique registrado na InboundOrder no BD
        var createdOrder = await _db.InboundOrders.FirstOrDefaultAsync(o => o.CompanyId == companyId && o.AccessKey == cleanKey, ct);
        if (createdOrder != null)
        {
            var ciencia = resultadoSefaz.CienciaEfetuada;
            string protocol = ciencia?.Protocolo ?? "CIENCIA_AUTOMATICA_SEFAZ";
            DateTime eventDate = ciencia?.DataEvento ?? DateTime.UtcNow;

            createdOrder.UpdateSefazManifestStatus(210210, protocol, eventDate);
            await _db.SaveChangesAsync(ct);
        }

        return importResult;
    }
}

public static class ImportNfeByAccessKeyEndpoints
{
    public static void MapImportNfeByAccessKeyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/import-by-key", async (ImportNfeByAccessKeyCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Import);
    }
}