using System.Globalization;
using System.Text.RegularExpressions;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Infrastructure.Data;
using DFe.Classes.Flags;
using DFe.Utils;
using Microsoft.EntityFrameworkCore;
using NFe.Classes.Informacoes;
using NFe.Classes.Informacoes.Cobranca;
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

public record StandaloneNfeItemInput(
    Guid ProductId,
    decimal Quantity,
    decimal UnitValue,
    string? Batch = null,
    DateTime? ManufactureDate = null,
    DateTime? ExpirationDate = null,
    string? XPed = null,
    int? NItemPed = null,
    string? InboundInvoiceNumber = null,
    string? OriginalInboundInfAdProd = null
);

public record NfeDuplicataInput(
    string Numero,
    DateTime DataVencimento,
    decimal Valor
);

public record NfePaymentInput(
    bool GerarCobranca,
    FormaPagamento FormaPagamento = FormaPagamento.fpSemPagamento,
    IndicadorPagamentoDetalhePagamento IndicadorPagamentoDetalhePagamento = IndicadorPagamentoDetalhePagamento.ipDetPgVista,
    string? NumeroFatura = null,
    decimal? ValorOriginalFatura = null,
    decimal? ValorDescontoFatura = null,
    decimal? ValorLiquidoFatura = null,
    List<NfeDuplicataInput>? Duplicatas = null
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
    List<StandaloneNfeItemInput> Items,
    int FreightModality = 9,
    string? CarrierCnpjCpf = null,
    string? CarrierName = null,
    string? CarrierStateRegistration = null,
    string? CarrierAddress = null,
    string? CarrierCity = null,
    string? CarrierState = null,
    string? VehiclePlate = null,
    string? VehiclePlateState = null,
    NfePaymentInput? Payment = null
);

public record NfeBuildRequest(
    Guid FiscalRuleId,
    Guid? CompanyId = null,
    Guid? OutboundOrderId = null,
    Guid? InboundOrderIdFilter = null,
    StandaloneNfeInput? ManualInput = null,
    NfePaymentInput? Payment = null,
    int? CustomIndFinal = null,
    int? CustomIndPres = null,
    int? CustomTpImp = null,
    string? CustomAdditionalNotes = null
);

public class NfeBuilderService
{
    private readonly ApplicationDbContext _db;
    private static readonly CultureInfo PtBrCulture = new("pt-BR");

