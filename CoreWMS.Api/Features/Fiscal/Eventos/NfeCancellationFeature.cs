using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Classes.Flags;
using DFe.Utils;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NFe.Servicos;
using NFe.Utils.Consulta;
using NFe.Utils.Evento;

namespace CoreWMS.Api.Features.Fiscal.Eventos;

public record CancelNfeCommand(
    Guid Id,
    string Justification
) : IRequest<IResult>;

public record CancelOutboundNfeCommand(
    Guid OrderId,
    string Justification
) : IRequest<IResult>;

public class CancelNfeCommandValidator : AbstractValidator<CancelNfeCommand>
{
    public CancelNfeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("O identificador do documento fiscal ou pedido é obrigatório.");
        RuleFor(x => x.Justification)
            .NotEmpty().WithMessage("A justificativa de cancelamento é obrigatória.")
            .MinimumLength(15).WithMessage("A justificativa deve ter no mínimo 15 caracteres (Regra SEFAZ).")
            .MaximumLength(255).WithMessage("A justificativa deve ter no máximo 255 caracteres.");
    }
}

public class CancelNfeHandler : IRequestHandler<CancelNfeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IZeusConfigurator _zeusConfigurator;

    public CancelNfeHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IZeusConfigurator zeusConfigurator)
    {
        _db = db;
        _tenant = tenant;
        _zeusConfigurator = zeusConfigurator;
    }

    public async Task<IResult> Handle(CancelNfeCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Localiza o documento fiscal autorizado:
        // Primeiro tenta localizar diretamente pelo Id do CompanyFiscalDocument (notas avulsas ou chamadas diretas)
        var authorizedDoc = await _db.CompanyFiscalDocuments
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
                .ThenInclude(o => o!.Company)
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.CompanyId == companyId, ct);

        // Se não encontrar por DocumentId, busca pelo OutboundOrderId vinculado (chamadas de dentro de detalhes de ordem)
        if (authorizedDoc == null)
        {
            authorizedDoc = await _db.CompanyFiscalDocuments
                .Include(d => d.Company)
                .Include(d => d.OutboundOrder)
                    .ThenInclude(o => o!.Company)
                .FirstOrDefaultAsync(d => d.OutboundOrderId == request.Id
                                       && (int)d.Type >= 1 && (int)d.Type <= 6
                                       && d.Status == FiscalDocumentStatus.Authorized, ct);
        }

        if (authorizedDoc == null)
            return Results.NotFound(new { Message = "Nota fiscal ou pedido correspondente não localizado." });

        if (authorizedDoc.Status != FiscalDocumentStatus.Authorized)
            return Results.BadRequest(new { Message = $"Apenas notas com status 'Autorizada' podem ser canceladas. Status atual: {authorizedDoc.Status}." });

        if (!authorizedDoc.Type.IsNfe())
            return Results.BadRequest(new { Message = "Apenas notas fiscais eletrônicas podem ser canceladas." });

        if (string.IsNullOrWhiteSpace(authorizedDoc.AccessKey) || string.IsNullOrWhiteSpace(authorizedDoc.Protocol))
            return Results.BadRequest(new { Message = "Chave de acesso ou protocolo de autorização não encontrados no registro fiscal." });

        // 2. Resolve os dados da empresa emitente
        var company = authorizedDoc.Company
                   ?? authorizedDoc.OutboundOrder?.Company
                   ?? await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);

        if (company == null)
            return Results.NotFound(new { Message = "Empresa emitente não encontrada." });

        if (company.CertificateBytes == null || company.CertificateBytes.Length == 0)
            return Results.BadRequest(new { Message = "Certificado digital A1 não configurado para a empresa emitente." });

        var cnpjEmitente = string.Join("", (company.Cnpj ?? "").Where(char.IsDigit));

        // 3. Configura a comunicação SEFAZ
        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;
        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);
        cfgServico.ValidarSchemas = false;

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        // 4. Criação do documento do evento de cancelamento (herda o OutboundOrderId se houver, ou null para avulsas)
        var cancelDoc = new CompanyFiscalDocument(companyId, FiscalDocumentType.Cancelamento, authorizedDoc.OutboundOrderId);
        _db.CompanyFiscalDocuments.Add(cancelDoc);

        // 5. Transmissão do Evento de Cancelamento (Código 110111)
        using var servicoNFe = new ServicosNFe(cfgServico, certificado);
        var loteId = new Random().Next(1000, 99999);

        var retornoEvento = servicoNFe.RecepcaoEventoCancelamento(
            idlote: loteId,
            sequenciaEvento: 1,
            protocoloAutorizacao: authorizedDoc.Protocol,
            chaveNFe: authorizedDoc.AccessKey,
            justificativa: request.Justification.Trim(),
            cpfcnpj: cnpjEmitente
        );

        var retEvento = retornoEvento.Retorno?.retEvento?.FirstOrDefault();
        var infEvento = retEvento?.infEvento;

        bool isSuccess = infEvento != null && (infEvento.cStat == 135 || infEvento.cStat == 136 || infEvento.cStat == 155);

        if (!isSuccess)
        {
            var motivoRejeicao = infEvento?.xMotivo
                              ?? retornoEvento.Retorno?.xMotivo
                              ?? "Falha desconhecida no cancelamento da SEFAZ.";

            cancelDoc.MarkAsRejected($"[Rejeição SEFAZ {infEvento?.cStat ?? retornoEvento.Retorno?.cStat}]: {motivoRejeicao}");
            await _db.SaveChangesAsync(ct);

            return Results.BadRequest(new
            {
                Code = "SEFAZ_EVENT_REJECTION",
                Message = $"Cancelamento não autorizado pela SEFAZ: {motivoRejeicao}",
                StatCode = infEvento?.cStat ?? retornoEvento.Retorno?.cStat
            });
        }

        // 6. Sucesso -> Salva XML completo do evento distribuído (procEventoNFe)
        var procEvento = retornoEvento.ProcEventosNFe?.FirstOrDefault();
        var xmlEventoProc = procEvento != null ? procEvento.ObterXmlString() : retornoEvento.RetornoCompletoStr;

        cancelDoc.MarkAsAuthorized(
            accessKey: authorizedDoc.AccessKey,
            protocol: infEvento!.nProt,
            rawXml: xmlEventoProc,
            message: infEvento.xMotivo
        );

        // Atualiza o documento original da NF-e para Cancelada
        authorizedDoc.MarkAsCanceled(infEvento.xMotivo);

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = "NF-e Cancelada com sucesso na SEFAZ!",
            Protocol = infEvento.nProt,
            EventDate = infEvento.dhRegEvento,
            AccessKey = authorizedDoc.AccessKey,
            Reason = infEvento.xMotivo
        });
    }
}

public static class NfeCancellationEndpoints
{
    public static void MapNfeCancellationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fiscal/nfe").WithTags("Fiscal").RequireAuthorization();

        // Aceita DocumentId (notas avulsas e diretas) ou OrderId (pedidos de saída)
        group.MapPost("/cancel/{id:guid}", async (Guid id, CancelNfeCommand cmd, IMediator mediator) =>
        {
            var command = cmd with { Id = id };
            return await mediator.Send(command);
        })
        .RequirePermission(Permissions.Outbound.Manage);
    }
}