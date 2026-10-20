using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using CoreWMS.Api.Infrastructure.Fiscal.Emissao;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Classes.Flags;
using DFe.Utils;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using NFe.Classes.Informacoes.Identificacao.Tipos;
using NFe.Classes.Servicos.Tipos;
using NFe.Servicos;
using NFe.Utils.NFe;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record EmitOutboundNfeCommand(
    Guid OrderId,
    Guid FiscalRuleId,
    Guid? InboundOrderIdFilter = null, // Emissão direcionada para os itens de uma remessa específica
    int? CustomIndFinal = null,
    int? CustomIndPres = null,
    int? CustomTpImp = null,
    string? CustomAdditionalNotes = null
) : IRequest<IResult>;

public record AuthorizedInvoiceResultDto(
    Guid DocumentId,
    string AccessKey,
    string? Protocol,
    string InvoiceNumber,
    string? InboundInvoiceNumber
);

public class EmitOutboundNfeHandler : IRequestHandler<EmitOutboundNfeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly NfeBuilderService _builder;
    private readonly IZeusConfigurator _zeusConfigurator;
    private readonly IMemoryCache _cache;

    public EmitOutboundNfeHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        NfeBuilderService builder,
        IZeusConfigurator zeusConfigurator,
        IMemoryCache cache)
    {
        _db = db;
        _tenant = tenant;
        _builder = builder;
        _zeusConfigurator = zeusConfigurator;
        _cache = cache;
    }

    public async Task<IResult> Handle(EmitOutboundNfeCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Carrega a ordem com a empresa emitente e as configurações do cliente depositante
        var order = await _db.OutboundOrders
            .Include(o => o.Company)
            .Include(o => o.Customer)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status != OutboundOrderStatus.ReadyToShip && order.Status != OutboundOrderStatus.Shipped)
            return Results.BadRequest(new { Message = "O pedido precisa de estar pronto na doca ou já expedido (com NF-e cancelada) para emitir uma nova NF-e." });

        var company = order.Company;
        if (company.CertificateBytes == null || company.CertificateBytes.Length == 0)
            return Results.BadRequest(new { Message = "A empresa não possui um Certificado Digital A1 cadastrado para emissão de NF-e." });

        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;
        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);
        cfgServico.ValidarSchemas = false;

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        // 2. Verificação de status do webservice da SEFAZ (cache de 1 hora)
        var cacheKey = $"SEFAZ_STATUS_{cfgServico.cUF}_{cfgServico.tpAmb}";
        if (!_cache.TryGetValue(cacheKey, out bool isSefazUp))
        {
            using var servicoStatus = new ServicosNFe(cfgServico, certificado);
            try
            {
                var retStatus = servicoStatus.NfeStatusServico();
                isSefazUp = retStatus.Retorno.cStat == 107;
                _cache.Set(cacheKey, isSefazUp, TimeSpan.FromHours(1));
            }
            catch
            {
                isSefazUp = false;
            }
        }

        if (!isSefazUp)
            return Results.BadRequest(new { Message = $"A SEFAZ do estado {cfgServico.cUF} encontra-se inoperante ou em contingência." });

        // 3. Mapeia as NFs de entrada das mercadorias separadas nas HUs do pedido
        var allocations = await _db.OutboundAllocations
            .AsNoTracking()
            .Include(a => a.HandlingUnit)
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked && a.HandlingUnit.ReceiptDocumentId != null)
            .ToListAsync(ct);

        var receiptDocIds = allocations
            .Select(a => a.HandlingUnit.ReceiptDocumentId!.Value)
            .Distinct()
            .ToList();

        var inboundOrders = await _db.InboundOrders
            .AsNoTracking()
            .Where(io => receiptDocIds.Contains(io.Id))
            .ToDictionaryAsync(io => io.Id, ct);

        // 4. Carrega as notas fiscais ativas já existentes para esta ordem
        var activeNfes = await _db.CompanyFiscalDocuments
            .Where(d => d.OutboundOrderId == order.Id
                     && (int)d.Type >= 1 && (int)d.Type <= 6
                     && d.Status != FiscalDocumentStatus.Canceled)
            .ToListAsync(ct);

        // 5. Determinação da estratégia de emissão (1 NF consolidada vs 1 NF por NF de remessa)
        bool emitPerReferencedInvoice = order.Customer?.ReturnInvoicePerReferencedInvoice == true && receiptDocIds.Count > 1; //[cite: 39]
        List<Guid?> inboundsToEmit;

        if (request.InboundOrderIdFilter.HasValue && request.InboundOrderIdFilter.Value != Guid.Empty)
        {
            var filterId = request.InboundOrderIdFilter.Value;
            if (inboundOrders.TryGetValue(filterId, out var targetInb))
            {
                bool alreadyEmitted = activeNfes.Any(d => d.RawXml != null && !string.IsNullOrWhiteSpace(targetInb.AccessKey) && d.RawXml.Contains(targetInb.AccessKey));
                if (alreadyEmitted)
                {
                    return Results.BadRequest(new { Message = $"Já existe uma NF-e ativa emitida para os itens da NF de remessa #{targetInb.InvoiceNumber}." });
                }
            }
            inboundsToEmit = new List<Guid?> { filterId };
        }
        else if (emitPerReferencedInvoice)
        {
            var pendingInboundIds = new List<Guid?>();
            foreach (var inbId in receiptDocIds)
            {
                if (inboundOrders.TryGetValue(inbId, out var inb))
                {
                    bool alreadyEmitted = activeNfes.Any(d => d.RawXml != null && !string.IsNullOrWhiteSpace(inb.AccessKey) && d.RawXml.Contains(inb.AccessKey));
                    if (!alreadyEmitted)
                    {
                        pendingInboundIds.Add(inbId);
                    }
                }
                else
                {
                    pendingInboundIds.Add(inbId);
                }
            }

            if (!pendingInboundIds.Any())
            {
                return Results.BadRequest(new { Message = "Todas as NF-es de retorno vinculadas às notas de remessa deste pedido já foram emitidas e encontram-se ativas." });
            }

            inboundsToEmit = pendingInboundIds;
        }
        else
        {
            if (activeNfes.Any())
            {
                return Results.BadRequest(new { Message = "Não é possível emitir uma nova NF-e enquanto houver uma nota fiscal ativa para este pedido." });
            }

            inboundsToEmit = new List<Guid?> { null };
        }

        // 6. Executa a emissão de cada nota fiscal necessária
        var authorizedInvoices = new List<AuthorizedInvoiceResultDto>();

        foreach (var inboundId in inboundsToEmit)
        {
            string? inboundInvoiceNumber = null;
            if (inboundId.HasValue && inboundOrders.TryGetValue(inboundId.Value, out var inbRef))
            {
                inboundInvoiceNumber = inbRef.InvoiceNumber ?? inbRef.InvoiceNumber;
            }

            NFe.Classes.NFe nfe;
            FiscalOperationRule rule;

            try
            {
                (nfe, rule) = await _builder.BuildOutboundNfeAsync(
                    order.Id,
                    request.FiscalRuleId,
                    ct,
                    inboundOrderIdFilter: inboundId,
                    customIndFinal: request.CustomIndFinal,
                    customIndPres: request.CustomIndPres,
                    customTpImp: request.CustomTpImp,
                    customAdditionalNotes: request.CustomAdditionalNotes
                );
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { Message = $"Falha ao montar o XML da NF-e{(inboundInvoiceNumber != null ? $" para a Remessa #{inboundInvoiceNumber}" : "")}: {ex.Message}" });
            }

            var fiscalDoc = new CompanyFiscalDocument(companyId, rule.Finalidade, order.Id);
            _db.CompanyFiscalDocuments.Add(fiscalDoc);

            string xmlAssinado;
            string chNfe;

            // Assinatura, validação e persistência prévia do XML para auditoria
            try
            {
                if (request.CustomIndFinal.HasValue)
                    nfe.infNFe.ide.indFinal = (ConsumidorFinal)request.CustomIndFinal.Value;

                if (request.CustomIndPres.HasValue)
                    nfe.infNFe.ide.indPres = (PresencaComprador)request.CustomIndPres.Value;

                if (request.CustomTpImp.HasValue)
                    nfe.infNFe.ide.tpImp = (TipoImpressao)request.CustomTpImp.Value;

                if (!string.IsNullOrWhiteSpace(request.CustomAdditionalNotes))
                {
                    nfe.infNFe.infAdic ??= new NFe.Classes.Informacoes.Observacoes.infAdic();
                    nfe.infNFe.infAdic.infCpl = request.CustomAdditionalNotes.Trim();
                }

                nfe.Assina(cfgServico);
                nfe.Valida(cfgServico);

                xmlAssinado = nfe.ObterXmlString();
                chNfe = nfe.infNFe.Id?.Replace("NFe", "").Trim() ?? "";

                fiscalDoc.SetTransmittedXml(chNfe, xmlAssinado);
                await _db.SaveChangesAsync(ct);
            }
            catch (Exception ex)
            {
                fiscalDoc.MarkAsRejected($"Erro ao validar/assinar o XML da NF-e: {ex.Message}");
                await _db.SaveChangesAsync(ct);
                return Results.BadRequest(new { Message = $"Falha ao validar a NF-e: {ex.Message}" });
            }

            // Transmissão síncrona para a SEFAZ
            using var servicoNFe = new ServicosNFe(cfgServico, certificado);
            var loteId = new Random().Next(1000, 99999);
            var retornoEnvio = servicoNFe.NFeAutorizacao(loteId, IndicadorSincronizacao.Sincrono, new List<NFe.Classes.NFe> { nfe }, false);

            var prot = retornoEnvio?.Retorno?.protNFe?.infProt;

            if (retornoEnvio?.Retorno?.protNFe == null || (prot?.cStat != 100 && prot?.cStat != 150))
            {
                string motivoRejeicao = prot?.xMotivo ?? retornoEnvio?.Retorno?.xMotivo ?? "Erro desconhecido de autorização SEFAZ.";
                fiscalDoc.MarkAsRejected($"[Rejeição SEFAZ {prot?.cStat ?? retornoEnvio?.Retorno?.cStat}]: {motivoRejeicao}", chNfe, xmlAssinado);

                if (retornoEnvio?.Retorno?.cStat == 108 || retornoEnvio?.Retorno?.cStat == 109)
                    _cache.Remove(cacheKey);

                await _db.SaveChangesAsync(ct);

                return Results.BadRequest(new
                {
                    Code = "SEFAZ_REJECTION",
                    Message = $"NF-e Rejeitada pela SEFAZ{(inboundInvoiceNumber != null ? $" (Remessa #{inboundInvoiceNumber})" : "")}: {motivoRejeicao}",
                    FiscalDocumentId = fiscalDoc.Id,
                    AccessKey = chNfe
                });
            }

            // Autorização homologada com sucesso
            var nfeProc = new NFe.Classes.nfeProc
            {
                NFe = nfe,
                protNFe = retornoEnvio.Retorno.protNFe,
                versao = retornoEnvio.Retorno.versao
            };

            var xmlAutorizado = nfeProc.ObterXmlString();
            var chNfeAutorizada = prot.chNFe;
            var nProt = prot.nProt;
            var nNfEmitida = nfe.infNFe.ide.nNF;

            fiscalDoc.MarkAsAuthorized(chNfeAutorizada, nProt, xmlAutorizado, prot.xMotivo);
            order.SetInvoiceDetails(nNfEmitida.ToString(), nfe.infNFe.ide.serie.ToString(), chNfeAutorizada);
            company.UpdateNfeAndTransportDetails(company.NfeSerie, company.NfeNextNumber + 1, company.Rntrc);

            await _db.SaveChangesAsync(ct);

            authorizedInvoices.Add(new AuthorizedInvoiceResultDto(
                fiscalDoc.Id,
                chNfeAutorizada,
                nProt,
                nNfEmitida.ToString(),
                inboundInvoiceNumber
            ));
        }

        var firstInvoice = authorizedInvoices.First();

        return Results.Ok(new
        {
            Message = authorizedInvoices.Count == 1
                ? $"NF-e Nº {firstInvoice.InvoiceNumber} Autorizada com Sucesso!"
                : $"{authorizedInvoices.Count} NF-e(s) autorizada(s) com sucesso na SEFAZ!",
            DocumentId = firstInvoice.DocumentId,
            AccessKey = firstInvoice.AccessKey,
            Protocol = firstInvoice.Protocol,
            InvoiceNumber = firstInvoice.InvoiceNumber,
            Invoices = authorizedInvoices
        });
    }
}

public static class NfeEmissionEndpoints
{
    public static void MapNfeEmissionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fiscal/nfe").WithTags("Fiscal").RequireAuthorization();

        group.MapPost("/emit/{orderId:guid}", async (
            Guid orderId,
            [FromBody] EmitOutboundNfeCommand cmd,
            [FromQuery] Guid? inboundOrderId,
            IMediator mediator) =>
        {
            var command = cmd with
            {
                OrderId = orderId,
                InboundOrderIdFilter = cmd.InboundOrderIdFilter ?? inboundOrderId
            };

            return await mediator.Send(command);
        })
        .RequirePermission(Permissions.Outbound.Manage);
    }
}