    public NfeBuilderService(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<(NFe.Classes.NFe Nfe, FiscalOperationRule Rule)> BuildAsync(NfeBuildRequest request, CancellationToken ct = default)
    {
        var context = await ResolveContextAsync(request, ct);
        var nfe = AssembleNfe(context);
        return (nfe, context.Rule);
    }

    public Task<(NFe.Classes.NFe Nfe, FiscalOperationRule Rule)> BuildOutboundNfeAsync(
        Guid outboundOrderId,
        Guid fiscalRuleId,
        CancellationToken ct = default,
        Guid? inboundOrderIdFilter = null,
        NfePaymentInput? payment = null,
        int? customIndFinal = null,
        int? customIndPres = null,
        int? customTpImp = null,
        string? customAdditionalNotes = null)
    {
        var request = new NfeBuildRequest(
            FiscalRuleId: fiscalRuleId,
            OutboundOrderId: outboundOrderId,
            InboundOrderIdFilter: inboundOrderIdFilter,
            Payment: payment,
            CustomIndFinal: customIndFinal,
            CustomIndPres: customIndPres,
            CustomTpImp: customTpImp,
            CustomAdditionalNotes: customAdditionalNotes
        );

        return BuildAsync(request, ct);
    }

    public Task<(NFe.Classes.NFe Nfe, FiscalOperationRule Rule)> BuildStandaloneNfeAsync(
        StandaloneNfeInput input,
        CancellationToken ct = default)
    {
        var request = new NfeBuildRequest(
            CompanyId: input.CompanyId,
            FiscalRuleId: input.FiscalRuleId,
            ManualInput: input,
            Payment: input.Payment
        );

        return BuildAsync(request, ct);
    }

    private async Task<NfeBuildContext> ResolveContextAsync(NfeBuildRequest request, CancellationToken ct)
    {
        OutboundOrder? order = null;
        Company? company = null;
        var manual = request.ManualInput;

        if (request.OutboundOrderId.HasValue && request.OutboundOrderId.Value != Guid.Empty)
        {
            order = await _db.OutboundOrders
                .AsNoTracking()
                .Include(o => o.Company)
                .Include(o => o.Customer)
                .Include(o => o.Items).ThenInclude(i => i.Product)
                .Include(o => o.Volumes).ThenInclude(v => v.PackagingType)
                .FirstOrDefaultAsync(o => o.Id == request.OutboundOrderId.Value, ct)
                ?? throw new InvalidOperationException($"Pedido de saída '{request.OutboundOrderId}' não encontrado.");

            company = order.Company ?? throw new InvalidOperationException("Empresa emitente não vinculada a este pedido.");
        }
        else
        {
            var companyId = request.CompanyId ?? manual?.CompanyId
                ?? throw new InvalidOperationException("Empresa emitente obrigatória para emissão avulsa.");

            company = await _db.Companies
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == companyId, ct)
                ?? throw new InvalidOperationException("Empresa emitente não encontrada.");
        }

        var rule = await _db.FiscalOperationRules
            .AsNoTracking()
            .Include(r => r.Exceptions.Where(e => e.IsActive))
            .FirstOrDefaultAsync(r => r.Id == request.FiscalRuleId && r.CompanyId == company.Id && r.IsActive, ct)
            ?? throw new InvalidOperationException("A Natureza de Operação selecionada não foi encontrada ou está inativa.");

        // Consulta Alocações e Chaves de NF-e de Entrada (Remessa)
        var originAccessKeys = new List<string>();
        var canonicalItems = new List<NfeCanonicalItem>();

        if (order != null)
        {
            var allocationsQuery = _db.OutboundAllocations
                .AsNoTracking()
                .Include(a => a.HandlingUnit)
                .Where(a => a.OutboundOrderId == order.Id && a.IsPicked);

            var pickedAllocations = await allocationsQuery.ToListAsync(ct);

            // Carrega documentos de entrada (NF-e de Remessa) das HUs
            var receiptDocIds = pickedAllocations
                .Where(a => a.HandlingUnit?.ReceiptDocumentId != null)
                .Select(a => a.HandlingUnit!.ReceiptDocumentId!.Value)
                .Distinct()
                .ToList();

            var inboundOrders = await _db.InboundOrders
                .AsNoTracking()
                .Where(io => receiptDocIds.Contains(io.Id))
                .ToDictionaryAsync(io => io.Id, ct);

            // Cache do infAdProd dos itens do XML de entrada para herança
            var inboundItemNotesCache = new Dictionary<string, string>(); // Chave: $"{inboundOrderId}_{sku}"
            foreach (var inb in inboundOrders.Values)
            {
                if (!string.IsNullOrWhiteSpace(inb.RawXml))
                {
                    try
                    {
                        var inbProc = FuncoesXml.XmlStringParaClasse<NFe.Classes.nfeProc>(inb.RawXml);
                        var inbNfe = inbProc?.NFe ?? FuncoesXml.XmlStringParaClasse<NFe.Classes.NFe>(inb.RawXml);
                        if (inbNfe?.infNFe?.det != null)
                        {
                            foreach (var d in inbNfe.infNFe.det)
                            {
                                if (!string.IsNullOrWhiteSpace(d.infAdProd))
                                {
                                    var skuKey = $"{inb.Id}_{d.prod.cProd?.Trim()}";
                                    if (!inboundItemNotesCache.ContainsKey(skuKey))
                                    {
                                        inboundItemNotesCache[skuKey] = d.infAdProd.Trim();
                                    }
                                }
                            }
                        }
                    }
                    catch
                    {
                        // Se houver falha de parse do XML bruto de entrada, segue sem travar a emissão
                    }
                }
            }

            if (request.InboundOrderIdFilter.HasValue && request.InboundOrderIdFilter.Value != Guid.Empty)
            {
                pickedAllocations = pickedAllocations
                    .Where(a => a.HandlingUnit?.ReceiptDocumentId == request.InboundOrderIdFilter.Value)
                    .ToList();
            }

            originAccessKeys = pickedAllocations
                .Where(a => a.HandlingUnit?.ReceiptDocumentId != null && inboundOrders.ContainsKey(a.HandlingUnit.ReceiptDocumentId.Value))
                .Select(a => inboundOrders[a.HandlingUnit!.ReceiptDocumentId!.Value].AccessKey)
                .Where(k => !string.IsNullOrWhiteSpace(k))
                .Distinct()
                .ToList()!;

            int lineCounter = 1;

            var allocationsByItemAndInbound = pickedAllocations
                .GroupBy(a => new
                {
                    a.OutboundOrderItemId,
                    ReceiptDocumentId = a.HandlingUnit?.ReceiptDocumentId
                })
                .ToList();

            if (!allocationsByItemAndInbound.Any())
            {
                foreach (var item in order.Items.Where(i => i.PackedQuantity > 0))
                {
                    canonicalItems.Add(new NfeCanonicalItem(
                        Product: item.Product!,
                        Quantity: item.PackedQuantity,
                        UnitValue: item.UnitValue,
                        InboundUnitValue: item.InboundUnitValue,
                        LineNumber: lineCounter++,
                        XPed: order.OrderNumber,
                        NItemPed: item.LineNumber,
                        InboundInvoiceNumber: null,
                        OriginalInboundInfAdProd: null,
                        Batches: new List<NfeBatchTraceDto>()
                    ));
                }
            }
            else
            {
                foreach (var group in allocationsByItemAndInbound)
                {
                    var orderItem = order.Items.FirstOrDefault(i => i.Id == group.Key.OutboundOrderItemId);
                    if (orderItem?.Product == null) continue;

                    decimal groupQuantity = group.Sum(a => a.Quantity);

                    string? inboundInvoiceNumber = null;
                    string? originalInboundInfAdProd = null;

                    if (group.Key.ReceiptDocumentId.HasValue && inboundOrders.TryGetValue(group.Key.ReceiptDocumentId.Value, out var inb))
                    {
                        inboundInvoiceNumber = !string.IsNullOrWhiteSpace(inb.InvoiceNumber)
                            ? inb.InvoiceNumber.TrimStart('0')
                            : (!string.IsNullOrWhiteSpace(inb.AccessKey) && inb.AccessKey.Length >= 34
                                ? inb.AccessKey.Substring(25, 9).TrimStart('0')
                                : inb.InvoiceNumber);

                        var skuLookupKey = $"{inb.Id}_{orderItem.Product.Sku?.Trim()}";
                        if (inboundItemNotesCache.TryGetValue(skuLookupKey, out var inheritedNote))
                        {
                            originalInboundInfAdProd = inheritedNote;
                        }
                    }

                    var batchList = group
                        .Where(a => !string.IsNullOrWhiteSpace(a.HandlingUnit?.Batch))
                        .GroupBy(a => new
                        {
                            Batch = a.HandlingUnit!.Batch!.Trim(),
                            a.HandlingUnit.ManufactureDate,
                            a.HandlingUnit.ExpirationDate
                        })
                        .Select(bg => new NfeBatchTraceDto(
                            Batch: bg.Key.Batch,
                            Quantity: bg.Sum(x => x.Quantity),
                            ManufactureDate: bg.Key.ManufactureDate,
                            ExpirationDate: bg.Key.ExpirationDate
                        ))
                        .ToList();

                    canonicalItems.Add(new NfeCanonicalItem(
                        Product: orderItem.Product,
                        Quantity: groupQuantity,
                        UnitValue: orderItem.UnitValue,
                        InboundUnitValue: orderItem.InboundUnitValue,
                        LineNumber: lineCounter++,
                        XPed: order.OrderNumber,
                        NItemPed: orderItem.LineNumber,
                        InboundInvoiceNumber: inboundInvoiceNumber,
                        OriginalInboundInfAdProd: originalInboundInfAdProd,
                        Batches: batchList
                    ));
                }
            }
        }
        else if (manual?.Items != null && manual.Items.Any())
        {
            var productIds = manual.Items.Select(i => i.ProductId).Distinct().ToList();
            var products = await _db.Products
                .AsNoTracking()
                .Where(p => productIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id, ct);

            int line = 1;
            foreach (var item in manual.Items)
            {
                if (!products.TryGetValue(item.ProductId, out var prod))
                    throw new InvalidOperationException($"Produto ID '{item.ProductId}' não localizado no cadastro.");

                var batchList = new List<NfeBatchTraceDto>();
                if (!string.IsNullOrWhiteSpace(item.Batch))
                {
                    batchList.Add(new NfeBatchTraceDto(
                        Batch: item.Batch.Trim(),
                        Quantity: item.Quantity,
                        ManufactureDate: item.ManufactureDate,
                        ExpirationDate: item.ExpirationDate
                    ));
                }

                canonicalItems.Add(new NfeCanonicalItem(
                    Product: prod,
                    Quantity: item.Quantity,
                    UnitValue: item.UnitValue,
                    InboundUnitValue: item.UnitValue,
                    LineNumber: item.NItemPed ?? line++,
                    XPed: item.XPed,
                    NItemPed: item.NItemPed,
                    InboundInvoiceNumber: item.InboundInvoiceNumber,
                    OriginalInboundInfAdProd: item.OriginalInboundInfAdProd,
                    Batches: batchList
                ));
            }
        }

        // Resolução do Destinatário
        var destState = !string.IsNullOrWhiteSpace(manual?.DestinationState)
            ? manual.DestinationState.Trim().ToUpper()
            : (!string.IsNullOrWhiteSpace(order?.DestinationState)
                ? order.DestinationState.Trim().ToUpper()
                : (order?.Customer?.State?.Trim().ToUpper() ?? "RS"));

        var destName = !string.IsNullOrWhiteSpace(manual?.DestinationName)
            ? manual.DestinationName.Trim()
            : (!string.IsNullOrWhiteSpace(order?.DestinationName)
                ? order.DestinationName.Trim()
                : (order?.Customer?.CorporateName ?? "NÃO INFORMADO"));

        var destCnpjCpf = !string.IsNullOrWhiteSpace(manual?.DestinationCnpjCpf)
            ? manual.DestinationCnpjCpf
            : (!string.IsNullOrWhiteSpace(order?.DestinationCnpjCpf)
                ? order.DestinationCnpjCpf
                : order?.Customer?.Cnpj);

        var destIe = !string.IsNullOrWhiteSpace(manual?.DestinationStateRegistration)
            ? manual.DestinationStateRegistration.Trim()
            : (!string.IsNullOrWhiteSpace(order?.DestinationStateRegistration)
                ? order.DestinationStateRegistration.Trim()
                : order?.Customer?.StateRegistration);

        int destIeIndicator = manual?.DestinationIeIndicator
            ?? order?.DestinationIeIndicator
            ?? order?.Customer?.IeIndicator
            ?? 9;

        var destStreet = manual?.DestinationStreet ?? order?.DestinationStreet ?? order?.Customer?.Street ?? "NÃO INFORMADO";
        var destNumber = manual?.DestinationNumber ?? order?.DestinationNumber ?? order?.Customer?.Number ?? "S/N";
        var destComplement = manual?.DestinationComplement ?? order?.DestinationComplement ?? order?.Customer?.Complement;
        var destNeighborhood = manual?.DestinationNeighborhood ?? order?.DestinationNeighborhood ?? order?.Customer?.Neighborhood ?? "CENTRO";
        var destCityCode = (manual?.DestinationCityCode > 0 ? manual.DestinationCityCode : (order?.DestinationCityCode > 0 ? order.DestinationCityCode : order?.Customer?.CityCode)) ?? 9999999;
        var destCity = manual?.DestinationCity ?? order?.DestinationCity ?? order?.Customer?.CityName ?? "NÃO INFORMADO";
        var destZip = manual?.DestinationZipCode ?? order?.DestinationZipCode ?? order?.Customer?.ZipCode ?? "00000000";

        // Transporte
        int freightModality = manual?.FreightModality ?? order?.FreightModality ?? 9;
        var carrierCnpjCpf = manual?.CarrierCnpjCpf ?? order?.CarrierCnpjCpf;
        var carrierName = manual?.CarrierName ?? order?.CarrierName;
        var carrierIe = manual?.CarrierStateRegistration ?? order?.CarrierStateRegistration;
        var carrierAddress = manual?.CarrierAddress ?? order?.CarrierAddress;
        var carrierCity = manual?.CarrierCity ?? order?.CarrierCity;
        var vehiclePlate = manual?.VehiclePlate ?? order?.VehiclePlate;
        var vehiclePlateState = manual?.VehiclePlateState ?? order?.VehiclePlateState;

        var carrierState = manual?.CarrierState
            ?? order?.CarrierState
            ?? vehiclePlateState
            ?? company.State?.Trim().ToUpper();

        decimal totalPesoLiquido = 0m;
        decimal totalPesoBruto = 0m;

        foreach (var item in canonicalItems)
        {
            var unitNet = item.Product.NetWeight;
            var unitGross = item.Product.GrossWeight > 0 ? item.Product.GrossWeight : unitNet;

            totalPesoLiquido += item.Quantity * unitNet;
            totalPesoBruto += item.Quantity * unitGross;
        }

        var orderVolumes = order?.Volumes?.ToList() ?? new List<OutboundVolume>();
        if (orderVolumes.Any() && orderVolumes.Sum(v => v.GrossWeight) > 0)
        {
            totalPesoBruto = orderVolumes.Sum(v => v.GrossWeight);
        }

        int quantidadeVolumes = orderVolumes.Any()
            ? orderVolumes.Count
            : (int)Math.Ceiling(canonicalItems.Sum(i => i.Quantity));

        var especieVolume = orderVolumes.Any()
            ? orderVolumes.First().PackagingType?.Description ?? "VOLUMES"
            : "VOLUMES";

        int nNf = company.NfeNextNumber;
        int serie = company.NfeSerie;

        var notes = request.CustomAdditionalNotes ?? manual?.AdditionalNotes ?? order?.AdditionalNotes;

        return new NfeBuildContext(
            Company: company,
            Rule: rule,
            Order: order,
            Payment: request.Payment ?? manual?.Payment,
            Destinatario: new NfeDestinatarioData(
                Name: destName,
                CnpjCpf: destCnpjCpf,
                StateRegistration: destIe,
                IeIndicator: destIeIndicator,
                Street: destStreet,
                Number: destNumber,
                Complement: destComplement,
                Neighborhood: destNeighborhood,
                CityCode: destCityCode,
                City: destCity,
                State: destState,
                ZipCode: destZip
            ),
            Identificacao: new NfeIdentificacaoData(
                Number: nNf,
                Serie: serie,
                DestState: destState,
                IsInterstate: !string.Equals(company.State?.Trim(), destState, StringComparison.OrdinalIgnoreCase),
                IndFinal: request.CustomIndFinal ?? manual?.IndFinal ?? (destIeIndicator == 9 ? 1 : 0),
                IndPres: request.CustomIndPres ?? manual?.IndPres ?? 9,
                TpImp: request.CustomTpImp ?? manual?.TpImp ?? 1,
                OriginAccessKeys: originAccessKeys
            ),
            Transporte: new NfeTransporteData(
                FreightModality: freightModality,
                CarrierCnpjCpf: carrierCnpjCpf,
                CarrierName: carrierName,
                CarrierStateRegistration: carrierIe,
                CarrierAddress: carrierAddress,
                CarrierCity: carrierCity,
                CarrierState: carrierState,
                VehiclePlate: vehiclePlate,
                VehiclePlateState: vehiclePlateState,
                QuantidadeVolumes: quantidadeVolumes,
                Especie: especieVolume,
                PesoLiquido: Math.Round(totalPesoLiquido, 3),
                PesoBruto: Math.Round(totalPesoBruto, 3)
            ),
            Items: canonicalItems,
            AdditionalNotes: notes?.Trim()
        );
    }

