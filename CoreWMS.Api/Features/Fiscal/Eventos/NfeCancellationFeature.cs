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

public record CancelOutboundNfeCommand(
    Guid OrderId,
    string Justification
) : IRequest<IResult>;

public class CancelOutboundNfeCommandValidator : AbstractValidator<CancelOutboundNfeCommand>
{
    public CancelOutboundNfeCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("O ID do pedido é obrigatório.");
        RuleFor(x => x.Justification)
            .NotEmpty().WithMessage("A justificativa de cancelamento é obrigatória.")
            .MinimumLength(15).WithMessage("A justificativa deve ter no mínimo 15 caracteres (Regra SEFAZ).")
            .MaximumLength(255).WithMessage("A justificativa deve ter no máximo 255 caracteres.");
    }
}

public class CancelOutboundNfeHandler : IRequestHandler<CancelOutboundNfeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IZeusConfigurator _zeusConfigurator;

    public CancelOutboundNfeHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IZeusConfigurator zeusConfigurator)
    {
        _db = db;
        _tenant = tenant;
        _zeusConfigurator = zeusConfigurator;
    }

    public async Task<IResult> Handle(CancelOutboundNfeCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Busca o pedido e a empresa emitente
        var order = await _db.OutboundOrders
            .Include(o => o.Company)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        // 2. Localiza a NF-e autorizada do pedido
        var authorizedDoc = await _db.CompanyFiscalDocuments
    .FirstOrDefaultAsync(d => d.OutboundOrderId == order.Id
                           && (int)d.Type >= 1 && (int)d.Type <= 6
                           && d.Status == FiscalDocumentStatus.Authorized, ct);

        if (authorizedDoc == null)
            return Results.BadRequest(new { Message = "Não há NF-e autorizada ativa para este pedido." });

        if (string.IsNullOrWhiteSpace(authorizedDoc.AccessKey) || string.IsNullOrWhiteSpace(authorizedDoc.Protocol))
            return Results.BadRequest(new { Message = "Dados de chave de acesso ou protocolo da NF-e não localizados no registro fiscal." });

        var company = order.Company;
        if (company.CertificateBytes == null || company.CertificateBytes.Length == 0)
            return Results.BadRequest(new { Message = "Certificado digital A1 não configurado para a empresa emitente." });

        var cnpjEmitente = string.Join("", (company.Cnpj ?? "").Where(char.IsDigit));

        // 3. Configura comunicação Zeus SEFAZ
        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;
        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        // 4. Criação do documento fiscal de cancelamento (Pending)
        var cancelDoc = new CompanyFiscalDocument(companyId, FiscalDocumentType.Cancelamento, order.Id);
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

        // Códigos válidos SEFAZ: 135 (Vinculado), 136 (Registrado), 155 (Fora do prazo)
        bool isSuccess = infEvento != null && (infEvento.cStat == 135 || infEvento.cStat == 136 || infEvento.cStat == 155);

        if (!isSuccess)
        {
            var motivoRejeicao = infEvento?.xMotivo
                              ?? retornoEvento.Retorno?.xMotivo
                              ?? "Falha desconhecida no evento de cancelamento da SEFAZ.";

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

        // Atualiza a NF-e original para Canceled
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

        group.MapPost("/cancel/{orderId:guid}", async (Guid orderId, CancelOutboundNfeCommand cmd, IMediator mediator) =>
        {
            var command = cmd with { OrderId = orderId };
            return await mediator.Send(command);
        })
        .RequirePermission(Permissions.Outbound.Manage);
    }
}