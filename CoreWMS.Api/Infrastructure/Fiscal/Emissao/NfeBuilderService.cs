using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using DFe.Classes.Flags;
using NFe.Classes.Informacoes;
using NFe.Classes.Informacoes.Destinatario;
using NFe.Classes.Informacoes.Detalhe;
using NFe.Classes.Informacoes.Detalhe.Tributacao;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual.Tipos;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Federal;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Federal.Tipos;
using NFe.Classes.Informacoes.Emitente;
using NFe.Classes.Informacoes.Identificacao;
using NFe.Classes.Informacoes.Identificacao.Tipos;
using NFe.Classes.Informacoes.Pagamento;
using NFe.Classes.Informacoes.Total;
using NFe.Classes.Informacoes.Transporte;
using System.Text.RegularExpressions;

namespace CoreWMS.Api.Infrastructure.Fiscal.Emissao;

public record StandaloneNfeItemInput(
    Guid ProductId,
    decimal Quantity,
    decimal UnitValue
);

public record StandaloneNfeInput(
    Guid CompanyId,
    Guid FiscalRuleId,
    string DestinationName,
    string DestinationCnpjCpf,
    string? DestinationStateRegistration,
    int DestinationIeIndicator,
    string DestinationStreet,
    string DestinationNumber,
    string? DestinationComplement,
    string DestinationNeighborhood,
    int DestinationCityCode,
    string DestinationCity,
    string DestinationState,
    string DestinationZipCode,
    int? IndFinal,
    int? IndPres,
    int? TpImp,
    string? AdditionalNotes,
    List<StandaloneNfeItemInput> Items
);

public class NfeBuilderService
{
    private readonly ApplicationDbContext _db;

    public NfeBuilderService(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<(NFe.Classes.NFe Nfe, FiscalOperationRule Rule)> BuildOutboundNfeAsync(Guid outboundOrderId, Guid fiscalRuleId, CancellationToken ct)
    {
        var order = await _db.OutboundOrders
            .AsNoTracking()
            .Include(o => o.Company)
            .Include(o => o.Customer)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.Id == outboundOrderId, ct)
            ?? throw new InvalidOperationException("Pedido de saída não encontrado.");

        if (order.Company == null)
            throw new InvalidOperationException("A empresa emitente não está vinculada a este pedido.");

        var rule = await _db.FiscalOperationRules
            .AsNoTracking()
            .Include(r => r.Exceptions.Where(e => e.IsActive))
            .FirstOrDefaultAsync(r => r.Id == fiscalRuleId && r.CompanyId == order.CompanyId && r.IsActive, ct)
            ?? throw new InvalidOperationException("A Natureza de Operação selecionada não foi encontrada ou está inativa.");

        var destState = !string.IsNullOrWhiteSpace(order.DestinationState)
            ? order.DestinationState.Trim().ToUpper()
            : (order.Customer?.State?.Trim().ToUpper() ?? "EX");

        var companyState = !string.IsNullOrWhiteSpace(order.Company.State)
            ? order.Company.State.Trim().ToUpper()
            : "RS";

        var isInterstate = companyState != destState;

        var originAccessKeys = await _db.OutboundAllocations
            .AsNoTracking()
            .Where(a => a.OutboundOrderId == order.Id && a.IsPicked)
            .Join(_db.HandlingUnits.AsNoTracking().Where(h => h.CompanyId == order.CompanyId),
                a => a.HandlingUnitId, h => h.Id, (a, h) => h.ReceiptDocumentId)
            .Where(docId => docId.HasValue)
            .Join(_db.InboundOrders.AsNoTracking(),
                docId => docId, o => o.Id, (docId, o) => o.AccessKey)
            .Distinct()
            .ToListAsync(ct);

        var nfe = new NFe.Classes.NFe
        {
            infNFe = new infNFe { versao = "4.00" }
        };

        nfe.infNFe.ide = BuildIdeOutbound(order, originAccessKeys, destState, rule.Description, rule.Finalidade);
        nfe.infNFe.emit = BuildEmitente(order.Company);
        nfe.infNFe.dest = BuildDestinatario(order);
        nfe.infNFe.transp = BuildTransporte(order, order.Volumes?.ToList() ?? new List<OutboundVolume>());

        if (!string.IsNullOrWhiteSpace(order.AdditionalNotes))
        {
            nfe.infNFe.infAdic = new NFe.Classes.Informacoes.Observacoes.infAdic { infCpl = order.AdditionalNotes.Trim() };
        }

        nfe.infNFe.det = new List<det>();
        int nItem = 1;
        var packedItems = order.Items.Where(i => i.PackedQuantity > 0).ToList();

        if (!packedItems.Any())
            throw new InvalidOperationException("Nenhum item empacotado/separado foi encontrado para este pedido de saída.");

        CRT companyCrt = ObterCrtEmpresa(order.Company.Crt);

        foreach (var item in packedItems)
        {
            if (item.Product == null)
                throw new InvalidOperationException($"Produto não encontrado para o item SKU {item.SkuCode}.");

            var ncm = string.IsNullOrWhiteSpace(item.Product.Ncm) ? "00000000" : Regex.Replace(item.Product.Ncm, @"\D", "");
            var cest = ObterCestProduto(item.Product);
            var origem = ObterOrigemProduto(item.Product);
            var cEan = string.IsNullOrWhiteSpace(item.Product.BaseBarcode) ? "SEM GTIN" : item.Product.BaseBarcode.Trim();
            var valorTotalItem = Math.Round(item.PackedQuantity * item.UnitValue, 2);

            var taxParams = ResolverParametrosItem(rule, destState, ncm, origem);
            var cfopStr = isInterstate ? taxParams.CfopInterstate : taxParams.CfopStateInternal;

            var det = new det
            {
                nItem = nItem++,
                prod = new prod
                {
                    cProd = item.Product.Sku,
                    cEAN = cEan,
                    xProd = item.Product.Description,
                    NCM = ncm,
                    CEST = cest,
                    CFOP = int.Parse(cfopStr),
                    uCom = item.Product.BaseUnit ?? "UN",
                    qCom = item.PackedQuantity,
                    vUnCom = item.UnitValue,
                    vProd = valorTotalItem,
                    cEANTrib = cEan,
                    uTrib = item.Product.BaseUnit ?? "UN",
                    qTrib = item.PackedQuantity,
                    vUnTrib = item.UnitValue,
                    indTot = IndicadorTotal.ValorDoItemCompoeTotalNF
                },
                imposto = BuildImpostos(taxParams, valorTotalItem, companyCrt, origem)
            };

            nfe.infNFe.det.Add(det);

            if (!string.IsNullOrWhiteSpace(taxParams.AdditionalNotes))
            {
                nfe.infNFe.infAdic ??= new NFe.Classes.Informacoes.Observacoes.infAdic();
                nfe.infNFe.infAdic.infCpl = string.IsNullOrEmpty(nfe.infNFe.infAdic.infCpl)
                    ? taxParams.AdditionalNotes
                    : nfe.infNFe.infAdic.infCpl + " " + taxParams.AdditionalNotes;
            }
        }

        CalcularTotaisNfe(nfe);
        ConfigurarPagamentoERespTec(nfe);

        return (nfe, rule);
    }