    private NFe.Classes.NFe AssembleNfe(NfeBuildContext ctx)
    {
        var nfe = new NFe.Classes.NFe
        {
            infNFe = new infNFe { versao = "4.00" }
        };

        nfe.infNFe.ide = BuildIde(ctx);
        nfe.infNFe.emit = BuildEmitente(ctx.Company);
        nfe.infNFe.dest = BuildDestinatario(ctx.Destinatario, ctx.Company.Environment);
        nfe.infNFe.transp = BuildTransporte(ctx.Transporte);

        nfe.infNFe.det = new List<det>();
        int nItem = 1;
        var companyCrt = ObterCrtEmpresa(ctx.Company.Crt);

        // Conjunto de observações fiscais únicas coletadas das regras/exceções (sem repetição)
        var distinctRuleNotes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // 1. INCLUI INCONDICIONALMENTE A OBSERVAÇÃO PADRÃO DA NATUREZA DE OPERAÇÃO
        if (!string.IsNullOrWhiteSpace(ctx.Rule.AdditionalNotes))
        {
            distinctRuleNotes.Add(ctx.Rule.AdditionalNotes.Trim());
        }

        foreach (var item in ctx.Items)
        {
            var ncm = string.IsNullOrWhiteSpace(item.Product.Ncm) ? "00000000" : Regex.Replace(item.Product.Ncm, @"\D", "");
            var cest = ObterCestProduto(item.Product);
            var origem = ObterOrigemProduto(item.Product);
            var cEan = string.IsNullOrWhiteSpace(item.Product.BaseBarcode) ? "SEM GTIN" : item.Product.BaseBarcode.Trim();

            var taxParams = ResolverParametrosItem(ctx.Rule, ctx.Identificacao.DestState, ncm, origem);
            var cfopStr = ctx.Identificacao.IsInterstate ? taxParams.CfopInterstate : taxParams.CfopStateInternal;

            bool isRetornoArmazemOuInsumo = cfopStr is "5906" or "6906" or "5907" or "6907"
                                                   or "5902" or "6902" or "5903" or "6903"
                                                   or "5921" or "6921"
                                         || ctx.Rule.CfopStateInternal is "5906" or "5907" or "5902" or "5903" or "5921";

            decimal vUnCom = isRetornoArmazemOuInsumo
                ? (item.InboundUnitValue > 0 ? item.InboundUnitValue : item.UnitValue)
                : (item.UnitValue > 0 ? item.UnitValue : item.InboundUnitValue);

            var valorTotalItem = Math.Round(item.Quantity * vUnCom, 2);

            var prod = new prod
            {
                cProd = item.Product.Sku,
                cEAN = cEan,
                xProd = item.Product.Description,
                NCM = ncm,
                CEST = cest,
                CFOP = int.Parse(cfopStr),
                uCom = item.Product.BaseUnit ?? "UN",
                qCom = item.Quantity,
                vUnCom = vUnCom,
                vProd = valorTotalItem,
                cEANTrib = cEan,
                uTrib = item.Product.BaseUnit ?? "UN",
                qTrib = item.Quantity,
                vUnTrib = vUnCom,
                indTot = IndicadorTotal.ValorDoItemCompoeTotalNF
            };

            var xPedVal = item.XPed ?? ctx.Order?.OrderNumber;
            if (!string.IsNullOrWhiteSpace(xPedVal))
            {
                var cleanXPed = xPedVal.Trim();
                prod.xPed = cleanXPed.Length > 15 ? cleanXPed[..15] : cleanXPed;
            }

            var nItemPedVal = item.NItemPed ?? item.LineNumber;
            if (nItemPedVal > 0 && nItemPedVal <= 999999)
            {
                prod.nItemPed = nItemPedVal;
            }

            // RASTREABILIDADE (<rastro> e infAdProd)
            var rastroList = new List<rastro>();
            var itemComplementNotes = new List<string>();

            // 1. REPLICA INFORMAÇÕES COMPLEMENTARES ORIGINAIS DA ENTRADA
            if (!string.IsNullOrWhiteSpace(item.OriginalInboundInfAdProd))
            {
                itemComplementNotes.Add(item.OriginalInboundInfAdProd.Trim());
            }

            // 2. INCLUSÃO DO NÚMERO DA NF-E DE REMESSA NO ITEM
            if (!string.IsNullOrWhiteSpace(item.InboundInvoiceNumber))
            {
                itemComplementNotes.Add($"NF-e: {item.InboundInvoiceNumber.Trim()}");
            }

            // 3. LOTES
            foreach (var b in item.Batches)
            {
                bool hasFullDates = b.ManufactureDate.HasValue && b.ExpirationDate.HasValue;

                if (hasFullDates)
                {
                    rastroList.Add(new rastro
                    {
                        nLote = b.Batch,
                        qLote = b.Quantity,
                        dFab = b.ManufactureDate!.Value.Date,
                        dVal = b.ExpirationDate!.Value.Date
                    });
                }
                else
                {
                    itemComplementNotes.Add($"Lote: {b.Batch.ToString()}");
                }
            }

            if (rastroList.Any())
            {
                prod.rastro = rastroList;
            }

            var det = new det
            {
                nItem = nItem++,
                prod = prod,
                imposto = BuildImpostos(taxParams, valorTotalItem, companyCrt, origem)
            };

            if (itemComplementNotes.Any())
            {
                det.infAdProd = string.Join(" | ", itemComplementNotes);
            }

            nfe.infNFe.det.Add(det);

            // Coleta a observação da exceção específica sem duplicar
            if (!string.IsNullOrWhiteSpace(taxParams.AdditionalNotes))
            {
                distinctRuleNotes.Add(taxParams.AdditionalNotes.Trim());
            }
        }

        // MONTAGEM DAS OBSERVAÇÕES COMPLEMENTARES GERAIS (infCpl)
        var finalNotesParts = new List<string>();

        // 1. Solicitante da Ordem
        if (!string.IsNullOrWhiteSpace(ctx.Order?.RequestedBy))
        {
            finalNotesParts.Add($"Solicitante da Ordem: {ctx.Order.RequestedBy.Trim()}.");
        }

        // 2. Observações da Natureza de Operação e Exceções Fiscais
        foreach (var ruleNote in distinctRuleNotes)
        {
            if (string.IsNullOrWhiteSpace(ctx.AdditionalNotes) || !ctx.AdditionalNotes.Contains(ruleNote, StringComparison.OrdinalIgnoreCase))
            {
                finalNotesParts.Add(ruleNote);
            }
        }

        // 3. Observações adicionais do pedido ou informadas na tela de revisão
        if (!string.IsNullOrWhiteSpace(ctx.AdditionalNotes))
        {
            finalNotesParts.Add(ctx.AdditionalNotes.Trim());
        }

        if (finalNotesParts.Any())
        {
            nfe.infNFe.infAdic ??= new NFe.Classes.Informacoes.Observacoes.infAdic();
            nfe.infNFe.infAdic.infCpl = string.Join(" ", finalNotesParts).Trim();
        }

        CalcularTotaisNfe(nfe);
        ConfigurarCobrancaEPagamento(nfe, ctx);

        return nfe;
    }

