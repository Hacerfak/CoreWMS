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

public record EmitCorrectionLetterCommand(
    Guid Id,
    string CorrectionText
) : IRequest<IResult>;

public class EmitCorrectionLetterCommandValidator : AbstractValidator<EmitCorrectionLetterCommand>
{
    public EmitCorrectionLetterCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("O identificador do documento fiscal ou pedido é obrigatório.");
        RuleFor(x => x.CorrectionText)
            .NotEmpty().WithMessage("O texto de correção é obrigatório.")
            .MinimumLength(15).WithMessage("A correção deve ter no mínimo 15 caracteres (Regra SEFAZ).")
            .MaximumLength(1000).WithMessage("A correção deve ter no máximo 1000 caracteres (Regra SEFAZ).");
    }
}

public class EmitCorrectionLetterHandler : IRequestHandler<EmitCorrectionLetterCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IZeusConfigurator _zeusConfigurator;

    public EmitCorrectionLetterHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IZeusConfigurator zeusConfigurator)
    {
        _db = db;
        _tenant = tenant;
        _zeusConfigurator = zeusConfigurator;
    }

    public async Task<IResult> Handle(EmitCorrectionLetterCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Localiza o documento fiscal autorizado:
        // Primeiro tenta diretamente por DocumentId
        var authorizedDoc = await _db.CompanyFiscalDocuments
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
                .ThenInclude(o => o!.Company)
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.CompanyId == companyId, ct);

        // Se não encontrar por DocumentId, busca por OutboundOrderId vinculado
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
            return Results.BadRequest(new { Message = $"Apenas notas fiscais autorizadas podem receber Carta de Correção. Status atual: {authorizedDoc.Status}." });

        if (!authorizedDoc.Type.IsNfe())
            return Results.BadRequest(new { Message = "Apenas notas fiscais eletrônicas podem receber Carta de Correção." });

        if (string.IsNullOrWhiteSpace(authorizedDoc.AccessKey))
            return Results.BadRequest(new { Message = "Chave de acesso da NF-e não localizada no registro fiscal." });

        // 2. Determina a sequência do evento (1 a 20) com base na CHAVE DE ACESSO DA NOTA
        var currentSeq = await _db.CompanyFiscalDocuments
            .CountAsync(d => d.AccessKey == authorizedDoc.AccessKey
                          && d.Type == FiscalDocumentType.CartaCorrecao
                          && d.Status == FiscalDocumentStatus.Authorized, ct) + 1;

        if (currentSeq > 20)
            return Results.BadRequest(new { Message = "Atingido o limite máximo de 20 Cartas de Correção para esta NF-e (Regra SEFAZ)." });

        // 3. Resolve os dados da empresa emitente
        var company = authorizedDoc.Company
                   ?? authorizedDoc.OutboundOrder?.Company
                   ?? await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);

        if (company == null)
            return Results.NotFound(new { Message = "Empresa emitente não encontrada." });

        if (company.CertificateBytes == null || company.CertificateBytes.Length == 0)
            return Results.BadRequest(new { Message = "Certificado digital A1 não configurado para a empresa emitente." });

        var cnpjEmitente = string.Join("", (company.Cnpj ?? "").Where(char.IsDigit));
        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;

        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);
        cfgServico.ValidarSchemas = false;

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        // 4. Cria registro inicial do documento da CC-e (preserva OutboundOrderId ou null para avulsas)
        var correctionDoc = new CompanyFiscalDocument(companyId, FiscalDocumentType.CartaCorrecao, authorizedDoc.OutboundOrderId);
        _db.CompanyFiscalDocuments.Add(correctionDoc);

        // 5. Transmissão do Evento de Carta de Correção (tpEvento 110110)
        using var servicoNFe = new ServicosNFe(cfgServico, certificado);
        var loteId = new Random().Next(1000, 99999);

        var retornoEvento = servicoNFe.RecepcaoEventoCartaCorrecao(
            idlote: loteId,
            sequenciaEvento: currentSeq,
            chaveNFe: authorizedDoc.AccessKey,
            correcao: request.CorrectionText.Trim(),
            cpfcnpj: cnpjEmitente
        );

        var retEvento = retornoEvento.Retorno?.retEvento?.FirstOrDefault();
        var infEvento = retEvento?.infEvento;

        bool isSuccess = infEvento != null && (infEvento.cStat == 135 || infEvento.cStat == 136);

        if (!isSuccess)
        {
            var motivoRejeicao = infEvento?.xMotivo
                              ?? retornoEvento.Retorno?.xMotivo
                              ?? "Falha desconhecida no registro da Carta de Correção pela SEFAZ.";

            correctionDoc.MarkAsRejected($"[Rejeição SEFAZ {infEvento?.cStat ?? retornoEvento.Retorno?.cStat}]: {motivoRejeicao}");
            await _db.SaveChangesAsync(ct);

            return Results.BadRequest(new
            {
                Code = "SEFAZ_EVENT_REJECTION",
                Message = $"Carta de Correção não autorizada pela SEFAZ: {motivoRejeicao}",
                StatCode = infEvento?.cStat ?? retornoEvento.Retorno?.cStat
            });
        }

        // 6. Sucesso -> Salva o procEventoNFe distribuído
        var procEvento = retornoEvento.ProcEventosNFe?.FirstOrDefault();
        var xmlEventoProc = procEvento != null ? procEvento.ObterXmlString() : retornoEvento.RetornoCompletoStr;

        correctionDoc.MarkAsAuthorized(
            accessKey: authorizedDoc.AccessKey,
            protocol: infEvento!.nProt,
            rawXml: xmlEventoProc,
            message: infEvento.xMotivo
        );

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Carta de Correção (Seq #{currentSeq}) vinculada com sucesso na SEFAZ!",
            Protocol = infEvento.nProt,
            Sequence = currentSeq,
            EventDate = infEvento.dhRegEvento,
            AccessKey = authorizedDoc.AccessKey,
            Reason = infEvento.xMotivo
        });
    }
}

public static class NfeCorrectionLetterEndpoints
{
    public static void MapNfeCorrectionLetterEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fiscal/nfe").WithTags("Fiscal").RequireAuthorization();

        // Aceita DocumentId (notas avulsas e diretas) ou OrderId (pedidos de saída)
        group.MapPost("/correction-letter/{id:guid}", async (Guid id, EmitCorrectionLetterCommand cmd, IMediator mediator) =>
        {
            var command = cmd with { Id = id };
            return await mediator.Send(command);
        })
        .RequirePermission(Permissions.Outbound.Manage);
    }
}