    public async Task<(NFe.Classes.NFe Nfe, FiscalOperationRule Rule)> BuildStandaloneNfeAsync(StandaloneNfeInput input, CancellationToken ct)
    {
        var company = await _db.Companies
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == input.CompanyId, ct)
            ?? throw new InvalidOperationException("Empresa emitente não encontrada.");

        var rule = await _db.FiscalOperationRules
            .AsNoTracking()
            .Include(r => r.Exceptions.Where(e => e.IsActive))
            .FirstOrDefaultAsync(r => r.Id == input.FiscalRuleId && r.CompanyId == input.CompanyId && r.IsActive, ct)
            ?? throw new InvalidOperationException("A Natureza de Operação selecionada não foi encontrada ou está inativa.");

        var destState = input.DestinationState.Trim().ToUpper();
        var companyState = !string.IsNullOrWhiteSpace(company.State) ? company.State.Trim().ToUpper() : "RS";
        var isInterstate = companyState != destState;

        var productIds = input.Items.Select(i => i.ProductId).Distinct().ToList();
        var products = await _db.Products
            .AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);

        var nfe = new NFe.Classes.NFe
        {
            infNFe = new infNFe { versao = "4.00" }
        };

        nfe.infNFe.ide = BuildIdeStandalone(company, input, destState, isInterstate, rule.Description, rule.Finalidade);
        nfe.infNFe.emit = BuildEmitente(company);
        nfe.infNFe.dest = BuildDestinatarioStandalone(company, input);
        nfe.infNFe.transp = new transp { modFrete = ModalidadeFrete.mfSemFrete };

        if (!string.IsNullOrWhiteSpace(input.AdditionalNotes))
        {
            nfe.infNFe.infAdic = new NFe.Classes.Informacoes.Observacoes.infAdic { infCpl = input.AdditionalNotes.Trim() };
        }

        nfe.infNFe.det = new List<det>();
        int nItem = 1;
        CRT companyCrt = ObterCrtEmpresa(company.Crt);

        foreach (var item in input.Items)
        {
            if (!products.TryGetValue(item.ProductId, out var prod))
                throw new InvalidOperationException($"Produto ID {item.ProductId} não encontrado para emissão avulsa.");

            var ncm = string.IsNullOrWhiteSpace(prod.Ncm) ? "00000000" : Regex.Replace(prod.Ncm, @"\D", "");
            var cest = ObterCestProduto(prod);
            var origem = ObterOrigemProduto(prod);
            var cEan = string.IsNullOrWhiteSpace(prod.BaseBarcode) ? "SEM GTIN" : prod.BaseBarcode.Trim();
            var valorTotalItem = Math.Round(item.Quantity * item.UnitValue, 2);

            var taxParams = ResolverParametrosItem(rule, destState, ncm, origem);
            var cfopStr = isInterstate ? taxParams.CfopInterstate : taxParams.CfopStateInternal;

            var det = new det
            {
                nItem = nItem++,
                prod = new prod
                {
                    cProd = prod.Sku,
                    cEAN = cEan,
                    xProd = prod.Description,
                    NCM = ncm,
                    CEST = cest,
                    CFOP = int.Parse(cfopStr),
                    uCom = prod.BaseUnit ?? "UN",
                    qCom = item.Quantity,
                    vUnCom = item.UnitValue,
                    vProd = valorTotalItem,
                    cEANTrib = cEan,
                    uTrib = prod.BaseUnit ?? "UN",
                    qTrib = item.Quantity,
                    vUnTrib = item.UnitValue,
                    indTot = IndicadorTotal.ValorDoItemCompoeTotalNF
                },
                imposto = BuildImpostos(taxParams, valorTotalItem, companyCrt, origem)
            };

            nfe.infNFe.det.Add(det);

            if (!string.IsNullOrWhiteSpace(taxParams.AdditionalNotes))
            {
                nfe.infNFe.infAdic ??= new NFe.Classes.Informacoes.Observacoes.infAdic();
                nfe.infNFe.infAdic.infCpl = string.IsNullOrEmpty(nfe.infNFe.infAdic.infCpl)
                    ? taxParams.AdditionalNotes
                    : nfe.infNFe.infAdic.infCpl + " " + taxParams.AdditionalNotes;
            }
        }

        CalcularTotaisNfe(nfe);
        ConfigurarPagamentoERespTec(nfe);

        return (nfe, rule);
    }

    private static void CalcularTotaisNfe(NFe.Classes.NFe nfe)
    {
        var totalVProd = nfe.infNFe.det.Sum(d => d.prod.vProd);
        decimal totalVBC = 0m;
        decimal totalVICMS = 0m;
        decimal totalVBCST = 0m;
        decimal totalVST = 0m;
        decimal totalVIPI = 0m;

        foreach (var det in nfe.infNFe.det)
        {
            if (det.imposto?.ICMS?.TipoICMS is ICMS00 icms00)
            {
                totalVBC += icms00.vBC;
                totalVICMS += icms00.vICMS;
            }
            else if (det.imposto?.ICMS?.TipoICMS is ICMS20 icms20)
            {
                totalVBC += icms20.vBC;
                totalVICMS += icms20.vICMS;
            }
            else if (det.imposto?.ICMS?.TipoICMS is ICMS10 icms10)
            {
                totalVBC += icms10.vBC;
                totalVICMS += icms10.vICMS;
                totalVBCST += icms10.vBCST;
                totalVST += icms10.vICMSST;
            }

            if (det.imposto?.IPI?.TipoIPI is IPITrib ipiTrib)
            {
                totalVIPI += ipiTrib.vIPI ?? 0m;
            }
        }

        var totalVNF = Math.Round(totalVProd + totalVST + totalVIPI, 2);

        var temReformaTributaria = nfe.infNFe.det.Any(d => d.imposto?.IBSCBS != null);
        var totalVBCIbsCbs = temReformaTributaria ? nfe.infNFe.det.Where(d => d.imposto?.IBSCBS != null).Sum(d => d.imposto.IBSCBS.gIBSCBS.vBC) : 0m;
        var totalVIbs = temReformaTributaria ? nfe.infNFe.det.Where(d => d.imposto?.IBSCBS != null).Sum(d => d.imposto.IBSCBS.gIBSCBS.gIBSUF.vIBSUF) : 0m;
        var totalVCbs = temReformaTributaria ? nfe.infNFe.det.Where(d => d.imposto?.IBSCBS != null).Sum(d => d.imposto.IBSCBS.gIBSCBS.gCBS.vCBS) : 0m;

        nfe.infNFe.total = new total
        {
            ICMSTot = new ICMSTot
            {
                vProd = totalVProd,
                vNF = totalVNF,
                vBC = Math.Round(totalVBC, 2),
                vICMS = Math.Round(totalVICMS, 2),
                vICMSDeson = 0,
                vFCPUFDest = 0,
                vICMSUFDest = 0,
                vICMSUFRemet = 0,
                vFCP = 0,
                vBCST = Math.Round(totalVBCST, 2),
                vST = Math.Round(totalVST, 2),
                vFCPST = 0,
                vFCPSTRet = 0,
                vFrete = 0,
                vSeg = 0,
                vDesc = 0,
                vII = 0,
                vIPI = Math.Round(totalVIPI, 2),
                vIPIDevol = 0,
                vOutro = 0,
                vTotTrib = 0
            },
            IBSCBSTot = temReformaTributaria ? new IBSCBSTot
            {
                vBCIBSCBS = totalVBCIbsCbs,
                gIBS = new gIBSTotal
                {
                    gIBSUF = new gIBSUFTotal { vDif = 0, vDevTrib = 0, vIBSUF = totalVIbs },
                    gIBSMun = new gIBSMunTotal { vDif = 0, vDevTrib = 0, vIBSMun = 0 },
                    vIBS = totalVIbs,
                    vCredPres = 0,
                    vCredPresCondSus = 0
                },
                gCBS = new gCBSTotal
                {
                    vDif = 0,
                    vDevTrib = 0,
                    vCBS = totalVCbs,
                    vCredPres = 0,
                    vCredPresCondSus = 0
                }
            } : null
        };
    }

    private static void ConfigurarPagamentoERespTec(NFe.Classes.NFe nfe)
    {
        nfe.infNFe.pag = new List<pag>
        {
            new pag
            {
                detPag = new List<detPag> { new detPag { tPag = FormaPagamento.fpSemPagamento, vPag = 0 } }
            }
        };

        nfe.infNFe.infRespTec = new Shared.NFe.Classes.Informacoes.InfRespTec.infRespTec
        {
            CNPJ = "64615275000112",
            xContato = "CoreWMS - Eder Gross Cichelero",
            email = "suporte@corewms.com.br",
            fone = "54992221877"
        };
    }

    private ResolvedTaxParams ResolverParametrosItem(FiscalOperationRule baseRule, string destState, string ncm, OrigemMercadoria origem)
    {
        var matchedException = baseRule.Exceptions?
            .Where(e => e.IsActive)
            .Where(e => string.IsNullOrWhiteSpace(e.SpecificDestinationState) || e.SpecificDestinationState == destState)
            .Where(e => string.IsNullOrWhiteSpace(e.SpecificNcmStart) || ncm.StartsWith(e.SpecificNcmStart))
            .Where(e => !e.SpecificOrigin.HasValue || e.SpecificOrigin.Value == (int)origem)
            .OrderByDescending(e =>
                (!string.IsNullOrWhiteSpace(e.SpecificNcmStart) ? 4 : 0) +
                (!string.IsNullOrWhiteSpace(e.SpecificDestinationState) ? 2 : 0) +
                (e.SpecificOrigin.HasValue ? 1 : 0))
            .FirstOrDefault();

        return new ResolvedTaxParams
        {
            CfopStateInternal = matchedException?.CfopStateInternal ?? baseRule.CfopStateInternal,
            CfopInterstate = matchedException?.CfopInterstate ?? baseRule.CfopInterstate,
            CstCsosnIcms = matchedException?.CstCsosnIcms ?? baseRule.CstCsosnIcms,
            ModBcIcms = matchedException?.ModBcIcms ?? baseRule.ModBcIcms,
            AliqIcms = matchedException?.AliqIcms ?? baseRule.AliqIcms,
            ReducaoBcIcms = matchedException?.ReducaoBcIcms ?? baseRule.ReducaoBcIcms,
            ModBcIcmsSt = matchedException?.ModBcIcmsSt ?? baseRule.ModBcIcmsSt,
            MvaIcmsSt = matchedException?.MvaIcmsSt ?? baseRule.MvaIcmsSt,
            ReducaoBcIcmsSt = matchedException?.ReducaoBcIcmsSt ?? baseRule.ReducaoBcIcmsSt,
            AliqIcmsSt = matchedException?.AliqIcmsSt ?? baseRule.AliqIcmsSt,
            MotivoDesoneracaoIcms = matchedException?.MotivoDesoneracaoIcms ?? baseRule.MotivoDesoneracaoIcms,
            AliqCreditoSimples = matchedException?.AliqCreditoSimples ?? baseRule.AliqCreditoSimples,
            CstIpi = matchedException?.CstIpi ?? baseRule.CstIpi,
            CodigoEnquadramentoIpi = matchedException?.CodigoEnquadramentoIpi ?? baseRule.CodigoEnquadramentoIpi,
            AliqIpi = matchedException?.AliqIpi ?? baseRule.AliqIpi,
            CstPis = matchedException?.CstPis ?? baseRule.CstPis,
            AliqPis = matchedException?.AliqPis ?? baseRule.AliqPis,
            CstCofins = matchedException?.CstCofins ?? baseRule.CstCofins,
            AliqCofins = matchedException?.AliqCofins ?? baseRule.AliqCofins,
            CstIbs = matchedException?.CstIbs ?? baseRule.CstIbs,
            AliqIbs = matchedException?.AliqIbs ?? baseRule.AliqIbs,
            CstCbs = matchedException?.CstCbs ?? baseRule.CstCbs,
            AliqCbs = matchedException?.AliqCbs ?? baseRule.AliqCbs,
            ClassificacaoTributaria = matchedException?.ClassificacaoTributaria ?? baseRule.ClassificacaoTributaria,
            AdditionalNotes = matchedException?.AdditionalNotes ?? baseRule.AdditionalNotes
        };
    }

    private imposto BuildImpostos(ResolvedTaxParams p, decimal valorTotalItem, CRT companyCrt, OrigemMercadoria origem)
    {
        var impostos = new imposto
        {
            ICMS = BuildIcms(p, valorTotalItem, companyCrt, origem),
            IPI = BuildIpi(p, valorTotalItem),
            PIS = BuildPis(p, valorTotalItem),
            COFINS = BuildCofins(p, valorTotalItem)
        };

        if (!string.IsNullOrEmpty(p.CstIbs) || !string.IsNullOrEmpty(p.CstCbs))
        {
            var rawIbs = Regex.Replace(p.CstIbs ?? "410", @"\D", "").PadLeft(3, '0');
            if (!Enum.TryParse<CSTIBSCBS>("cst" + rawIbs, true, out var parsedCst))
            {
                parsedCst = CSTIBSCBS.cst410;
            }

            var aliqIbs = p.AliqIbs > 0 ? p.AliqIbs : 0.10m;
            var aliqCbs = p.AliqCbs > 0 ? p.AliqCbs : 0.90m;
            var vIbsUf = Math.Round(valorTotalItem * (aliqIbs / 100m), 2);
            var vCbs = Math.Round(valorTotalItem * (aliqCbs / 100m), 2);

            string cClassTrib = !string.IsNullOrWhiteSpace(p.ClassificacaoTributaria)
                ? p.ClassificacaoTributaria.Trim()
                : (rawIbs == "000" ? "000001" : "410999");

            impostos.IBSCBS = new IBSCBS
            {
                CST = parsedCst,
                cClassTrib = cClassTrib,
                gIBSCBS = new gIBSCBS
                {
                    vBC = valorTotalItem,
                    gIBSUF = new gIBSUF { pIBSUF = aliqIbs, vIBSUF = vIbsUf },
                    gIBSMun = new gIBSMun { pIBSMun = 0, vIBSMun = 0 },
                    gCBS = new gCBS { pCBS = aliqCbs, vCBS = vCbs },
                    vIBS = vIbsUf
                }
            };
        }

        return impostos;
    }

    private ICMS BuildIcms(ResolvedTaxParams p, decimal valorTotalItem, CRT companyCrt, OrigemMercadoria origem)
    {
        string rawCst = Regex.Replace(p.CstCsosnIcms ?? "400", @"\D", "").Trim();
        bool isSimplesNacional = companyCrt == CRT.SimplesNacional || companyCrt == CRT.SimplesNacionalMei;
        var modBcEnum = (DeterminacaoBaseIcms)p.ModBcIcms;

        if (isSimplesNacional || rawCst.Length == 3)
        {
            string csosnCode = rawCst.PadLeft(3, '0');

            if (csosnCode == "101")
            {
                var vCred = Math.Round(valorTotalItem * (p.AliqCreditoSimples / 100m), 2);
                return new ICMS
                {
                    TipoICMS = new ICMSSN101
                    {
                        orig = origem,
                        CSOSN = Csosnicms.Csosn101,
                        pCredSN = p.AliqCreditoSimples,
                        vCredICMSSN = vCred
                    }
                };
            }

            if (csosnCode == "500")
            {
                return new ICMS { TipoICMS = new ICMSSN500 { orig = origem, CSOSN = Csosnicms.Csosn500 } };
            }

            Csosnicms csosnEnum = csosnCode switch
            {
                "103" => Csosnicms.Csosn103,
                "300" => Csosnicms.Csosn300,
                "400" => Csosnicms.Csosn400,
                _ => Csosnicms.Csosn102
            };

            return new ICMS { TipoICMS = new ICMSSN102 { orig = origem, CSOSN = csosnEnum } };
        }

        string cst2Dig = rawCst.PadLeft(2, '0');

        if (cst2Dig == "00")
        {
            var vIcms = Math.Round(valorTotalItem * (p.AliqIcms / 100m), 2);
            return new ICMS
            {
                TipoICMS = new ICMS00
                {
                    orig = origem,
                    CST = Csticms.Cst00,
                    modBC = modBcEnum,
                    vBC = valorTotalItem,
                    pICMS = p.AliqIcms,
                    vICMS = vIcms
                }
            };
        }

        if (cst2Dig == "20")
        {
            var vBcRed = Math.Round(valorTotalItem * (1 - (p.ReducaoBcIcms / 100m)), 2);
            var vIcms = Math.Round(vBcRed * (p.AliqIcms / 100m), 2);
            return new ICMS
            {
                TipoICMS = new ICMS20
                {
                    orig = origem,
                    CST = Csticms.Cst20,
                    modBC = modBcEnum,
                    pRedBC = p.ReducaoBcIcms,
                    vBC = vBcRed,
                    pICMS = p.AliqIcms,
                    vICMS = vIcms
                }
            };
        }

        if (cst2Dig is "40" or "41" or "50")
        {
            Csticms cstEnum = cst2Dig switch
            {
                "40" => Csticms.Cst40,
                "50" => Csticms.Cst50,
                _ => Csticms.Cst41
            };

            return new ICMS
            {
                TipoICMS = new ICMS40
                {
                    orig = origem,
                    CST = cstEnum,
                    motDesICMS = p.MotivoDesoneracaoIcms.HasValue && p.MotivoDesoneracaoIcms.Value > 0
                        ? (MotivoDesoneracaoIcms)p.MotivoDesoneracaoIcms.Value
                        : null
                }
            };
        }

        if (cst2Dig == "51")
        {
            return new ICMS { TipoICMS = new ICMS51 { orig = origem, CST = Csticms.Cst51, modBC = modBcEnum } };
        }

        if (cst2Dig == "60")
        {
            return new ICMS { TipoICMS = new ICMS60 { orig = origem, CST = Csticms.Cst60 } };
        }

        return new ICMS { TipoICMS = new ICMS90 { orig = origem, CST = Csticms.Cst90, modBC = modBcEnum } };
    }

    private IPI BuildIpi(ResolvedTaxParams p, decimal valorTotalItem)
    {
        string rawIpi = Regex.Replace(p.CstIpi ?? "53", @"\D", "").PadLeft(2, '0');
        int cEnq = p.CodigoEnquadramentoIpi > 0 ? p.CodigoEnquadramentoIpi : 999;

        if (!Enum.TryParse<CSTIPI>("ipi" + rawIpi, true, out var cstIpiEnum))
        {
            cstIpiEnum = CSTIPI.ipi53;
        }

        if (rawIpi is "00" or "49" or "50" or "99")
        {
            var vIpi = Math.Round(valorTotalItem * (p.AliqIpi / 100m), 2);
            return new IPI
            {
                cEnq = cEnq,
                TipoIPI = new IPITrib
                {
                    CST = cstIpiEnum,
                    vBC = valorTotalItem,
                    pIPI = p.AliqIpi,
                    vIPI = vIpi
                }
            };
        }

        return new IPI
        {
            cEnq = cEnq,
            TipoIPI = new IPINT { CST = cstIpiEnum }
        };
    }

    private PIS BuildPis(ResolvedTaxParams p, decimal valorTotalItem)
    {
        string cleanPis = Regex.Replace(p.CstPis ?? "08", @"\D", "").PadLeft(2, '0');

        if (!Enum.TryParse<CSTPIS>("pis" + cleanPis, true, out var cstPisEnum))
        {
            cstPisEnum = CSTPIS.pis08;
        }

        if (cleanPis is "01" or "02")
        {
            var vPis = Math.Round(valorTotalItem * (p.AliqPis / 100m), 2);
            return new PIS
            {
                TipoPIS = new PISAliq
                {
                    CST = cstPisEnum,
                    vBC = valorTotalItem,
                    pPIS = p.AliqPis,
                    vPIS = vPis
                }
            };
        }

        if (cleanPis is "04" or "05" or "06" or "07" or "08" or "09")
        {
            return new PIS { TipoPIS = new PISNT { CST = cstPisEnum } };
        }

        var vPisOutr = Math.Round(valorTotalItem * (p.AliqPis / 100m), 2);
        return new PIS
        {
            TipoPIS = new PISOutr
            {
                CST = cstPisEnum,
                vBC = valorTotalItem,
                pPIS = p.AliqPis,
                vPIS = vPisOutr
            }
        };
    }

    private COFINS BuildCofins(ResolvedTaxParams p, decimal valorTotalItem)
    {
        string cleanCofins = Regex.Replace(p.CstCofins ?? "08", @"\D", "").PadLeft(2, '0');

        if (!Enum.TryParse<CSTCOFINS>("cofins" + cleanCofins, true, out var cstCofinsEnum))
        {
            cstCofinsEnum = CSTCOFINS.cofins08;
        }

        if (cleanCofins is "01" or "02")
        {
            var vCofins = Math.Round(valorTotalItem * (p.AliqCofins / 100m), 2);
            return new COFINS
            {
                TipoCOFINS = new COFINSAliq
                {
                    CST = cstCofinsEnum,
                    vBC = valorTotalItem,
                    pCOFINS = p.AliqCofins,
                    vCOFINS = vCofins
                }
            };
        }

        if (cleanCofins is "04" or "05" or "06" or "07" or "08" or "09")
        {
            return new COFINS { TipoCOFINS = new COFINSNT { CST = cstCofinsEnum } };
        }

        var vCofinsOutr = Math.Round(valorTotalItem * (p.AliqCofins / 100m), 2);
        return new COFINS
        {
            TipoCOFINS = new COFINSOutr
            {
                CST = cstCofinsEnum,
                vBC = valorTotalItem,
                pCOFINS = p.AliqCofins,
                vCOFINS = vCofinsOutr
            }
        };
    }

    private static OrigemMercadoria ObterOrigemProduto(object product)
    {
        var prop = product.GetType().GetProperty("Origin") ?? product.GetType().GetProperty("Origem");
        if (prop != null)
        {
            var val = prop.GetValue(product);
            if (val is int intVal && Enum.IsDefined(typeof(OrigemMercadoria), intVal))
                return (OrigemMercadoria)intVal;
            if (val is OrigemMercadoria origEnum)
                return origEnum;
            if (val != null && int.TryParse(val.ToString(), out var parsedInt) && Enum.IsDefined(typeof(OrigemMercadoria), parsedInt))
                return (OrigemMercadoria)parsedInt;
        }
        return OrigemMercadoria.OmNacional;
    }

    private static string? ObterCestProduto(object product)
    {
        var prop = product.GetType().GetProperty("Cest") ?? product.GetType().GetProperty("CEST");
        if (prop != null)
        {
            var val = prop.GetValue(product)?.ToString();
            var digits = Regex.Replace(val ?? "", @"\D", "");
            if (digits.Length == 7) return digits;
        }
        return null;
    }

    private static CRT ObterCrtEmpresa(int crt) => crt switch
    {
        1 => CRT.SimplesNacional,
        2 => CRT.SimplesNacionalExcessoSublimite,
        3 => CRT.RegimeNormal,
        4 => CRT.SimplesNacionalMei,
        _ => CRT.SimplesNacional,
    };

    private static FinalidadeNFe ObterFinalidadeZeus(FiscalDocumentType finalidade)
    {
        if (finalidade == FiscalDocumentType.NotaCredito)
            return Enum.TryParse<FinalidadeNFe>("fnCredito", true, out var fc) ? fc : (FinalidadeNFe)5;

        if (finalidade == FiscalDocumentType.NotaDebito)
            return Enum.TryParse<FinalidadeNFe>("fnDebito", true, out var fd) ? fd : (FinalidadeNFe)6;

        return finalidade switch
        {
            FiscalDocumentType.Complementar => FinalidadeNFe.fnComplementar,
            FiscalDocumentType.Ajuste => FinalidadeNFe.fnAjuste,
            FiscalDocumentType.Devolucao => FinalidadeNFe.fnDevolucao,
            _ => FinalidadeNFe.fnNormal
        };
    }

    private static ide BuildIdeOutbound(OutboundOrder order, List<string> originAccessKeys, string destState, string naturezaOperacao, FiscalDocumentType finalidade)
    {
        int nNf = order.Company.NfeNextNumber;
        if (!string.IsNullOrWhiteSpace(order.InvoiceNumber) && int.TryParse(order.InvoiceNumber, out var parsedNf) && parsedNf > 0)
            nNf = parsedNf;

        int serie = order.Company.NfeSerie;
        if (!string.IsNullOrWhiteSpace(order.InvoiceSerie) && int.TryParse(order.InvoiceSerie, out var parsedSerie) && parsedSerie > 0)
            serie = parsedSerie;

        var companyState = !string.IsNullOrWhiteSpace(order.Company.State) ? order.Company.State.Trim().ToUpper() : "RS";
        if (!Enum.TryParse<DFe.Classes.Entidades.Estado>(companyState, out var ufEnum))
            ufEnum = DFe.Classes.Entidades.Estado.RS;

        var ide = new ide
        {
            cUF = ufEnum,
            cNF = new Random().Next(10000000, 99999999).ToString("D8"),
            natOp = naturezaOperacao.Trim(),
            mod = ModeloDocumento.NFe,
            serie = serie,
            nNF = nNf,
            dhEmi = DateTimeOffset.Now,
            tpNF = TipoNFe.tnSaida,
            idDest = companyState == destState ? DestinoOperacao.doInterna : DestinoOperacao.doInterestadual,
            cMunFG = order.Company.CityCode > 0 ? order.Company.CityCode : 4305108,
            tpImp = TipoImpressao.tiRetrato,
            tpEmis = TipoEmissao.teNormal,
            tpAmb = order.Company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
            finNFe = ObterFinalidadeZeus(finalidade),
            indFinal = ConsumidorFinal.cfNao,
            indPres = PresencaComprador.pcOutros,
            indIntermed = IndicadorIntermediador.iiSemIntermediador,
            procEmi = ProcessoEmissao.peAplicativoContribuinte,
            verProc = "CoreWMS 1.0"
        };

        if (order.Company.Environment == 1 && originAccessKeys != null && originAccessKeys.Any())
        {
            ide.NFref = new List<NFref>();
            foreach (var key in originAccessKeys.Where(k => !string.IsNullOrWhiteSpace(k)))
                ide.NFref.Add(new NFref { refNFe = key.Trim() });
        }

        return ide;
    }

    private static ide BuildIdeStandalone(Company company, StandaloneNfeInput input, string destState, bool isInterstate, string naturezaOperacao, FiscalDocumentType finalidade)
    {
        var companyState = !string.IsNullOrWhiteSpace(company.State) ? company.State.Trim().ToUpper() : "RS";
        if (!Enum.TryParse<DFe.Classes.Entidades.Estado>(companyState, out var ufEnum))
            ufEnum = DFe.Classes.Entidades.Estado.RS;

        return new ide
        {
            cUF = ufEnum,
            cNF = new Random().Next(10000000, 99999999).ToString("D8"),
            natOp = naturezaOperacao.Trim(),
            mod = ModeloDocumento.NFe,
            serie = company.NfeSerie,
            nNF = company.NfeNextNumber,
            dhEmi = DateTimeOffset.Now,
            tpNF = TipoNFe.tnSaida,
            idDest = isInterstate ? DestinoOperacao.doInterestadual : DestinoOperacao.doInterna,
            cMunFG = company.CityCode > 0 ? company.CityCode : 4305108,
            tpImp = (TipoImpressao)(input.TpImp ?? 1),
            tpEmis = TipoEmissao.teNormal,
            tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
            finNFe = ObterFinalidadeZeus(finalidade),
            indFinal = (ConsumidorFinal)(input.IndFinal ?? 0),
            indPres = (PresencaComprador)(input.IndPres ?? 9),
            indIntermed = IndicadorIntermediador.iiSemIntermediador,
            procEmi = ProcessoEmissao.peAplicativoContribuinte,
            verProc = "CoreWMS Standalone 1.0"
        };
    }

    private static emit BuildEmitente(Company company)
    {
        var companyState = !string.IsNullOrWhiteSpace(company.State) ? company.State.Trim().ToUpper() : "RS";
        if (!Enum.TryParse<DFe.Classes.Entidades.Estado>(companyState, out var ufEnum))
            ufEnum = DFe.Classes.Entidades.Estado.RS;

        var foneLimpo = string.IsNullOrWhiteSpace(company.Phone) ? null : new string(company.Phone.Where(char.IsDigit).ToArray());

        return new emit
        {
            CNPJ = company.Cnpj ?? "",
            xNome = company.CorporateName ?? "",
            xFant = string.IsNullOrWhiteSpace(company.TradeName) ? null : company.TradeName.Trim(),
            IE = company.StateRegistration,
            CRT = ObterCrtEmpresa(company.Crt),
            enderEmit = new enderEmit
            {
                xLgr = company.Street ?? "NÃO INFORMADO",
                nro = company.Number ?? "S/N",
                xCpl = company.Complement,
                xBairro = company.Neighborhood ?? "CENTRO",
                cMun = company.CityCode > 0 ? company.CityCode : 4305108,
                xMun = company.CityName ?? "NÃO INFORMADO",
                UF = ufEnum,
                CEP = company.ZipCode ?? "00000000",
                cPais = 1058,
                xPais = "BRASIL",
                fone = string.IsNullOrEmpty(foneLimpo) ? null : long.Parse(foneLimpo)
            }
        };
    }

    private static dest BuildDestinatario(OutboundOrder order)
    {
        string name = !string.IsNullOrWhiteSpace(order.DestinationName)
            ? order.DestinationName.Trim()
            : (order.Customer?.CorporateName ?? "NÃO INFORMADO");

        if (order.Company.Environment != 1)
            name = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

        indIEDest indIe = order.DestinationIeIndicator switch
        {
            1 => indIEDest.ContribuinteICMS,
            2 => indIEDest.Isento,
            _ => indIEDest.NaoContribuinte
        };

        var d = new dest(VersaoServico.Versao400)
        {
            xNome = name,
            IE = !string.IsNullOrWhiteSpace(order.DestinationStateRegistration) ? order.DestinationStateRegistration.Trim() : order.Customer?.StateRegistration,
            indIEDest = indIe,
            enderDest = new enderDest
            {
                xLgr = !string.IsNullOrWhiteSpace(order.DestinationStreet) ? order.DestinationStreet.Trim() : (order.Customer?.Street ?? "NÃO INFORMADO"),
                nro = !string.IsNullOrWhiteSpace(order.DestinationNumber) ? order.DestinationNumber.Trim() : (order.Customer?.Number ?? "S/N"),
                xCpl = !string.IsNullOrWhiteSpace(order.DestinationComplement) ? order.DestinationComplement.Trim() : order.Customer?.Complement,
                xBairro = !string.IsNullOrWhiteSpace(order.DestinationNeighborhood) ? order.DestinationNeighborhood.Trim() : (order.Customer?.Neighborhood ?? "CENTRO"),
                cMun = order.DestinationCityCode > 0 ? order.DestinationCityCode : (order.Customer?.CityCode ?? 9999999),
                xMun = !string.IsNullOrWhiteSpace(order.DestinationCity) ? order.DestinationCity.Trim() : (order.Customer?.CityName ?? "NÃO INFORMADO"),
                UF = !string.IsNullOrWhiteSpace(order.DestinationState) ? order.DestinationState.Trim().ToUpper() : (order.Customer?.State?.Trim().ToUpper() ?? "RS"),
                CEP = !string.IsNullOrWhiteSpace(order.DestinationZipCode) ? order.DestinationZipCode.Trim() : order.Customer?.ZipCode,
                cPais = 1058,
                xPais = "BRASIL"
            }
        };

        var cnpjCpf = !string.IsNullOrWhiteSpace(order.DestinationCnpjCpf) ? order.DestinationCnpjCpf : order.Customer?.Cnpj;
        if (!string.IsNullOrWhiteSpace(cnpjCpf))
        {
            var cleanDoc = new string(cnpjCpf.Where(char.IsDigit).ToArray());
            if (cleanDoc.Length == 14) d.CNPJ = cleanDoc;
            else if (cleanDoc.Length == 11) d.CPF = cleanDoc;
        }

        return d;
    }

    private static dest BuildDestinatarioStandalone(Company company, StandaloneNfeInput input)
    {
        string name = input.DestinationName.Trim();
        if (company.Environment != 1)
            name = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

        var d = new dest(VersaoServico.Versao400)
        {
            xNome = name,
            IE = input.DestinationStateRegistration?.Trim(),
            indIEDest = (indIEDest)input.DestinationIeIndicator,
            enderDest = new enderDest
            {
                xLgr = input.DestinationStreet.Trim(),
                nro = input.DestinationNumber.Trim(),
                xCpl = input.DestinationComplement?.Trim(),
                xBairro = input.DestinationNeighborhood.Trim(),
                cMun = input.DestinationCityCode,
                xMun = input.DestinationCity.Trim(),
                UF = input.DestinationState.Trim().ToUpper(),
                CEP = input.DestinationZipCode.Trim(),
                cPais = 1058,
                xPais = "BRASIL"
            }
        };

        var cleanDoc = Regex.Replace(input.DestinationCnpjCpf ?? "", @"\D", "");
        if (cleanDoc.Length == 14) d.CNPJ = cleanDoc;
        else if (cleanDoc.Length == 11) d.CPF = cleanDoc;

        return d;
    }

    private static transp BuildTransporte(OutboundOrder order, List<OutboundVolume> volumes)
    {
        ModalidadeFrete modFrete = order.FreightModality switch
        {
            0 => ModalidadeFrete.mfContaEmitenteOumfContaRemetente,
            1 => ModalidadeFrete.mfContaDestinatario,
            2 => ModalidadeFrete.mfContaTerceiros,
            _ => ModalidadeFrete.mfSemFrete
        };

        var t = new transp { modFrete = modFrete };

        if (!string.IsNullOrWhiteSpace(order.CarrierCnpjCpf) || !string.IsNullOrWhiteSpace(order.CarrierName))
        {
            t.transporta = new transporta
            {
                xNome = order.CarrierName?.Trim(),
                IE = order.CarrierStateRegistration?.Trim()
            };

            if (!string.IsNullOrWhiteSpace(order.CarrierCnpjCpf))
            {
                var cleanCnpj = new string(order.CarrierCnpjCpf.Where(char.IsDigit).ToArray());
                if (cleanCnpj.Length == 14) t.transporta.CNPJ = cleanCnpj;
                else if (cleanCnpj.Length == 11) t.transporta.CPF = cleanCnpj;
            }
        }

        if (!string.IsNullOrWhiteSpace(order.VehiclePlate))
        {
            t.veicTransp = new veicTransp
            {
                placa = order.VehiclePlate.Trim().ToUpper(),
                UF = !string.IsNullOrWhiteSpace(order.VehiclePlateState) ? order.VehiclePlateState.Trim().ToUpper() : "RS"
            };
        }

        if (volumes != null && volumes.Any())
        {
            t.vol = new List<vol>
            {
                new vol
                {
                    qVol = volumes.Count,
                    pesoB = Math.Round(volumes.Sum(v => v.GrossWeight), 3)
                }
            };
        }

        return t;
    }

    private class ResolvedTaxParams
    {
        public string CfopStateInternal { get; set; } = string.Empty;
        public string CfopInterstate { get; set; } = string.Empty;
        public string CstCsosnIcms { get; set; } = "400";
        public int ModBcIcms { get; set; } = 3;
        public decimal AliqIcms { get; set; }
        public decimal ReducaoBcIcms { get; set; }
        public int ModBcIcmsSt { get; set; } = 4;
        public decimal MvaIcmsSt { get; set; }
        public decimal ReducaoBcIcmsSt { get; set; }
        public decimal AliqIcmsSt { get; set; }
        public int? MotivoDesoneracaoIcms { get; set; }
        public decimal AliqCreditoSimples { get; set; }
        public string CstIpi { get; set; } = "53";
        public int CodigoEnquadramentoIpi { get; set; } = 999;
        public decimal AliqIpi { get; set; }
        public string CstPis { get; set; } = "08";
        public decimal AliqPis { get; set; }
        public string CstCofins { get; set; } = "08";
        public decimal AliqCofins { get; set; }
        public string? CstIbs { get; set; }
        public decimal AliqIbs { get; set; }
        public string? CstCbs { get; set; }
        public decimal AliqCbs { get; set; }
        public string? ClassificacaoTributaria { get; set; }
        public string? AdditionalNotes { get; set; }
    }
}