    private static ide BuildIde(NfeBuildContext ctx)
    {
        var companyState = !string.IsNullOrWhiteSpace(ctx.Company.State) ? ctx.Company.State.Trim().ToUpper() : "RS";
        if (!Enum.TryParse<DFe.Classes.Entidades.Estado>(companyState, out var ufEnum))
            ufEnum = DFe.Classes.Entidades.Estado.RS;

        var natOpDesc = ctx.Rule.Description?.Trim() ?? "OPERACAO FISCAL";
        if (natOpDesc.Length > 60)
        {
            natOpDesc = natOpDesc[..60].Trim();
        }

        var ide = new ide
        {
            cUF = ufEnum,
            cNF = new Random().Next(10000000, 99999999).ToString("D8"),
            natOp = natOpDesc,
            mod = ModeloDocumento.NFe,
            serie = ctx.Identificacao.Serie,
            nNF = ctx.Identificacao.Number,
            dhEmi = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(-3)),
            tpNF = TipoNFe.tnSaida,
            idDest = ctx.Identificacao.IsInterstate ? DestinoOperacao.doInterestadual : DestinoOperacao.doInterna,
            cMunFG = ctx.Company.CityCode > 0 ? ctx.Company.CityCode : 4305108,
            tpImp = (TipoImpressao)ctx.Identificacao.TpImp,
            tpEmis = TipoEmissao.teNormal,
            tpAmb = ctx.Company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
            finNFe = ObterFinalidadeZeus(ctx.Rule.Finalidade),
            indFinal = (ConsumidorFinal)ctx.Identificacao.IndFinal,
            indPres = (PresencaComprador)ctx.Identificacao.IndPres,
            indIntermed = IndicadorIntermediador.iiSemIntermediador,
            procEmi = ProcessoEmissao.peAplicativoContribuinte,
            verProc = "CoreWMS 1.0"
        };

