using CoreWMS.Api.Features.Fiscal.Entities;
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
            .AsNoTracking()
            .Include(o => o.Company)
            .Include(o => o.Customer)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.Id == outboundOrderId, ct)
            ?? throw new InvalidOperationException("Pedido de saída não encontrado.");

        var destState = !string.IsNullOrWhiteSpace(order.DestinationState)
            ? order.DestinationState.Trim().ToUpper()
            : (order.Customer?.State?.Trim().ToUpper() ?? "EX");

        var isInterstate = order.Company.State.Trim().ToUpper() != destState;

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

        nfe.infNFe.ide = BuildIde(order, originAccessKeys, destState);
        nfe.infNFe.emit = BuildEmitente(order.Company);
        nfe.infNFe.dest = BuildDestinatario(order);
        nfe.infNFe.transp = BuildTransporte(order, order.Volumes.ToList());

        if (!string.IsNullOrWhiteSpace(order.AdditionalNotes))
        {
            nfe.infNFe.infAdic = nfe.infNFe.infAdic ?? new NFe.Classes.Informacoes.Observacoes.infAdic();
            nfe.infNFe.infAdic.infCpl = order.AdditionalNotes.Trim();
        }

        int nItem = 1;
        foreach (var item in order.Items.Where(i => i.PackedQuantity > 0))
        {
            var rule = await GetBestFiscalRuleAsync(order.CompanyId, order.CustomerId, destState, item.Product.Ncm, operationType, ct);
            if (rule == null) throw new InvalidOperationException($"Nenhuma Regra Fiscal encontrada para o produto {item.Product.Sku}.");

            var cEan = string.IsNullOrWhiteSpace(item.Product.BaseBarcode) ? "SEM GTIN" : item.Product.BaseBarcode;
            var valorTotalItem = Math.Round(item.PackedQuantity * item.UnitValue, 2);

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
                imposto = BuildImpostos(rule, valorTotalItem)
            };

            nfe.infNFe.det.Add(det);

            if (!string.IsNullOrWhiteSpace(rule.AdditionalNotes))
            {
                nfe.infNFe.infAdic = nfe.infNFe.infAdic ?? new NFe.Classes.Informacoes.Observacoes.infAdic();
                nfe.infNFe.infAdic.infCpl = string.IsNullOrEmpty(nfe.infNFe.infAdic.infCpl)
                    ? rule.AdditionalNotes
                    : nfe.infNFe.infAdic.infCpl + " " + rule.AdditionalNotes;
            }
        }

        var totalVProd = nfe.infNFe.det.Sum(d => d.prod.vProd);

        var temReformaTributaria = nfe.infNFe.det.Any(d => d.imposto.IBSCBS != null);
        var totalVBCIbsCbs = temReformaTributaria ? nfe.infNFe.det.Where(d => d.imposto.IBSCBS != null).Sum(d => d.imposto.IBSCBS.gIBSCBS.vBC) : 0m;
        var totalVIbs = temReformaTributaria ? nfe.infNFe.det.Where(d => d.imposto.IBSCBS != null).Sum(d => d.imposto.IBSCBS.gIBSCBS.gIBSUF.vIBSUF) : 0m;
        var totalVCbs = temReformaTributaria ? nfe.infNFe.det.Where(d => d.imposto.IBSCBS != null).Sum(d => d.imposto.IBSCBS.gIBSCBS.gCBS.vCBS) : 0m;

        nfe.infNFe.total = new total
        {
            ICMSTot = new ICMSTot
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

        nfe.infNFe.pag = new List<pag>
        {
            new pag
            {
                detPag = new List<detPag> { new detPag { tPag = FormaPagamento.fpSemPagamento, vPag = 0 } }
            }
        };

        nfe.infNFe.infRespTec = new Shared.NFe.Classes.Informacoes.InfRespTec.infRespTec
        {
            CNPJ = "12345678000199",
            xContato = "Suporte CoreWMS",
            email = "suporte@corewms.com.br",
            fone = "11999999999",
            hashCSRT = string.Empty,
            idCSRT = null
        };

        return nfe;
    }

    private ide BuildIde(OutboundOrder order, List<string> originAccessKeys, string destState)
    {
        int nNf = 0;
        if (!string.IsNullOrWhiteSpace(order.InvoiceNumber) && int.TryParse(order.InvoiceNumber, out var parsedNf))
        {
            nNf = parsedNf;
        }

        int serie = 1;
        if (!string.IsNullOrWhiteSpace(order.InvoiceSerie) && int.TryParse(order.InvoiceSerie, out var parsedSerie))
        {
            serie = parsedSerie;
        }

        var ide = new ide
        {
            cUF = Enum.Parse<DFe.Classes.Entidades.Estado>(order.Company.State.ToUpper()),
            natOp = "RETORNO DE ARMAZEM GERAL",
            mod = ModeloDocumento.NFe,
            serie = serie,
            nNF = nNf,
            dhEmi = DateTimeOffset.Now,
            tpNF = TipoNFe.tnSaida,
            idDest = order.Company.State.Trim().ToUpper() == destState ? DestinoOperacao.doInterna : DestinoOperacao.doInterestadual,
            cMunFG = order.Company.CityCode,
            tpImp = TipoImpressao.tiRetrato,
            tpEmis = TipoEmissao.teNormal,
            tpAmb = TipoAmbiente.Homologacao,
            finNFe = FinalidadeNFe.fnNormal,
            indFinal = ConsumidorFinal.cfNao,
            indPres = PresencaComprador.pcOutros,
            procEmi = ProcessoEmissao.peAplicativoContribuinte,
            verProc = "CoreWMS 1.0"
        };

        foreach (var key in originAccessKeys)
        {
            ide.NFref.Add(new NFref { refNFe = key });
        }

        return ide;
    }

    private emit BuildEmitente(Features.Identity.Entities.Company company)
    {
        var foneLimpo = string.IsNullOrWhiteSpace(company.Phone) ? null : new string(company.Phone.Where(char.IsDigit).ToArray());

        return new emit
        {
            CNPJ = company.Cnpj,
            xNome = company.CorporateName,
            xFant = company.TradeName,
            IE = company.StateRegistration,
            CRT = CRT.SimplesNacional,
            enderEmit = new enderEmit
            {
                xLgr = company.Street,
                nro = company.Number,
                xCpl = company.Complement,
                xBairro = company.Neighborhood,
                cMun = company.CityCode,
                xMun = company.CityName,
                UF = Enum.Parse<DFe.Classes.Entidades.Estado>(company.State.ToUpper()),
                CEP = company.ZipCode,
                cPais = 1058,
                xPais = "BRASIL",
                fone = string.IsNullOrEmpty(foneLimpo) ? null : long.Parse(foneLimpo)
            }
        };
    }

    private dest BuildDestinatario(OutboundOrder order)
    {
        string name = !string.IsNullOrWhiteSpace(order.DestinationName)
            ? order.DestinationName.Trim()
            : (order.Customer?.CorporateName ?? "NÃO INFORMADO");

        string city = !string.IsNullOrWhiteSpace(order.DestinationCity)
            ? order.DestinationCity.Trim()
            : (order.Customer?.CityName ?? "NÃO INFORMADO");

        string state = !string.IsNullOrWhiteSpace(order.DestinationState)
            ? order.DestinationState.Trim().ToUpper()
            : (order.Customer?.State?.Trim().ToUpper() ?? "EX");

        string? cnpjCpf = !string.IsNullOrWhiteSpace(order.DestinationCnpjCpf)
            ? order.DestinationCnpjCpf.Trim()
            : order.Customer?.Cnpj;

        string? zipCode = !string.IsNullOrWhiteSpace(order.DestinationZipCode)
            ? order.DestinationZipCode.Trim()
            : order.Customer?.ZipCode;

        var d = new dest(VersaoServico.Versao400)
        {
            xNome = name,
            indIEDest = indIEDest.NaoContribuinte,
            enderDest = new enderDest
            {
                xLgr = order.Customer?.Street ?? "NÃO INFORMADO",
                nro = order.Customer?.Number ?? "S/N",
                xBairro = order.Customer?.Neighborhood ?? "NÃO INFORMADO",
                cMun = order.Customer?.CityCode ?? 9999999,
                xMun = city,
                UF = state,
                CEP = zipCode,
                cPais = 1058,
                xPais = "BRASIL"
            }
        };

        if (!string.IsNullOrWhiteSpace(cnpjCpf))
        {
            var cleanDoc = new string(cnpjCpf.Where(char.IsDigit).ToArray());
            if (cleanDoc.Length == 14) d.CNPJ = cleanDoc;
            else if (cleanDoc.Length == 11) d.CPF = cleanDoc;
        }

        return d;
    }

    private transp BuildTransporte(OutboundOrder order, List<OutboundVolume> volumes)
    {
        var t = new transp
        {
            modFrete = !string.IsNullOrWhiteSpace(order.CarrierCnpjCpf)
                ? ModalidadeFrete.mfProprioContaDestinatario
                : ModalidadeFrete.mfSemFrete
        };

        if (!string.IsNullOrWhiteSpace(order.CarrierCnpjCpf) || !string.IsNullOrWhiteSpace(order.CarrierName))
        {
            t.transporta = new transporta
            {
                xNome = order.CarrierName?.Trim()
            };

            if (!string.IsNullOrWhiteSpace(order.CarrierCnpjCpf))
            {
                var cleanCnpj = new string(order.CarrierCnpjCpf.Where(char.IsDigit).ToArray());
                if (cleanCnpj.Length == 14) t.transporta.CNPJ = cleanCnpj;
                else if (cleanCnpj.Length == 11) t.transporta.CPF = cleanCnpj;
            }
        }

        // Atribuição corrigida: passa a string diretamente
        if (!string.IsNullOrWhiteSpace(order.VehiclePlate))
        {
            t.veicTransp = new veicTransp
            {
                placa = order.VehiclePlate.Trim().ToUpper(),
                UF = !string.IsNullOrWhiteSpace(order.VehiclePlateState)
                    ? order.VehiclePlateState.Trim().ToUpper()
                    : "RS"
            };
        }

        if (volumes.Any())
        {
            t.vol.Add(new vol
            {
                qVol = volumes.Count,
                pesoB = Math.Round(volumes.Sum(v => v.GrossWeight), 3)
            });
        }

        return t;
    }

    private imposto BuildImpostos(FiscalOperationRule rule, decimal valorTotalItem)
    {
        var impostos = new imposto
        {
            ICMS = new ICMS
            {
                TipoICMS = new ICMSSN102
                {
                    orig = OrigemMercadoria.OmNacional,
                    CSOSN = Csosnicms.Csosn400
                }
            },
            PIS = new PIS { TipoPIS = new PISOutr { CST = CSTPIS.pis99, vBC = 0, pPIS = 0, vPIS = 0 } },
            COFINS = new COFINS { TipoCOFINS = new COFINSOutr { CST = CSTCOFINS.cofins99, vBC = 0, pCOFINS = 0, vCOFINS = 0 } }
        };

        if (!string.IsNullOrEmpty(rule.CstIbs) || !string.IsNullOrEmpty(rule.CstCbs))
        {
            var cstText = "cst" + (rule.CstIbs ?? "000");
            if (!Enum.TryParse<CSTIBSCBS>(cstText, true, out var parsedCst))
            {
                parsedCst = CSTIBSCBS.cst000;
            }

            var aliqIbs = rule.AliqIbs > 0 ? rule.AliqIbs : 0.10m;
            var aliqCbs = rule.AliqCbs > 0 ? rule.AliqCbs : 0.90m;

            var vIbsUf = Math.Round(valorTotalItem * (aliqIbs / 100), 2);
            var vCbs = Math.Round(valorTotalItem * (aliqCbs / 100), 2);

            impostos.IBSCBS = new IBSCBS
            {
                CST = parsedCst,
                cClassTrib = "000001",
                gIBSCBS = new gIBSCBS
                {
                    vBC = valorTotalItem,
                    gIBSUF = new gIBSUF
                    {
                        pIBSUF = aliqIbs,
                        vIBSUF = vIbsUf
                    },
                    gIBSMun = new gIBSMun
                    {
                        pIBSMun = 0,
                        vIBSMun = 0
                    },
                    gCBS = new gCBS
                    {
                        pCBS = aliqCbs,
                        vCBS = vCbs
                    },
                    vIBS = vIbsUf
                }
            };
        }

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