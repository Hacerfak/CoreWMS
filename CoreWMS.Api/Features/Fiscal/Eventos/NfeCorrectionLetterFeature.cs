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
using NFe.Classes.Servicos.Tipos;
using NFe.Servicos;
using NFe.Utils.Consulta;
using NFe.Utils.Evento;

namespace CoreWMS.Api.Features.Fiscal.Eventos;

public record EmitCorrectionLetterCommand(
    Guid OrderId,
    string CorrectionText
) : IRequest<IResult>;

public class EmitCorrectionLetterCommandValidator : AbstractValidator<EmitCorrectionLetterCommand>
{
    public EmitCorrectionLetterCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("O ID do pedido é obrigatório.");
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

        // 1. Localiza a ordem e a empresa emitente
        var order = await _db.OutboundOrders
            .Include(o => o.Company)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        // 2. Localiza a NF-e autorizada original
        var authorizedDoc = await _db.OutboundFiscalDocuments
            .FirstOrDefaultAsync(d => d.OutboundOrderId == order.Id
                                   && (d.Type == FiscalDocumentType.NfeReturn || d.Type == FiscalDocumentType.NfeShipment)
                                   && d.Status == FiscalDocumentStatus.Authorized, ct);

        if (authorizedDoc == null)
            return Results.BadRequest(new { Message = "Não há NF-e autorizada ativa para este pedido." });

        if (string.IsNullOrWhiteSpace(authorizedDoc.AccessKey))
            return Results.BadRequest(new { Message = "Chave de acesso da NF-e não localizada." });

        // 3. Determina a sequência do evento (1 a 20)
        var currentSeq = await _db.OutboundFiscalDocuments
            .CountAsync(d => d.OutboundOrderId == order.Id
                          && d.Type == FiscalDocumentType.Correction
                          && d.Status == FiscalDocumentStatus.Authorized, ct) + 1;

        if (currentSeq > 20)
            return Results.BadRequest(new { Message = "Atingido o limite máximo de 20 Cartas de Correção para esta NF-e (Regra SEFAZ)." });

        var company = order.Company;
        if (company.CertificateBytes == null || company.CertificateBytes.Length == 0)
            return Results.BadRequest(new { Message = "Certificado digital A1 não configurado para a empresa emitente." });

        var cnpjEmitente = string.Join("", (company.Cnpj ?? "").Where(char.IsDigit));
        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;

        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);

        // DESATIVA A VALIDAÇÃO LOCAL DE SCHEMA PARA EVITAR COLISÃO DE XSD NO .NET
        cfgServico.ValidarSchemas = false;

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        // 4. Cria registro inicial do documento da CC-e
        var correctionDoc = new OutboundFiscalDocument(order.Id, FiscalDocumentType.Correction);
        _db.Set<OutboundFiscalDocument>().Add(correctionDoc);

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

        // Códigos de homologação SEFAZ: 135 (Vinculado) ou 136 (Registrado)
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

        group.MapPost("/correction-letter/{orderId:guid}", async (Guid orderId, EmitCorrectionLetterCommand cmd, IMediator mediator) =>
        {
            var command = cmd with { OrderId = orderId };
            return await mediator.Send(command);
        })
        .RequirePermission(Permissions.Outbound.Manage);
    }
}