        if (ctx.Company.Environment == 1 && ctx.Identificacao.OriginAccessKeys.Any())
        {
            ide.NFref = new List<NFref>();
            foreach (var key in ctx.Identificacao.OriginAccessKeys.Where(k => !string.IsNullOrWhiteSpace(k)))
            {
                ide.NFref.Add(new NFref { refNFe = key.Trim() });
            }
        }

        return ide;
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

    private static dest BuildDestinatario(NfeDestinatarioData data, int environment)
    {
        string name = data.Name.Trim();
        if (environment != 1)
            name = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

        indIEDest indIe = data.IeIndicator switch
        {
            1 => indIEDest.ContribuinteICMS,
            2 => indIEDest.Isento,
            _ => indIEDest.NaoContribuinte
        };

        var d = new dest(VersaoServico.Versao400)
        {
            xNome = name,
            IE = !string.IsNullOrWhiteSpace(data.StateRegistration) ? data.StateRegistration.Trim() : null,
            indIEDest = indIe,
            enderDest = new enderDest
            {
                xLgr = data.Street.Trim(),
                nro = data.Number.Trim(),
                xCpl = data.Complement?.Trim(),
                xBairro = data.Neighborhood.Trim(),
                cMun = data.CityCode,
                xMun = data.City.Trim(),
                UF = data.State.Trim().ToUpper(),
                CEP = data.ZipCode.Trim(),
                cPais = 1058,
                xPais = "BRASIL"
            }
        };

        if (!string.IsNullOrWhiteSpace(data.CnpjCpf))
        {
            var cleanDoc = Regex.Replace(data.CnpjCpf, @"\D", "");
            if (cleanDoc.Length == 14) d.CNPJ = cleanDoc;
            else if (cleanDoc.Length == 11) d.CPF = cleanDoc;
        }

        return d;
    }

