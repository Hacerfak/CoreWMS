using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using CoreWMS.Api.Infrastructure.Fiscal.Emissao;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using DFe.Classes.Flags;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NFe.Classes.Informacoes.Identificacao.Tipos;
using NFe.Classes.Servicos.Tipos;
using NFe.Servicos;
using NFe.Utils.NFe;

namespace CoreWMS.Api.Features.Outbound.Management;

public record ShipOutboundOrderCommand(
    Guid OrderId,
    FiscalOperationType? OverrideOperationType = null,
    string? CustomNaturezaOperacao = null,
    int? CustomIndFinal = null,
    int? CustomIndPres = null,
    string? CustomAdditionalNotes = null
) : IRequest<IResult>;

public class ShipOutboundOrderHandler : IRequestHandler<ShipOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;
    private readonly NfeBuilderService _builder;
    private readonly IZeusConfigurator _zeusConfigurator;

    public ShipOutboundOrderHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        KardexChannel kardex,
        NfeBuilderService builder,
        IZeusConfigurator zeusConfigurator)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
        _builder = builder;
        _zeusConfigurator = zeusConfigurator;
    }

    public async Task<IResult> Handle(ShipOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Carrega a Ordem de Saída
        var order = await _db.OutboundOrders
            .Include(o => o.Company)
            .Include(o => o.Customer)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Volumes).ThenInclude(v => v.PackagingType)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status != OutboundOrderStatus.ReadyToShip)
            return Results.BadRequest(new { Message = "O pedido precisa estar no status 'ReadyToShip' (conferência concluída na doca) para ser expedido." });

        // 2. Valida Certificado A1 da Empresa
        var company = order.Company;
        if (company.CertificateBytes == null || company.CertificateBytes.Length == 0)
            return Results.BadRequest(new { Message = "A empresa não possui um Certificado Digital A1 cadastrado para emissão de NF-e." });

        // 3. Define o Tipo de Operação Fiscal e o Registro de Documento Fiscal
        var operationType = request.OverrideOperationType ?? (order.IsReturnToCustomer
            ? FiscalOperationType.OutboundReturnNormal
            : FiscalOperationType.OutboundShipment);

        var fiscalDocType = operationType == FiscalOperationType.OutboundShipment
            ? FiscalDocumentType.NfeShipment
            : FiscalDocumentType.NfeReturn;

        var fiscalDoc = new OutboundFiscalDocument(order.Id, fiscalDocType);
        _db.Set<OutboundFiscalDocument>().Add(fiscalDoc);

        // 4. Configura Zeus DFe (Thread-Safe e Multi-Tenant)
        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;
        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);

        // 5. Monta o XML da NF-e
        NFe.Classes.NFe nfe;
        try
        {
            nfe = await _builder.BuildOutboundNfeAsync(order.Id, operationType, ct);

            // Aplica os parâmetros customizados pelo usuário na tela de revisão
            if (!string.IsNullOrWhiteSpace(request.CustomNaturezaOperacao))
            {
                nfe.infNFe.ide.natOp = request.CustomNaturezaOperacao.Trim();
            }

            if (request.CustomIndFinal.HasValue)
            {
                nfe.infNFe.ide.indFinal = (ConsumidorFinal)request.CustomIndFinal.Value;
            }

            if (request.CustomIndPres.HasValue)
            {
                nfe.infNFe.ide.indPres = (PresencaComprador)request.CustomIndPres.Value;
            }

            if (!string.IsNullOrWhiteSpace(request.CustomAdditionalNotes))
            {
                nfe.infNFe.infAdic = nfe.infNFe.infAdic ?? new NFe.Classes.Informacoes.Observacoes.infAdic();
                nfe.infNFe.infAdic.infCpl = request.CustomAdditionalNotes.Trim();
            }

            // Assina utilizando diretamente a configuração do Zeus
            nfe.Assina(cfgServico);
            nfe.Valida(cfgServico);
        }
        catch (Exception ex)
        {
            fiscalDoc.MarkAsRejected($"Erro ao construir/validar o XML da NF-e: {ex.Message}");
            await _db.SaveChangesAsync(ct);
            return Results.BadRequest(new { Message = $"Falha ao montar o XML da NF-e: {ex.Message}" });
        }

        // 6. Transmissão Síncrona para a SEFAZ
        using var servicoNFe = new ServicosNFe(cfgServico);
        var loteId = new Random().Next(1000, 99999);
        var retornoEnvio = servicoNFe.NFeAutorizacao(loteId, IndicadorSincronizacao.Sincrono, new List<NFe.Classes.NFe> { nfe }, false);

        var prot = retornoEnvio?.Retorno?.protNFe?.infProt;

        if (retornoEnvio?.Retorno?.protNFe == null || (prot?.cStat != 100 && prot?.cStat != 150))
        {
            string motivoRejeicao = prot?.xMotivo ?? retornoEnvio?.Retorno?.xMotivo ?? "Erro desconhecido de autorização SEFAZ.";
            fiscalDoc.MarkAsRejected($"[Rejeição SEFAZ {prot?.cStat ?? retornoEnvio?.Retorno?.cStat}]: {motivoRejeicao}");
            await _db.SaveChangesAsync(ct);

            return Results.BadRequest(new
            {
                Code = "SEFAZ_REJECTION",
                Message = $"NF-e Rejeitada pela SEFAZ: {motivoRejeicao}",
                FiscalDocumentId = fiscalDoc.Id
            });
        }

        // 7. SEFAZ AUTORIZOU (cStat 100/150) -> EFETIVA GRAVAÇÃO E CONSUMO DO ESTOQUE
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

        // A) Consumo das HUs separadas
        var allocations = await _db.OutboundAllocations
            .Include(a => a.HandlingUnit)
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .ToListAsync(ct);

        foreach (var alloc in allocations)
        {
            var hu = alloc.HandlingUnit;
            hu.Consume(alloc.Quantity);

            // B) Atualiza saldo no InventoryBalance
            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == hu.ProductId && b.CustomerId == order.CustomerId, ct);

            if (balance != null)
            {
                balance.ShipAllocated(alloc.Quantity);
            }

            // C) Lançamento no Kardex
            await _kardex.WriteAsync(new InventoryTransaction(
                companyId,
                order.CustomerId,
                hu.ProductId,
                hu.Id,
                order.DockLocationId,
                TransactionType.Outbound_FullPallet,
                -alloc.Quantity,
                hu.CurrentQuantity,
                order.Id,
                $"EXPEDIÇÃO NF-E {nNfEmitida} (CHAVE: {chNfe[..10]}...)"
            ), ct);
        }

        // D) Mutação de domínio na ordem (DDD puro)
        order.SetInvoiceDetails(nNfEmitida.ToString(), nfe.infNFe.ide.serie.ToString(), chNfe);
        order.UpdateStatus(OutboundOrderStatus.Shipped);

        // Incrementar o sequencial de notas da empresa
        company.UpdateNfeAndTransportDetails(company.NfeSerie, company.NfeNextNumber + 1, company.Rntrc);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao expedir o pedido. O estoque já foi atualizado." });
        }

        return Results.Ok(new
        {
            Message = $"NF-e Nº {nNfEmitida} Autorizada com Sucesso pela SEFAZ!",
            Protocol = nProt,
            AccessKey = chNfe,
            InvoiceNumber = nNfEmitida.ToString(),
            OrderStatus = order.Status.ToString(),
            FiscalDocumentId = fiscalDoc.Id
        });
    }
}

public static class ShipOutboundOrderEndpoints
{
    public static void MapShipOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/{orderId:guid}/ship",
            async (Guid orderId, ShipOutboundOrderCommand? cmd, IMediator mediator) =>
            {
                var command = (cmd ?? new ShipOutboundOrderCommand(orderId)) with { OrderId = orderId };
                return await mediator.Send(command);
            })
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}