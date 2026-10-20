using System.Text.RegularExpressions;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Utils;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NFe.Classes;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Estadual;
using NFe.Classes.Informacoes.Detalhe.Tributacao.Federal;
using NFe.Classes.Informacoes.Transporte;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record FiscalDocItemDetailDto(
    int NumeroItem,
    string CodigoProduto,
    string? Ean,
    string Descricao,
    string Ncm,
    string? Cest,
    string Cfop,
    string Unidade,
    decimal Quantidade,
    decimal ValorUnitario,
    decimal ValorTotal,
    string? NumeroPedido,
    int? ItemPedido,
    string? Lote,
    DateTime? DataFabricacao,
    DateTime? DataValidade,
    string? InfAdProd,
    string? CstIcms,
    decimal? AliqIcms,
    decimal? BaseIcms,
    decimal? ValorIcms,
    string? CstIpi,
    decimal? AliqIpi,
    decimal? ValorIpi,
    string? CstPis,
    decimal? AliqPis,
    decimal? ValorPis,
    string? CstCofins,
    decimal? AliqCofins,
    decimal? ValorCofins,
    string? CstIbsCbs,
    string? ClassTrib
);

public record FiscalDocDuplicataDto(
    string Numero,
    DateTime? Vencimento,
    decimal Valor
);

public record FiscalDocPagamentoDto(
    int Forma,
    string FormaDescricao,
    decimal Valor,
    int IndicadorPagamento
);

public record FiscalDocFullDetailDto(
    Guid Id,
    Guid? OutboundOrderId,
    string? OutboundOrderNumber,
    int Type,
    string TypeDescription,
    string Status,
    string? AccessKey,
    string? Protocol,
    string? ReturnMessage,
    DateTime CreatedAt,
    string Environment,

    // Identificação
    long? NumeroNf,
    int? SerieNf,
    string? NaturezaOperacao,
    DateTime? DataEmissao,
    int? Modelo,
    string? TipoOperacao,
    string? DestinoOperacao,
    string? Finalidade,
    int? ConsumidorFinal,
    int? PresencaComprador,
    int? FormatoImpressao,

    // Emitente
    string? EmitenteCnpjCpf,
    string? EmitenteNome,
    string? EmitenteFantasia,
    string? EmitenteIe,
    int? EmitenteCrt,
    string? EmitenteEndereco,
    string? EmitenteMunicipio,
    string? EmitenteUf,
    string? EmitenteCep,
    string? EmitenteTelefone,

    // Destinatário
    string? DestinatarioCnpjCpf,
    string? DestinatarioNome,
    string? DestinatarioIe,
    int? DestinatarioIndIe,
    string? DestinatarioEndereco,
    string? DestinatarioMunicipio,
    string? DestinatarioUf,
    string? DestinatarioCep,

    // Transporte
    int? ModalidadeFrete,
    string? ModalidadeFreteDescricao,
    string? TransportadoraCnpjCpf,
    string? TransportadoraNome,
    string? TransportadoraIe,
    string? TransportadoraEndereco,
    string? TransportadoraMunicipio,
    string? TransportadoraUf,
    string? VeiculoPlaca,
    string? VeiculoUf,
    decimal? QuantidadeVolumes,
    string? EspecieVolumes,
    decimal? PesoLiquido,
    decimal? PesoBruto,

    // Totais
    decimal ValorProdutos,
    decimal BaseCalculoIcms,
    decimal ValorIcms,
    decimal BaseCalculoIcmsSt,
    decimal ValorIcmsSt,
    decimal ValorFrete,
    decimal ValorSeguro,
    decimal ValorDesconto,
    decimal ValorOutrasDespesas,
    decimal ValorIpi,
    decimal ValorPis,
    decimal ValorCofins,
    decimal ValorTotalNfe,
    decimal TotalIbs,
    decimal TotalCbs,

    // Fatura e Pagamento
    string? NumeroFatura,
    decimal? ValorOriginalFatura,
    decimal? ValorDescontoFatura,
    decimal? ValorLiquidoFatura,
    List<FiscalDocDuplicataDto> Duplicatas,
    List<FiscalDocPagamentoDto> Pagamentos,

    // Informações Adicionais
    string? InformacoesComplementares,
    string? InformacoesFisco,

    // Itens
    List<FiscalDocItemDetailDto> Itens,

    // Eventos SEFAZ
    List<LinkedFiscalEventDto> LinkedEvents
);

public record GetCompanyFiscalDocumentByIdQuery(Guid Id) : IRequest<IResult>;