    private static transp BuildTransporte(NfeTransporteData data)
    {
        ModalidadeFrete modFrete = data.FreightModality switch
        {
            0 => ModalidadeFrete.mfContaEmitenteOumfContaRemetente,
            1 => ModalidadeFrete.mfContaDestinatario,
            2 => ModalidadeFrete.mfContaTerceiros,
            3 => ModalidadeFrete.mfProprioContaRemente,
            4 => ModalidadeFrete.mfProprioContaDestinatario,
            _ => ModalidadeFrete.mfSemFrete
        };

        var t = new transp { modFrete = modFrete };

        if (modFrete == ModalidadeFrete.mfSemFrete)
        {
            return t;
        }

        if (!string.IsNullOrWhiteSpace(data.CarrierCnpjCpf) || !string.IsNullOrWhiteSpace(data.CarrierName))
        {
            t.transporta = new transporta
            {
                xNome = data.CarrierName?.Trim(),
                IE = !string.IsNullOrWhiteSpace(data.CarrierStateRegistration) ? data.CarrierStateRegistration.Trim() : null,
                xEnder = !string.IsNullOrWhiteSpace(data.CarrierAddress) ? data.CarrierAddress.Trim() : null,
                xMun = !string.IsNullOrWhiteSpace(data.CarrierCity) ? data.CarrierCity.Trim() : null,
                UF = !string.IsNullOrWhiteSpace(data.CarrierState) ? data.CarrierState.Trim().ToUpper() : null
            };

            if (!string.IsNullOrWhiteSpace(data.CarrierCnpjCpf))
            {
                var cleanCnpj = Regex.Replace(data.CarrierCnpjCpf, @"\D", "");
                if (cleanCnpj.Length == 14) t.transporta.CNPJ = cleanCnpj;
                else if (cleanCnpj.Length == 11) t.transporta.CPF = cleanCnpj;
            }
        }

        if (!string.IsNullOrWhiteSpace(data.VehiclePlate))
        {
            t.veicTransp = new veicTransp
            {
                placa = data.VehiclePlate.Trim().ToUpper(),
                UF = !string.IsNullOrWhiteSpace(data.VehiclePlateState) ? data.VehiclePlateState.Trim().ToUpper() : "RS"
            };
        }

        t.vol = new List<vol>
        {
            new vol
            {
                qVol = data.QuantidadeVolumes,
                esp = data.Especie,
                pesoL = data.PesoLiquido,
                pesoB = data.PesoBruto
            }
        };

        return t;
    }

