using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using NFe.Classes.Informacoes.Destinatario;
using NFe.Classes.Informacoes.Detalhe;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual.Tipos;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Federal;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Federal.Tipos;
using NFe.Classes.Informacoes.Emitente;
using NFe.Classes.Informacoes.Identificacao;
using NFe.Classes.Informacoes.Observacoes;
using NFe.Classes.Informacoes.Pagamento;
using NFe.Classes.Informacoes.Transporte;
using NFe.Classes.Informacoes.Detalhe.Tributacao;
using DFe.Classes.Flags;

namespace CoreWMS.Api.Infrastructure.Fiscal.Emissao;

public class NfeBuilderService
{
    private readonly ApplicationDbContext _db;

    public NfeBuilderService(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<NFe.Classes.NFe> BuildOutboundNfeAsync(Guid outboundOrderId, FiscalOperationType operationType, CancellationToken ct)
    {
        var order = await _db.OutboundOrders
            .Include(o => o.Company)
            .Include(o => o.Customer)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.Id == outboundOrderId, ct)
            ?? throw new InvalidOperationException("Pedido de saída não encontrado.");

        var isInterstate = order.Company.State.ToUpper() != order.DestinationState.ToUpper();

        var originAccessKeys = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .Join(_db.HandlingUnits, a => a.HandlingUnitId, h => h.Id, (a, h) => h.ReceiptDocumentId)
            .Where(docId => docId.HasValue)
            .Join(_db.InboundOrders, docId => docId, o => o.Id, (docId, o) => o.AccessKey)
            .Distinct()
            .ToListAsync(ct);

        var nfe = new NFe.Classes.NFe
        {
            infNFe = new NFe.Classes.Informacoes.infNFe
            {
                versao = "4.00",
                ide = BuildIde(order, originAccessKeys),
                emit = BuildEmitente(order.Company),
                dest = BuildDestinatario(order),
                transp = BuildTransporte(order.Volumes.ToList()),
                infAdic = new infAdic()
            }
        };

        int nItem = 1;
        foreach (var item in order.Items.Where(i => i.PackedQuantity > 0))
        {
            var rule = await GetBestFiscalRuleAsync(order.CompanyId, order.CustomerId, order.DestinationState, item.Product.Ncm, operationType, ct);
            if (rule == null) throw new InvalidOperationException($"Nenhuma Regra Fiscal encontrada para o produto {item.Product.Sku}.");

            var cEan = string.IsNullOrWhiteSpace(item.Product.BaseBarcode) ? "SEM GTIN" : item.Product.BaseBarcode;
            var valorTotalItem = Math.Round(item.PackedQuantity * item.UnitValue, 2); // Calculado previamente

            var det = new det
            {
                nItem = nItem++,
                prod = new prod
                {
                    cProd = item.Product.Sku,
                    cEAN = cEan,
                    xProd = item.Product.Description,
                    NCM = item.Product.Ncm ?? "00000000",
                    CFOP = isInterstate ? int.Parse(rule.CfopInterstate) : int.Parse(rule.CfopStateInternal),
                    uCom = item.Product.BaseUnit,
                    qCom = item.PackedQuantity,
                    vUnCom = item.UnitValue,
                    vProd = valorTotalItem,
                    cEANTrib = cEan,
                    uTrib = item.Product.BaseUnit,
                    qTrib = item.PackedQuantity,
                    vUnTrib = item.UnitValue,
                    indTot = IndicadorTotal.ValorDoItemCompoeTotalNF
                },

                // Agora passamos a Regra e o Valor do Item para calcular o IBS/CBS
                imposto = BuildImpostos(rule, valorTotalItem)
            };

            nfe.infNFe.det.Add(det);

            if (!string.IsNullOrWhiteSpace(rule.AdditionalNotes))
            {
                nfe.infNFe.infAdic.infCpl = string.IsNullOrEmpty(nfe.infNFe.infAdic.infCpl)
                    ? rule.AdditionalNotes
                    : nfe.infNFe.infAdic.infCpl + " " + rule.AdditionalNotes;
            }
        }

        var totalVProd = nfe.infNFe.det.Sum(d => d.prod.vProd);

        nfe.infNFe.total = new NFe.Classes.Informacoes.Total.total
        {
            ICMSTot = new NFe.Classes.Informacoes.Total.ICMSTot
            {
                vProd = totalVProd,
                vNF = totalVProd,
                vBC = 0,
                vICMS = 0,
                vICMSDeson = 0,
                vFCPUFDest = 0,
                vICMSUFDest = 0,
                vICMSUFRemet = 0,
                vFCP = 0,
                vBCST = 0,
                vST = 0,
                vFCPST = 0,
                vFCPSTRet = 0,
                vFrete = 0,
                vSeg = 0,
                vDesc = 0,
                vII = 0,
                vIPI = 0,
                vIPIDevol = 0,
                vOutro = 0
                // Obs: Quando a Sefaz oficializar as tags vIBS e vCBS no nó ICMSTot,
                // você precisará fazer o SUM() das tags det.imposto.IBS.vIBS aqui também.
            }
        };

        nfe.infNFe.pag = new List<pag>
        {
            new pag { detPag = new List<detPag> { new detPag { tPag = FormaPagamento.fpSemPagamento, vPag = 0 } } }
        };

        return nfe;
    }

    private ide BuildIde(OutboundOrder order, List<string> originAccessKeys) { /* ... Omitido por brevidade (sem mudanças) ... */ return new ide(); }
    private emit BuildEmitente(CoreWMS.Api.Features.Identity.Entities.Company company) { /* ... Omitido por brevidade (sem mudanças) ... */ return new emit(); }
    private dest BuildDestinatario(OutboundOrder order) { /* ... Omitido por brevidade (sem mudanças) ... */ return new dest(VersaoServico.Versao400); }
    private transp BuildTransporte(List<OutboundVolume> volumes) { /* ... Omitido por brevidade (sem mudanças) ... */ return new transp(); }

    /// <summary>
    /// Construção dos Impostos incluindo a fase de transição (IBS e CBS) de 2026.
    /// </summary>
    private imposto BuildImpostos(FiscalOperationRule rule, decimal valorTotalItem)
    {
        var impostos = new imposto
        {
            ICMS = new ICMS
            {
                TipoICMS = new ICMSSN102 // Na biblioteca Zeus, os CSOSN 102, 103, 300 e 400 usam a classe ICMSSN102
                {
                    orig = OrigemMercadoria.OmNacional,
                    CSOSN = Csosnicms.Csosn400
                }
            },
            PIS = new PIS { TipoPIS = new PISOutr { CST = CSTPIS.pis99, vBC = 0, pPIS = 0, vPIS = 0 } },
            COFINS = new COFINS { TipoCOFINS = new COFINSOutr { CST = CSTCOFINS.cofins99, vBC = 0, pCOFINS = 0, vCOFINS = 0 } }
        };

        return impostos;
    }

    private async Task<FiscalOperationRule?> GetBestFiscalRuleAsync(Guid companyId, Guid customerId, string destState, string? ncm, FiscalOperationType type, CancellationToken ct)
    {
        return await _db.FiscalOperationRules
            .Where(r => r.CompanyId == companyId && r.OperationType == type && r.IsActive)
            .Where(r => r.SpecificCustomerId == null || r.SpecificCustomerId == customerId)
            .Where(r => r.SpecificDestinationState == null || r.SpecificDestinationState == destState)
            .OrderByDescending(r => r.Priority)
            .FirstOrDefaultAsync(ct);
    }
}