public class GetCompanyFiscalDocumentByIdHandler : IRequestHandler<GetCompanyFiscalDocumentByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetCompanyFiscalDocumentByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetCompanyFiscalDocumentByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var doc = await _db.CompanyFiscalDocuments
            .AsNoTracking()
            .Include(d => d.Company)
            .Include(d => d.OutboundOrder)
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.CompanyId == companyId, ct);

        if (doc == null)
            return Results.NotFound(new { Message = "Documento fiscal não encontrado." });

        // Busca os eventos vinculados à mesma chave de acesso
        var linkedEvents = new List<LinkedFiscalEventDto>();
        if (!string.IsNullOrWhiteSpace(doc.AccessKey))
        {
            linkedEvents = await _db.CompanyFiscalDocuments
                .AsNoTracking()
                .Where(e => e.CompanyId == companyId && ((int)e.Type == 7 || (int)e.Type == 8) && e.AccessKey == doc.AccessKey)
                .OrderBy(e => e.CreatedAt)
                .Select(e => new LinkedFiscalEventDto(
                    e.Id,
                    (int)e.Type,
                    e.Type == FiscalDocumentType.Cancelamento ? "Cancelamento" : "Carta de Correção (CC-e)",
                    e.Status.ToString(),
                    e.Protocol,
                    e.ReturnMessage,
                    e.CreatedAt
                ))
                .ToListAsync(ct);
        }

        // Tenta desserializar o XML armazenado para obter a estrutura completa da NF-e
        NFe.Classes.NFe? nfe = null;
        if (!string.IsNullOrWhiteSpace(doc.RawXml))
        {
            try
            {
                var nfeProc = FuncoesXml.XmlStringParaClasse<nfeProc>(doc.RawXml);
                nfe = nfeProc?.NFe;
            }
            catch
            {
                try
                {
                    nfe = FuncoesXml.XmlStringParaClasse<NFe.Classes.NFe>(doc.RawXml);
                }
                catch { }
            }
        }

        // Se houver XML parsed, extrai todos os detalhes analíticos
        var inf = nfe?.infNFe;
        var ide = inf?.ide;
        var emit = inf?.emit;
        var dest = inf?.dest;
        var transp = inf?.transp;
        var total = inf?.total;
        var cobr = inf?.cobr;
        var pag = inf?.pag;

        // Extrai Itens
        var itensDto = new List<FiscalDocItemDetailDto>();
        if (inf?.det != null)
        {
            foreach (var det in inf.det)
            {
                var prod = det.prod;
                var imp = det.imposto;

                // ICMS
                string? cstIcms = null;
                decimal? aliqIcms = null;
                decimal? baseIcms = null;
                decimal? valorIcms = null;
                if (imp?.ICMS?.TipoICMS != null)
                {
                    var tipo = imp.ICMS.TipoICMS;
                    if (tipo is ICMS00 icms00) { cstIcms = "00"; aliqIcms = icms00.pICMS; baseIcms = icms00.vBC; valorIcms = icms00.vICMS; }
                    else if (tipo is ICMS10 icms10) { cstIcms = "10"; aliqIcms = icms10.pICMS; baseIcms = icms10.vBC; valorIcms = icms10.vICMS; }
                    else if (tipo is ICMS20 icms20) { cstIcms = "20"; aliqIcms = icms20.pICMS; baseIcms = icms20.vBC; valorIcms = icms20.vICMS; }
                    else if (tipo is ICMS40 icms40) { cstIcms = icms40.CST.ToString().Replace("Cst", ""); }
                    else if (tipo is ICMS51 icms51) { cstIcms = "51"; aliqIcms = icms51.pICMS; baseIcms = icms51.vBC; valorIcms = icms51.vICMS; }
                    else if (tipo is ICMS60) { cstIcms = "60"; }
                    else if (tipo is ICMS70 icms70) { cstIcms = "70"; aliqIcms = icms70.pICMS; baseIcms = icms70.vBC; valorIcms = icms70.vICMS; }
                    else if (tipo is ICMS90 icms90) { cstIcms = "90"; aliqIcms = icms90.pICMS; baseIcms = icms90.vBC; valorIcms = icms90.vICMS; }
                    else if (tipo is ICMSSN101 sn101) { cstIcms = "101"; aliqIcms = sn101.pCredSN; valorIcms = sn101.vCredICMSSN; }
                    else if (tipo is ICMSSN102 sn102) { cstIcms = ((int)sn102.CSOSN).ToString(); }
                    else if (tipo is ICMSSN500) { cstIcms = "500"; }
                    else if (tipo is ICMSSN900 sn900) { cstIcms = "900"; aliqIcms = sn900.pICMS; baseIcms = sn900.vBC; valorIcms = sn900.vICMS; }
                }

                // IPI
                string? cstIpi = null;
                decimal? aliqIpi = null;
                decimal? valorIpi = null;
                if (imp?.IPI?.TipoIPI is IPITrib ipiTrib)
                {
                    cstIpi = ipiTrib.CST.ToString().Replace("ipi", "");
                    aliqIpi = ipiTrib.pIPI;
                    valorIpi = ipiTrib.vIPI;
                }
                else if (imp?.IPI?.TipoIPI is IPINT ipiNt)
                {
                    cstIpi = ipiNt.CST.ToString().Replace("ipi", "");
                }

                // PIS
                string? cstPis = null;
                decimal? aliqPis = null;
                decimal? valorPis = null;
                if (imp?.PIS?.TipoPIS is PISAliq pisAliq) { cstPis = pisAliq.CST.ToString().Replace("pis", ""); aliqPis = pisAliq.pPIS; valorPis = pisAliq.vPIS; }
                else if (imp?.PIS?.TipoPIS is PISNT pisNt) { cstPis = pisNt.CST.ToString().Replace("pis", ""); }
                else if (imp?.PIS?.TipoPIS is PISOutr pisOutr) { cstPis = pisOutr.CST.ToString().Replace("pis", ""); aliqPis = pisOutr.pPIS; valorPis = pisOutr.vPIS; }

                // COFINS
                string? cstCofins = null;
                decimal? aliqCofins = null;
                decimal? valorCofins = null;
                if (imp?.COFINS?.TipoCOFINS is COFINSAliq cofAliq) { cstCofins = cofAliq.CST.ToString().Replace("cofins", ""); aliqCofins = cofAliq.pCOFINS; valorCofins = cofAliq.vCOFINS; }
                else if (imp?.COFINS?.TipoCOFINS is COFINSNT cofNt) { cstCofins = cofNt.CST.ToString().Replace("cofins", ""); }
                else if (imp?.COFINS?.TipoCOFINS is COFINSOutr cofOutr) { cstCofins = cofOutr.CST.ToString().Replace("cofins", ""); aliqCofins = cofOutr.pCOFINS; valorCofins = cofOutr.vCOFINS; }

                // Rastreabilidade
                var rastroFirst = prod?.rastro?.FirstOrDefault();

                itensDto.Add(new FiscalDocItemDetailDto(
                    NumeroItem: det.nItem,
                    CodigoProduto: prod?.cProd ?? "",
                    Ean: prod?.cEAN,
                    Descricao: prod?.xProd ?? "",
                    Ncm: prod?.NCM ?? "",
                    Cest: prod?.CEST,
                    Cfop: prod?.CFOP.ToString() ?? "",
                    Unidade: prod?.uCom ?? "UN",
                    Quantidade: prod?.qCom ?? 0m,
                    ValorUnitario: prod?.vUnCom ?? 0m,
                    ValorTotal: prod?.vProd ?? 0m,
                    NumeroPedido: prod?.xPed,
                    ItemPedido: prod?.nItemPed,
                    Lote: rastroFirst?.nLote,
                    DataFabricacao: rastroFirst?.dFab,
                    DataValidade: rastroFirst?.dVal,
                    InfAdProd: det.infAdProd,
                    CstIcms: cstIcms,
                    AliqIcms: aliqIcms,
                    BaseIcms: baseIcms,
                    ValorIcms: valorIcms,
                    CstIpi: cstIpi,
                    AliqIpi: aliqIpi,
                    ValorIpi: valorIpi,
                    CstPis: cstPis,
                    AliqPis: aliqPis,
                    ValorPis: valorPis,
                    CstCofins: cstCofins,
                    AliqCofins: aliqCofins,
                    ValorCofins: valorCofins,
                    CstIbsCbs: imp?.IBSCBS?.CST.ToString().Replace("cst", ""),
                    ClassTrib: imp?.IBSCBS?.cClassTrib
                ));
            }
        }

        // Duplicatas
        var duplicatasDto = cobr?.dup?.Select(d => new FiscalDocDuplicataDto(
            d.nDup,
            d.dVenc,
            d.vDup
        )).ToList() ?? new List<FiscalDocDuplicataDto>();

        // Pagamentos
        var pagamentosDto = pag?.SelectMany(p => p.detPag ?? new List<NFe.Classes.Informacoes.Pagamento.detPag>()).Select(dp => new FiscalDocPagamentoDto(
            (int)dp.tPag,
            dp.tPag.ToString(),
            dp.vPag,
            (int)(dp.indPag ?? 0)
        )).ToList() ?? new List<FiscalDocPagamentoDto>();

        // Resolução de Volumes e Transportadora
        var volFirst = transp?.vol?.FirstOrDefault();

        string modFreteDesc = transp?.modFrete switch
        {
            ModalidadeFrete.mfContaEmitenteOumfContaRemetente => "0 - Remetente (CIF)",
            ModalidadeFrete.mfContaDestinatario => "1 - Destinatário (FOB)",
            ModalidadeFrete.mfContaTerceiros => "2 - Terceiros",
            ModalidadeFrete.mfProprioContaRemente => "3 - Próprio Remetente",
            ModalidadeFrete.mfProprioContaDestinatario => "4 - Próprio Destinatário",
            _ => (doc.OutboundOrder?.FreightModality switch
            {
                0 => "0 - Remetente (CIF)",
                1 => "1 - Destinatário (FOB)",
                2 => "2 - Terceiros",
                3 => "3 - Próprio Remetente",
                4 => "4 - Próprio Destinatário",
                _ => "9 - Sem Frete"
            })
        };

        var dto = new FiscalDocFullDetailDto(
            Id: doc.Id,
            OutboundOrderId: doc.OutboundOrderId,
            OutboundOrderNumber: doc.OutboundOrder?.OrderNumber,
            Type: (int)doc.Type,
            TypeDescription: ObterDescricaoTipo(doc.Type),
            Status: doc.Status.ToString(),
            AccessKey: doc.AccessKey,
            Protocol: doc.Protocol,
            ReturnMessage: doc.ReturnMessage,
            CreatedAt: doc.CreatedAt,
            Environment: (doc.Company?.Environment == 1) ? "Produção" : "Homologação",

            NumeroNf: ide?.nNF,
            SerieNf: ide?.serie,
            NaturezaOperacao: ide?.natOp ?? "RETORNO DE MERCADORIA",
            DataEmissao: ide?.dhEmi.DateTime,
            Modelo: (int?)ide?.mod,
            TipoOperacao: ide?.tpNF == NFe.Classes.Informacoes.Identificacao.Tipos.TipoNFe.tnSaida ? "1 - Saída" : "0 - Entrada",
            DestinoOperacao: ide?.idDest.ToString(),
            Finalidade: ide?.finNFe.ToString(),
            ConsumidorFinal: (int?)ide?.indFinal,
            PresencaComprador: (int?)ide?.indPres,
            FormatoImpressao: (int?)ide?.tpImp,

            EmitenteCnpjCpf: emit?.CNPJ ?? emit?.CPF ?? doc.Company?.Cnpj,
            EmitenteNome: emit?.xNome ?? doc.Company?.CorporateName,
            EmitenteFantasia: emit?.xFant ?? doc.Company?.TradeName,
            EmitenteIe: emit?.IE ?? doc.Company?.StateRegistration,
            EmitenteCrt: (int?)emit?.CRT ?? doc.Company?.Crt,
            EmitenteEndereco: emit?.enderEmit != null ? $"{emit.enderEmit.xLgr}, {emit.enderEmit.nro} {emit.enderEmit.xCpl}" : doc.Company?.Street,
            EmitenteMunicipio: emit?.enderEmit?.xMun ?? doc.Company?.CityName,
            EmitenteUf: emit?.enderEmit?.UF.ToString() ?? doc.Company?.State,
            EmitenteCep: emit?.enderEmit?.CEP ?? doc.Company?.ZipCode,
            EmitenteTelefone: emit?.enderEmit?.fone?.ToString() ?? doc.Company?.Phone,

            DestinatarioCnpjCpf: dest?.CNPJ ?? dest?.CPF ?? doc.OutboundOrder?.DestinationCnpjCpf,
            DestinatarioNome: dest?.xNome ?? doc.OutboundOrder?.DestinationName,
            DestinatarioIe: dest?.IE ?? doc.OutboundOrder?.DestinationStateRegistration,
            DestinatarioIndIe: (int?)dest?.indIEDest ?? doc.OutboundOrder?.DestinationIeIndicator,
            DestinatarioEndereco: dest?.enderDest != null ? $"{dest.enderDest.xLgr}, {dest.enderDest.nro} {dest.enderDest.xCpl}" : doc.OutboundOrder?.DestinationStreet,
            DestinatarioMunicipio: dest?.enderDest?.xMun ?? doc.OutboundOrder?.DestinationCity,
            DestinatarioUf: dest?.enderDest?.UF ?? doc.OutboundOrder?.DestinationState,
            DestinatarioCep: dest?.enderDest?.CEP ?? doc.OutboundOrder?.DestinationZipCode,

            ModalidadeFrete: (int?)transp?.modFrete ?? doc.OutboundOrder?.FreightModality,
            ModalidadeFreteDescricao: modFreteDesc,
            TransportadoraCnpjCpf: transp?.transporta?.CNPJ ?? transp?.transporta?.CPF ?? doc.OutboundOrder?.CarrierCnpjCpf,
            TransportadoraNome: transp?.transporta?.xNome ?? doc.OutboundOrder?.CarrierName,
            TransportadoraIe: transp?.transporta?.IE ?? doc.OutboundOrder?.CarrierStateRegistration,
            TransportadoraEndereco: transp?.transporta?.xEnder ?? doc.OutboundOrder?.CarrierAddress,
            TransportadoraMunicipio: transp?.transporta?.xMun ?? doc.OutboundOrder?.CarrierCity,
            TransportadoraUf: transp?.transporta?.UF ?? doc.OutboundOrder?.CarrierState,
            VeiculoPlaca: transp?.veicTransp?.placa ?? doc.OutboundOrder?.VehiclePlate,
            VeiculoUf: transp?.veicTransp?.UF ?? doc.OutboundOrder?.VehiclePlateState,
            QuantidadeVolumes: volFirst?.qVol ?? 0,
            EspecieVolumes: volFirst?.esp ?? "VOLUMES",
            PesoLiquido: volFirst?.pesoL ?? 0m,
            PesoBruto: volFirst?.pesoB ?? 0m,

            ValorProdutos: total?.ICMSTot?.vProd ?? 0m,
            BaseCalculoIcms: total?.ICMSTot?.vBC ?? 0m,
            ValorIcms: total?.ICMSTot?.vICMS ?? 0m,
            BaseCalculoIcmsSt: total?.ICMSTot?.vBCST ?? 0m,
            ValorIcmsSt: total?.ICMSTot?.vST ?? 0m,
            ValorFrete: total?.ICMSTot?.vFrete ?? 0m,
            ValorSeguro: total?.ICMSTot?.vSeg ?? 0m,
            ValorDesconto: total?.ICMSTot?.vDesc ?? 0m,
            ValorOutrasDespesas: total?.ICMSTot?.vOutro ?? 0m,
            ValorIpi: total?.ICMSTot?.vIPI ?? 0m,
            ValorPis: total?.ICMSTot?.vPIS ?? 0m,
            ValorCofins: total?.ICMSTot?.vCOFINS ?? 0m,
            ValorTotalNfe: total?.ICMSTot?.vNF ?? 0m,
            TotalIbs: total?.IBSCBSTot?.gIBS?.vIBS ?? 0m,
            TotalCbs: total?.IBSCBSTot?.gCBS?.vCBS ?? 0m,

            NumeroFatura: cobr?.fat?.nFat,
            ValorOriginalFatura: cobr?.fat?.vOrig,
            ValorDescontoFatura: cobr?.fat?.vDesc,
            ValorLiquidoFatura: cobr?.fat?.vLiq,
            Duplicatas: duplicatasDto,
            Pagamentos: pagamentosDto,

            InformacoesComplementares: inf?.infAdic?.infCpl ?? doc.OutboundOrder?.AdditionalNotes,
            InformacoesFisco: inf?.infAdic?.infAdFisco,

            Itens: itensDto,
            LinkedEvents: linkedEvents
        );

        return Results.Ok(dto);
    }

    private static string ObterDescricaoTipo(FiscalDocumentType tipo)
    {
        return tipo switch
        {
            FiscalDocumentType.Normal => "1 - NF-e Normal",
            FiscalDocumentType.Complementar => "2 - NF-e Complementar",
            FiscalDocumentType.Ajuste => "3 - NF-e Ajuste",
            FiscalDocumentType.Devolucao => "4 - Devolução / Retorno",
            FiscalDocumentType.NotaCredito => "5 - Nota de Crédito (RT)",
            FiscalDocumentType.NotaDebito => "6 - Nota de Débito (RT)",
            FiscalDocumentType.Cancelamento => "7 - Cancelamento",
            FiscalDocumentType.CartaCorrecao => "8 - Carta de Correção",
            _ => tipo.ToString()
        };
    }
}

public static class GetCompanyFiscalDocumentByIdEndpoints
{
    public static void MapGetCompanyFiscalDocumentByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/fiscal/documents/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetCompanyFiscalDocumentByIdQuery(id)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.View);
    }
}