    private static void ConfigurarCobrancaEPagamento(NFe.Classes.NFe nfe, NfeBuildContext ctx)
    {
        var totalVNF = nfe.infNFe.total.ICMSTot.vNF;
        var pay = ctx.Payment;

        bool isNonFinancialOperation = pay == null && ctx.Items.All(i =>
            i.Product.Ncm != null && (
                ctx.Rule.CfopStateInternal is "5906" or "5907" or "5902" or "5903" or "5921" or "5923" ||
                ctx.Rule.CfopInterstate is "6906" or "6907" or "6902" or "6903" or "6921" or "6923"
            )
        );

        bool gerarCobranca = (pay?.GerarCobranca == true) || (!isNonFinancialOperation && pay?.Duplicatas?.Any() == true);

        if (gerarCobranca && pay?.Duplicatas?.Any() == true)
        {
            nfe.infNFe.cobr = new cobr
            {
                fat = new fat
                {
                    nFat = !string.IsNullOrWhiteSpace(pay.NumeroFatura) ? pay.NumeroFatura.Trim() : nfe.infNFe.ide.nNF.ToString(),
                    vOrig = pay.ValorOriginalFatura ?? totalVNF,
                    vDesc = pay.ValorDescontoFatura ?? 0m,
                    vLiq = pay.ValorLiquidoFatura ?? totalVNF
                },
                dup = pay.Duplicatas.Select(d => new dup
                {
                    nDup = d.Numero.Trim(),
                    dVenc = d.DataVencimento.Date,
                    vDup = d.Valor
                }).ToList()
            };
        }

        if (isNonFinancialOperation || (pay != null && pay.FormaPagamento == FormaPagamento.fpSemPagamento))
        {
            nfe.infNFe.pag = new List<pag>
            {
                new pag
                {
                    detPag = new List<detPag>
                    {
                        new detPag
                        {
                            tPag = FormaPagamento.fpSemPagamento,
                            vPag = 0m
                        }
                    }
                }
            };
        }
        else
        {
            var tPag = pay?.FormaPagamento ?? (gerarCobranca ? FormaPagamento.fpDuplicataMercantil : FormaPagamento.fpBoletoBancario);
            var indPag = pay?.IndicadorPagamentoDetalhePagamento ?? (gerarCobranca ? IndicadorPagamentoDetalhePagamento.ipDetPgPrazo : IndicadorPagamentoDetalhePagamento.ipDetPgVista);
            var vPag = pay?.ValorLiquidoFatura ?? totalVNF;

            nfe.infNFe.pag = new List<pag>
            {
                new pag
                {
                    detPag = new List<detPag>
                    {
                        new detPag
                        {
                            indPag = indPag,
                            tPag = tPag,
                            vPag = vPag
                        }
                    }
                }
            };
        }

        nfe.infNFe.infRespTec = new Shared.NFe.Classes.Informacoes.InfRespTec.infRespTec
        {
            CNPJ = "64615275000112",
            xContato = "CoreWMS - Eder Gross Cichelero",
            email = "suporte@corewms.com.br",
            fone = "54992221877"
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

            string cClassTrib = !string.IsNullOrWhiteSpace(p.ClassificacaoTributaria)
                ? p.ClassificacaoTributaria.Trim()
                : (rawIbs == "000" ? "000001" : "410999");

            bool exigeCalculoIbsCbs = rawIbs is not ("410" or "400" or "500");
            gIBSCBS? gIbsCbs = null;

            if (exigeCalculoIbsCbs)
            {
                var aliqIbs = p.AliqIbs > 0 ? p.AliqIbs : 0.10m;
                var aliqCbs = p.AliqCbs > 0 ? p.AliqCbs : 0.90m;
                var vIbsUf = Math.Round(valorTotalItem * (aliqIbs / 100m), 2);
                var vCbs = Math.Round(valorTotalItem * (aliqCbs / 100m), 2);

                gIbsCbs = new gIBSCBS
                {
                    vBC = valorTotalItem,
                    gIBSUF = new gIBSUF { pIBSUF = aliqIbs, vIBSUF = vIbsUf },
                    gIBSMun = new gIBSMun { pIBSMun = 0, vIBSMun = 0 },
                    gCBS = new gCBS { pCBS = aliqCbs, vCBS = vCbs },
                    vIBS = vIbsUf
                };
            }

            impostos.IBSCBS = new IBSCBS
            {
                CST = parsedCst,
                cClassTrib = cClassTrib,
                gIBSCBS = gIbsCbs
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

        var totalVBCIbsCbs = temReformaTributaria
            ? nfe.infNFe.det.Where(d => d.imposto?.IBSCBS?.gIBSCBS != null).Sum(d => d.imposto!.IBSCBS!.gIBSCBS!.vBC)
            : 0m;

        var totalVIbs = temReformaTributaria
            ? nfe.infNFe.det.Where(d => d.imposto?.IBSCBS?.gIBSCBS?.gIBSUF != null).Sum(d => d.imposto!.IBSCBS!.gIBSCBS!.gIBSUF.vIBSUF)
            : 0m;

        var totalVCbs = temReformaTributaria
            ? nfe.infNFe.det.Where(d => d.imposto?.IBSCBS?.gIBSCBS?.gCBS != null).Sum(d => d.imposto!.IBSCBS!.gIBSCBS!.gCBS.vCBS)
            : 0m;

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
                vBCIBSCBS = Math.Round(totalVBCIbsCbs, 2),
                gIBS = new gIBSTotal
                {
                    gIBSUF = new gIBSUFTotal { vDif = 0, vDevTrib = 0, vIBSUF = Math.Round(totalVIbs, 2) },
                    gIBSMun = new gIBSMunTotal { vDif = 0, vDevTrib = 0, vIBSMun = 0 },
                    vIBS = Math.Round(totalVIbs, 2),
                    vCredPres = 0,
                    vCredPresCondSus = 0
                },
                gCBS = new gCBSTotal
                {
                    vDif = 0,
                    vDevTrib = 0,
                    vCBS = Math.Round(totalVCbs, 2),
                    vCredPres = 0,
                    vCredPresCondSus = 0
                }
            } : null
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

        string? additionalNotes = !string.IsNullOrWhiteSpace(matchedException?.AdditionalNotes)
            ? matchedException.AdditionalNotes
            : baseRule.AdditionalNotes;

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
            AdditionalNotes = additionalNotes
        };
    }

