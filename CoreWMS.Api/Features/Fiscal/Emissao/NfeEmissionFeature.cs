using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using CoreWMS.Api.Infrastructure.Fiscal.Emissao;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Utils;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using NFe.Servicos;
using NFe.Utils.NFe;
using NFe.Classes.Servicos.Tipos;
using DFe.Classes.Flags;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record EmitOutboundNfeCommand(Guid OrderId, FiscalOperationType OperationType) : IRequest<IResult>;

public class EmitOutboundNfeHandler : IRequestHandler<EmitOutboundNfeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly NfeBuilderService _builder;
    private readonly IZeusConfigurator _zeusConfigurator;
    private readonly IMemoryCache _cache; // Injeção do Cache Nativo

    public EmitOutboundNfeHandler(ApplicationDbContext db, ITenantProvider tenant, NfeBuilderService builder, IZeusConfigurator zeusConfigurator, IMemoryCache cache)
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

        if (order == null) return Results.NotFound();
        if (order.Status != OutboundOrderStatus.ReadyToShip)
            return Results.BadRequest(new { Message = "O pedido precisa estar pronto na doca para emitir a NF-e." });

        // 1. Cria a configuração Thread-Safe do Zeus
        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(order.Company, TipoAmbiente.Homologacao);

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        // =========================================================
        // 2. CHECK DE STATUS DA SEFAZ (CACHE DE 1 HORA)
        // =========================================================
        var cacheKey = $"SEFAZ_STATUS_{cfgServico.cUF}_{cfgServico.tpAmb}";

        if (!_cache.TryGetValue(cacheKey, out bool isSefazUp))
        {
            using var servicoStatus = new ServicosNFe(cfgServico, certificado);
            try
            {
                var retStatus = servicoStatus.NfeStatusServico();
                // 107 = Serviço em Operação
                isSefazUp = retStatus.Retorno.cStat == 107;
                _cache.Set(cacheKey, isSefazUp, TimeSpan.FromHours(1)); // Salva no cache
            }
            catch
            {
                isSefazUp = false; // Se deu WebException na consulta, tá fora.
            }
        }

        if (!isSefazUp)
        {
            return Results.BadRequest(new { Message = $"A SEFAZ do estado {cfgServico.cUF} encontra-se inoperante ou em contingência." });
        }

        // =========================================================
        // 3. CONSTRUÇÃO E ENVIO DA NOTA
        // =========================================================
        var nfe = await _builder.BuildOutboundNfeAsync(order.Id, request.OperationType, ct);
        var fiscalDoc = new OutboundFiscalDocument(order.Id, request.OperationType == FiscalOperationType.OutboundReturnNormal ? FiscalDocumentType.NfeReturn : FiscalDocumentType.NfeShipment);

        _db.Set<OutboundFiscalDocument>().Add(fiscalDoc); // Rastreia na transação

        using var servicoNFe = new ServicosNFe(cfgServico, certificado);

        try
        {
            nfe.Assina();
            nfe.Valida(); // Internamente valida o XML básico

            var loteId = new Random().Next(1000, 99999);
            var retornoEnvio = servicoNFe.NFeAutorizacao(loteId, IndicadorSincronizacao.Sincrono, new List<NFe.Classes.NFe> { nfe }, false);

            if (retornoEnvio.Retorno.protNFe == null || retornoEnvio.Retorno.cStat != 104) // 104 = Lote processado
            {
                // Rejeitada pela Sefaz
                fiscalDoc.MarkAsRejected(retornoEnvio.Retorno.xMotivo);

                // Se a rejeição for 108/109 (Serviço Paralisado), invalidamos o cache!
                if (retornoEnvio.Retorno.cStat == 108 || retornoEnvio.Retorno.cStat == 109)
                    _cache.Remove(cacheKey);

                await _db.SaveChangesAsync(ct);
                return Results.BadRequest(new { Message = $"NF-e Rejeitada: {retornoEnvio.Retorno.xMotivo}", Status = retornoEnvio.Retorno.cStat });
            }

            // 4. SUCESSO! Salva o XML e atualiza Status
            var nfeProc = new NFe.Classes.nfeProc { NFe = nfe, protNFe = retornoEnvio.Retorno.protNFe, versao = retornoEnvio.Retorno.versao };
            var xmlAutorizado = nfeProc.ObterXmlString();

            fiscalDoc.MarkAsAuthorized(nfeProc.protNFe.infProt.chNFe, nfeProc.protNFe.infProt.nProt, xmlAutorizado, nfeProc.protNFe.infProt.xMotivo);
            order.UpdateStatus(OutboundOrderStatus.Shipped);

            await _db.SaveChangesAsync(ct);

            // Neste ponto o Front-End recebe o ID do FiscalDoc para chamar a rota de PDF (Impressão)
            return Results.Ok(new
            {
                Message = "NF-e Emitida e Autorizada!",
                DocumentId = fiscalDoc.Id,
                ChaveAcesso = nfeProc.protNFe.infProt.chNFe
            });
        }
        catch (Exception ex)
        {
            // Ocorreu erro de Comunicação/Timeout no momento exato do disparo (Internet caiu, Sefaz Timeout)
            // Invalidamos o cache para o sistema fazer ping no status na próxima!
            _cache.Remove(cacheKey);
            return Results.Problem(statusCode: 500, title: "Falha de comunicação com a SEFAZ.", detail: ex.Message);
        }
    }
}

public static class NfeEmissionEndpoints
{
    public static void MapNfeEmissionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fiscal/nfe").WithTags("Fiscal").RequireAuthorization();

        // O IMemoryCache já está disponível nativamente no .NET 8/9 em AddMemoryCache() no Program.cs
        group.MapPost("/emit/{orderId:guid}", async (Guid orderId, [FromQuery] FiscalOperationType type, IMediator mediator) =>
            await mediator.Send(new EmitOutboundNfeCommand(orderId, type)))
            .RequirePermission(Identity.Constants.Permissions.Outbound.Manage);
    }
}