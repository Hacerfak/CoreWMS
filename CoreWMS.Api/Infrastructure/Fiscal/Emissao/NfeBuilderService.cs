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

        if (order.Company == null)
            throw new InvalidOperationException("A empresa emitente não está vinculada a este pedido.");

        var destState = !string.IsNullOrWhiteSpace(order.DestinationState)
            ? order.DestinationState.Trim().ToUpper()
            : (order.Customer?.State?.Trim().ToUpper() ?? "EX");

        var companyState = !string.IsNullOrWhiteSpace(order.Company.State)
            ? order.Company.State.Trim().ToUpper()
            : "RS";

        var isInterstate = companyState != destState;

        // Busca as chaves de acesso das NF-es de Entrada originais (NFref) para Devoluções/Retornos
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
        nfe.infNFe.transp = BuildTransporte(order, order.Volumes?.ToList() ?? new List<OutboundVolume>());

        if (!string.IsNullOrWhiteSpace(order.AdditionalNotes))
        {
            nfe.infNFe.infAdic = nfe.infNFe.infAdic ?? new NFe.Classes.Informacoes.Observacoes.infAdic();
            nfe.infNFe.infAdic.infCpl = order.AdditionalNotes.Trim();
        }

        // Garante que a lista de itens da nota está instanciada antes de adicionar
        nfe.infNFe.det = nfe.infNFe.det ?? new List<det>();

        int nItem = 1;
        var packedItems = order.Items.Where(i => i.PackedQuantity > 0).ToList();

        if (!packedItems.Any())
        {
            throw new InvalidOperationException("Nenhum item empacotado/separado foi encontrado para este pedido de saída.");
        }

        foreach (var item in packedItems)
        {
            if (item.Product == null)
                throw new InvalidOperationException($"Produto não encontrado para o item SKU {item.SkuCode}.");

            var rule = await GetBestFiscalRuleAsync(order.CompanyId, order.CustomerId, destState, item.Product.Ncm, operationType, ct);
            if (rule == null)
                throw new InvalidOperationException($"Nenhuma Regra Fiscal encontrada para o produto SKU {item.Product.Sku}.");

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
                    NCM = string.IsNullOrWhiteSpace(item.Product.Ncm) ? "00000000" : item.Product.Ncm,
                    CFOP = isInterstate ? int.Parse(rule.CfopInterstate) : int.Parse(rule.CfopStateInternal),
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
        var temReformaTributaria = nfe.infNFe.det.Any(d => d.imposto?.IBSCBS != null);
        var totalVBCIbsCbs = temReformaTributaria ? nfe.infNFe.det.Where(d => d.imposto?.IBSCBS != null).Sum(d => d.imposto.IBSCBS.gIBSCBS.vBC) : 0m;
        var totalVIbs = temReformaTributaria ? nfe.infNFe.det.Where(d => d.imposto?.IBSCBS != null).Sum(d => d.imposto.IBSCBS.gIBSCBS.gIBSUF.vIBSUF) : 0m;
        var totalVCbs = temReformaTributaria ? nfe.infNFe.det.Where(d => d.imposto?.IBSCBS != null).Sum(d => d.imposto.IBSCBS.gIBSCBS.gCBS.vCBS) : 0m;

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
            CNPJ = "64615275000112",
            xContato = "CoreWMS - Eder Gross Cichelero",
            email = "suporte@corewms.com.br",
            fone = "54992221877",
            hashCSRT = null,
            idCSRT = null
        };

        return nfe;
    }

    private ide BuildIde(OutboundOrder order, List<string> originAccessKeys, string destState)
    {
        int nNf = order.Company.NfeNextNumber;
        if (!string.IsNullOrWhiteSpace(order.InvoiceNumber) && int.TryParse(order.InvoiceNumber, out var parsedNf) && parsedNf > 0)
        {
            nNf = parsedNf;
        }

        int serie = order.Company.NfeSerie;
        if (!string.IsNullOrWhiteSpace(order.InvoiceSerie) && int.TryParse(order.InvoiceSerie, out var parsedSerie) && parsedSerie > 0)
        {
            serie = parsedSerie;
        }

        var companyState = !string.IsNullOrWhiteSpace(order.Company.State) ? order.Company.State.Trim().ToUpper() : "RS";
        if (!Enum.TryParse<DFe.Classes.Entidades.Estado>(companyState, out var ufEnum))
        {
            ufEnum = DFe.Classes.Entidades.Estado.RS;
        }

        var ide = new ide
        {
            cUF = ufEnum,
            cNF = new Random().Next(10000000, 99999999).ToString("D8"),
            natOp = "RETORNO DE ARMAZEM GERAL",
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
            finNFe = FinalidadeNFe.fnNormal,
            indFinal = ConsumidorFinal.cfNao,
            indPres = PresencaComprador.pcOutros,
            indIntermed = IndicadorIntermediador.iiSemIntermediador,
            procEmi = ProcessoEmissao.peAplicativoContribuinte,
            verProc = "CoreWMS 1.0"
        };

        // Adiciona NFref apenas em Produção para evitar a Rejeição 267 em Homologação
        if (order.Company.Environment == 1 && originAccessKeys != null && originAccessKeys.Any())
        {
            ide.NFref = ide.NFref ?? new List<NFref>();
            foreach (var key in originAccessKeys)
            {
                if (!string.IsNullOrWhiteSpace(key))
                    ide.NFref.Add(new NFref { refNFe = key.Trim() });
            }
        }

        return ide;
    }

    private emit BuildEmitente(Features.Identity.Entities.Company company)
    {
        var companyState = !string.IsNullOrWhiteSpace(company.State) ? company.State.Trim().ToUpper() : "RS";
        if (!Enum.TryParse<DFe.Classes.Entidades.Estado>(companyState, out var ufEnum))
        {
            ufEnum = DFe.Classes.Entidades.Estado.RS;
        }

        var foneLimpo = string.IsNullOrWhiteSpace(company.Phone) ? null : new string(company.Phone.Where(char.IsDigit).ToArray());

        return new emit
        {
            CNPJ = company.Cnpj ?? "",
            xNome = company.CorporateName ?? "",
            xFant = string.IsNullOrWhiteSpace(company.TradeName) ? null : company.TradeName.Trim(),
            IE = company.StateRegistration,
            CRT = CRT.SimplesNacional,
            enderEmit = new enderEmit
            {
                xLgr = company.Street ?? "NÃO INFORMADO",
                nro = company.Number ?? "S/N",
                xCpl = company.Complement,
                xBairro = company.Neighborhood ?? "NÃO INFORMADO",
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

    private dest BuildDestinatario(OutboundOrder order)
    {
        string name = !string.IsNullOrWhiteSpace(order.DestinationName)
            ? order.DestinationName.Trim()
            : (order.Customer?.CorporateName ?? "NÃO INFORMADO");

        if (order.Company.Environment != 1)
        {
            name = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
        }

        string street = !string.IsNullOrWhiteSpace(order.DestinationStreet)
            ? order.DestinationStreet.Trim()
            : (order.Customer?.Street ?? "NÃO INFORMADO");

        string number = !string.IsNullOrWhiteSpace(order.DestinationNumber)
            ? order.DestinationNumber.Trim()
            : (order.Customer?.Number ?? "S/N");

        string? complement = !string.IsNullOrWhiteSpace(order.DestinationComplement)
            ? order.DestinationComplement.Trim()
            : order.Customer?.Complement;

        string neighborhood = !string.IsNullOrWhiteSpace(order.DestinationNeighborhood)
            ? order.DestinationNeighborhood.Trim()
            : (order.Customer?.Neighborhood ?? "NÃO INFORMADO");

        int cityCode = order.DestinationCityCode > 0
            ? order.DestinationCityCode
            : (order.Customer?.CityCode ?? 9999999);

        string city = !string.IsNullOrWhiteSpace(order.DestinationCity)
            ? order.DestinationCity.Trim()
            : (order.Customer?.CityName ?? "NÃO INFORMADO");

        string state = !string.IsNullOrWhiteSpace(order.DestinationState)
            ? order.DestinationState.Trim().ToUpper()
            : (order.Customer?.State?.Trim().ToUpper() ?? "RS");

        string? cnpjCpf = !string.IsNullOrWhiteSpace(order.DestinationCnpjCpf)
            ? order.DestinationCnpjCpf.Trim()
            : order.Customer?.Cnpj;

        string? zipCode = !string.IsNullOrWhiteSpace(order.DestinationZipCode)
            ? order.DestinationZipCode.Trim()
            : order.Customer?.ZipCode;

        string? ie = !string.IsNullOrWhiteSpace(order.DestinationStateRegistration)
            ? order.DestinationStateRegistration.Trim()
            : order.Customer?.StateRegistration;

        indIEDest indIe = order.DestinationIeIndicator switch
        {
            1 => indIEDest.ContribuinteICMS,
            2 => indIEDest.Isento,
            _ => indIEDest.NaoContribuinte
        };

        var d = new dest(VersaoServico.Versao400)
        {
            xNome = name,
            IE = ie,
            indIEDest = indIe,
            enderDest = new enderDest
            {
                xLgr = street,
                nro = number,
                xCpl = complement,
                xBairro = neighborhood,
                cMun = cityCode,
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
        ModalidadeFrete modFrete = order.FreightModality switch
        {
            0 => ModalidadeFrete.mfContaEmitenteOumfContaRemetente,
            1 => ModalidadeFrete.mfContaDestinatario,
            2 => ModalidadeFrete.mfContaTerceiros,
            _ => ModalidadeFrete.mfSemFrete
        };

        var t = new transp
        {
            modFrete = modFrete
        };

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
                UF = !string.IsNullOrWhiteSpace(order.VehiclePlateState)
                    ? order.VehiclePlateState.Trim().ToUpper()
                    : "RS"
            };
        }

        // Garante a inicialização prévia da lista t.vol para evitar NullReferenceException
        if (volumes != null && volumes.Any())
        {
            t.vol = t.vol ?? new List<vol>();
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

        if (rule != null && (!string.IsNullOrEmpty(rule.CstIbs) || !string.IsNullOrEmpty(rule.CstCbs)))
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