    private static OrigemMercadoria ObterOrigemProduto(object? product)
    {
        if (product == null) return OrigemMercadoria.OmNacional;
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

    private record NfeBatchTraceDto(
        string Batch,
        decimal Quantity,
        DateTime? ManufactureDate,
        DateTime? ExpirationDate
    );

    private record NfeCanonicalItem(
        Features.Products.Entities.Product Product,
        decimal Quantity,
        decimal UnitValue,
        decimal InboundUnitValue,
        int LineNumber,
        string? XPed,
        int? NItemPed,
        string? InboundInvoiceNumber,
        string? OriginalInboundInfAdProd,
        List<NfeBatchTraceDto> Batches
    );

    private record NfeDestinatarioData(
        string Name,
        string? CnpjCpf,
        string? StateRegistration,
        int IeIndicator,
        string Street,
        string Number,
        string? Complement,
        string Neighborhood,
        int CityCode,
        string City,
        string State,
        string ZipCode
    );

    private record NfeIdentificacaoData(
        int Number,
        int Serie,
        string DestState,
        bool IsInterstate,
        int IndFinal,
        int IndPres,
        int TpImp,
        List<string> OriginAccessKeys
    );

    private record NfeTransporteData(
        int FreightModality,
        string? CarrierCnpjCpf,
        string? CarrierName,
        string? CarrierStateRegistration,
        string? CarrierAddress,
        string? CarrierCity,
        string? CarrierState,
        string? VehiclePlate,
        string? VehiclePlateState,
        int QuantidadeVolumes,
        string Especie,
        decimal PesoLiquido,
        decimal PesoBruto
    );

    private record NfeBuildContext(
        Company Company,
        FiscalOperationRule Rule,
        OutboundOrder? Order,
        NfePaymentInput? Payment,
        NfeDestinatarioData Destinatario,
        NfeIdentificacaoData Identificacao,
        NfeTransporteData Transporte,
        List<NfeCanonicalItem> Items,
        string? AdditionalNotes
    );

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