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
    int? CustomIndFinal = null,
    int? CustomIndPres = null,
    int? CustomTpImp = null,
    string? CustomAdditionalNotes = null
) : IRequest<IResult>;

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

        var order = await _db.OutboundOrders
            .Include(o => o.Company)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });
        if (order.Status != OutboundOrderStatus.ReadyToShip)
            return Results.BadRequest(new { Message = "O pedido precisa estar pronto na doca para emitir a NF-e." });

        var company = order.Company;
        if (company.CertificateBytes == null || company.CertificateBytes.Length == 0)
            return Results.BadRequest(new { Message = "A empresa não possui um Certificado Digital A1 cadastrado para emissão de NF-e." });

        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;
        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        // 1. CHECK DE STATUS DA SEFAZ (CACHE DE 1 HORA)
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

        // 2. CONSTRUÇÃO DO XML COM BASE NA NATUREZA SELECIONADA
        NFe.Classes.NFe nfe;
        FiscalOperationRule rule;

        try
        {
            (nfe, rule) = await _builder.BuildOutboundNfeAsync(order.Id, request.FiscalRuleId, ct);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = $"Falha ao montar o XML da NF-e: {ex.Message}" });
        }

        var fiscalDocType = rule.OperationType == FiscalOperationType.OutboundShipment
            ? FiscalDocumentType.NfeShipment
            : FiscalDocumentType.NfeReturn;

        var fiscalDoc = new OutboundFiscalDocument(order.Id, fiscalDocType);
        _db.Set<OutboundFiscalDocument>().Add(fiscalDoc);

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
                nfe.infNFe.infAdic = nfe.infNFe.infAdic ?? new NFe.Classes.Informacoes.Observacoes.infAdic();
                nfe.infNFe.infAdic.infCpl = request.CustomAdditionalNotes.Trim();
            }

            nfe.Assina(cfgServico);
            nfe.Valida(cfgServico);
        }
        catch (Exception ex)
        {
            fiscalDoc.MarkAsRejected($"Erro ao validar/assinar o XML da NF-e: {ex.Message}");
            await _db.SaveChangesAsync(ct);
            return Results.BadRequest(new { Message = $"Falha ao validar a NF-e: {ex.Message}" });
        }

        // 3. TRANSMISSÃO SÍNCRONA
        using var servicoNFe = new ServicosNFe(cfgServico, certificado);
        var loteId = new Random().Next(1000, 99999);
        var retornoEnvio = servicoNFe.NFeAutorizacao(loteId, IndicadorSincronizacao.Sincrono, new List<NFe.Classes.NFe> { nfe }, false);

        var prot = retornoEnvio?.Retorno?.protNFe?.infProt;

        if (retornoEnvio?.Retorno?.protNFe == null || (prot?.cStat != 100 && prot?.cStat != 150))
        {
            string motivoRejeicao = prot?.xMotivo ?? retornoEnvio?.Retorno?.xMotivo ?? "Erro desconhecido de autorização SEFAZ.";
            fiscalDoc.MarkAsRejected($"[Rejeição SEFAZ {prot?.cStat ?? retornoEnvio?.Retorno?.cStat}]: {motivoRejeicao}");

            if (retornoEnvio?.Retorno?.cStat == 108 || retornoEnvio?.Retorno?.cStat == 109)
                _cache.Remove(cacheKey);

            await _db.SaveChangesAsync(ct);

            return Results.BadRequest(new
            {
                Code = "SEFAZ_REJECTION",
                Message = $"NF-e Rejeitada pela SEFAZ: {motivoRejeicao}",
                FiscalDocumentId = fiscalDoc.Id
            });
        }

        // 4. AUTORIZOU -> GRAVA XML E INCREMENTA SEQUÊNCIAL
        var nfeProc = new NFe.Classes.nfeProc
        {
            NFe = nfe,
            protNFe = retornoEnvio.Retorno.protNFe,
            versao = retornoEnvio.Retorno.versao
        };

        var xmlAutorizado = nfeProc.ObterXmlString();
        var chNfe = prot.chNFe;
        var nProt = prot.nProt;
        var nNfEmitida = nfe.infNFe.ide.nNF;

        fiscalDoc.MarkAsAuthorized(chNfe, nProt, xmlAutorizado, prot.xMotivo);
        order.SetInvoiceDetails(nNfEmitida.ToString(), nfe.infNFe.ide.serie.ToString(), chNfe);

        // Incrementar a numeração da empresa
        company.UpdateNfeAndTransportDetails(company.NfeSerie, company.NfeNextNumber + 1, company.Rntrc);

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"NF-e Nº {nNfEmitida} Autorizada com Sucesso!",
            DocumentId = fiscalDoc.Id,
            AccessKey = chNfe,
            Protocol = nProt,
            InvoiceNumber = nNfEmitida.ToString()
        });
    }
}

public static class NfeEmissionEndpoints
{
    public static void MapNfeEmissionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fiscal/nfe").WithTags("Fiscal").RequireAuthorization();

        group.MapPost("/emit/{orderId:guid}", async (Guid orderId, EmitOutboundNfeCommand cmd, IMediator mediator) =>
        {
            var command = cmd with { OrderId = orderId };
            return await mediator.Send(command);
        })
        .RequirePermission(Permissions.Outbound.Manage);
    }
}