using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using CoreWMS.Api.Infrastructure.Fiscal.Emissao;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Classes.Flags;
using DFe.Utils;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using NFe.Classes.Informacoes.Pagamento;
using NFe.Classes.Informacoes.Identificacao.Tipos;
using NFe.Classes.Servicos.Tipos;
using NFe.Servicos;
using NFe.Utils.NFe;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record StandaloneNfeItemCommand(
    Guid ProductId,
    decimal Quantity,
    decimal UnitValue,
    string? Batch = null,
    DateTime? ManufactureDate = null,
    DateTime? ExpirationDate = null,
    string? XPed = null,
    int? NItemPed = null
);

public record StandaloneNfeDuplicataCommand(
    string Numero,
    DateTime DataVencimento,
    decimal Valor
);

public record StandaloneNfePaymentCommand(
    bool GerarCobranca,
    int FormaPagamento = 15,
    int IndicadorPagamento = 1,
    string? NumeroFatura = null,
    decimal? ValorOriginalFatura = null,
    decimal? ValorDescontoFatura = null,
    decimal? ValorLiquidoFatura = null,
    List<StandaloneNfeDuplicataCommand>? Duplicatas = null
);

public record EmitStandaloneNfeCommand(
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
    int IndFinal,
    int IndPres,
    int TpImp,
    string? AdditionalNotes,
    List<StandaloneNfeItemCommand> Items,
    int FreightModality = 9,
    string? CarrierCnpjCpf = null,
    string? CarrierName = null,
    string? CarrierStateRegistration = null,
    string? CarrierAddress = null,
    string? CarrierCity = null,
    string? CarrierState = null,
    string? VehiclePlate = null,
    string? VehiclePlateState = null,
    StandaloneNfePaymentCommand? Payment = null,
    List<string>? ReferencedAccessKeys = null
) : IRequest<IResult>;

public class EmitStandaloneNfeCommandValidator : AbstractValidator<EmitStandaloneNfeCommand>
{
    public EmitStandaloneNfeCommandValidator()
    {
        RuleFor(x => x.FiscalRuleId).NotEmpty().WithMessage("A regra fiscal (Natureza de Operação) é obrigatória.");
        RuleFor(x => x.DestinationName).NotEmpty().WithMessage("A razão social/nome do destinatário é obrigatório.");
        RuleFor(x => x.DestinationCnpjCpf).NotEmpty().WithMessage("O CNPJ/CPF do destinatário é obrigatório.");
        RuleFor(x => x.DestinationStreet).NotEmpty().WithMessage("O logradouro do destinatário é obrigatório.");
        RuleFor(x => x.DestinationCity).NotEmpty().WithMessage("A cidade do destinatário é obrigatória.");
        RuleFor(x => x.DestinationState).NotEmpty().Length(2).WithMessage("A UF do destinatário deve conter 2 letras.");
        RuleFor(x => x.Items).NotEmpty().WithMessage("Informe ao menos um produto para emitir a nota fiscal avulsa.");
        RuleForEach(x => x.Items).ChildRules(i =>
        {
            i.RuleFor(x => x.ProductId).NotEmpty().WithMessage("O identificador do produto é obrigatório.");
            i.RuleFor(x => x.Quantity).GreaterThan(0).WithMessage("A quantidade deve ser maior que zero.");
            i.RuleFor(x => x.UnitValue).GreaterThanOrEqualTo(0).WithMessage("O valor unitário não pode ser negativo.");
        });

        When(x => x.Payment != null && x.Payment.GerarCobranca, () =>
        {
            RuleFor(x => x.Payment!.Duplicatas)
                .NotEmpty().WithMessage("Quando houver cobrança/fatura gerada, informe ao menos uma duplicata.");
        });
    }
}

public class EmitStandaloneNfeHandler : IRequestHandler<EmitStandaloneNfeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IZeusConfigurator _zeusConfigurator;
    private readonly NfeBuilderService _builder;

    public EmitStandaloneNfeHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IZeusConfigurator zeusConfigurator,
        NfeBuilderService builder)
    {
        _db = db;
        _tenant = tenant;
        _zeusConfigurator = zeusConfigurator;
        _builder = builder;
    }

    public async Task<IResult> Handle(EmitStandaloneNfeCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (request.Items == null || !request.Items.Any())
            return Results.BadRequest(new { Message = "Informe ao menos um produto para emitir a nota fiscal avulsa." });

        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa emitente não encontrada." });

        if (company.CertificateBytes == null || company.CertificateBytes.Length == 0)
            return Results.BadRequest(new { Message = "Certificado Digital A1 não cadastrado para esta empresa." });

        NfePaymentInput? paymentInput = null;
        if (request.Payment != null)
        {
            var formaPagamento = Enum.IsDefined(typeof(FormaPagamento), request.Payment.FormaPagamento)
                ? (FormaPagamento)request.Payment.FormaPagamento
                : FormaPagamento.fpSemPagamento;

            var indPag = Enum.IsDefined(typeof(IndicadorPagamentoDetalhePagamento), request.Payment.IndicadorPagamento)
                ? (IndicadorPagamentoDetalhePagamento)request.Payment.IndicadorPagamento
                : IndicadorPagamentoDetalhePagamento.ipDetPgVista;

            var duplicatas = request.Payment.Duplicatas?.Select(d => new NfeDuplicataInput(
                d.Numero,
                d.DataVencimento,
                d.Valor
            )).ToList();

            paymentInput = new NfePaymentInput(
                request.Payment.GerarCobranca,
                formaPagamento,
                indPag,
                request.Payment.NumeroFatura,
                request.Payment.ValorOriginalFatura,
                request.Payment.ValorDescontoFatura,
                request.Payment.ValorLiquidoFatura,
                duplicatas
            );
        }

        var builderInput = new StandaloneNfeInput(
            CompanyId: companyId,
            FiscalRuleId: request.FiscalRuleId,
            DestinationName: request.DestinationName,
            DestinationCnpjCpf: request.DestinationCnpjCpf,
            DestinationStateRegistration: request.DestinationStateRegistration,
            DestinationIeIndicator: request.DestinationIeIndicator,
            DestinationStreet: request.DestinationStreet,
            DestinationNumber: request.DestinationNumber,
            DestinationComplement: request.DestinationComplement,
            DestinationNeighborhood: request.DestinationNeighborhood,
            DestinationCityCode: request.DestinationCityCode,
            DestinationCity: request.DestinationCity,
            DestinationState: request.DestinationState,
            DestinationZipCode: request.DestinationZipCode,
            IndFinal: request.IndFinal,
            IndPres: request.IndPres,
            TpImp: request.TpImp,
            AdditionalNotes: request.AdditionalNotes,
            Items: request.Items.Select(i => new StandaloneNfeItemInput(
                i.ProductId,
                i.Quantity,
                i.UnitValue,
                i.Batch,
                i.ManufactureDate,
                i.ExpirationDate,
                i.XPed,
                i.NItemPed
            )).ToList(),
            FreightModality: request.FreightModality,
            CarrierCnpjCpf: request.CarrierCnpjCpf,
            CarrierName: request.CarrierName,
            CarrierStateRegistration: request.CarrierStateRegistration,
            CarrierAddress: request.CarrierAddress,
            CarrierCity: request.CarrierCity,
            CarrierState: request.CarrierState,
            VehiclePlate: request.VehiclePlate,
            VehiclePlateState: request.VehiclePlateState,
            Payment: paymentInput
        );

        NFe.Classes.NFe nfe;
        FiscalOperationRule rule;

        try
        {
            var buildRequest = new NfeBuildRequest(
                FiscalRuleId: request.FiscalRuleId,
                CompanyId: companyId,
                ManualInput: builderInput,
                Payment: paymentInput,
                CustomIndFinal: request.IndFinal,
                CustomIndPres: request.IndPres,
                CustomTpImp: request.TpImp,
                CustomAdditionalNotes: request.AdditionalNotes
            );

            (nfe, rule) = await _builder.BuildAsync(buildRequest, ct);

            if (request.ReferencedAccessKeys != null && request.ReferencedAccessKeys.Any())
            {
                nfe.infNFe.ide.NFref ??= new List<NFe.Classes.Informacoes.Identificacao.NFref>();
                foreach (var key in request.ReferencedAccessKeys.Where(k => !string.IsNullOrWhiteSpace(k)))
                {
                    nfe.infNFe.ide.NFref.Add(new NFe.Classes.Informacoes.Identificacao.NFref { refNFe = key.Trim() });
                }
            }
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = $"Falha ao montar o XML da NF-e: {ex.Message}" });
        }

        var fiscalDoc = new CompanyFiscalDocument(companyId, rule.Finalidade, outboundOrderId: null);
        _db.CompanyFiscalDocuments.Add(fiscalDoc);

        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;
        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);
        cfgServico.ValidarSchemas = false;

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        string xmlAssinado;
        string chaveAcesso;

        try
        {
            nfe.Assina(cfgServico);
            nfe.Valida(cfgServico);

            xmlAssinado = nfe.ObterXmlString();
            chaveAcesso = nfe.infNFe.Id?.Replace("NFe", "").Trim() ?? "";

            // Salva na entidade antes do envio para a SEFAZ
            fiscalDoc.SetTransmittedXml(chaveAcesso, xmlAssinado);
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            fiscalDoc.MarkAsRejected($"Erro ao validar/assinar XML: {ex.Message}");
            await _db.SaveChangesAsync(ct);
            return Results.BadRequest(new { Message = $"Falha na validação do XML: {ex.Message}" });
        }

        using var servicoNFe = new ServicosNFe(cfgServico, certificado);
        var loteId = new Random().Next(1000, 99999);
        var retornoEnvio = servicoNFe.NFeAutorizacao(loteId, IndicadorSincronizacao.Sincrono, new List<NFe.Classes.NFe> { nfe }, false);
        var prot = retornoEnvio?.Retorno?.protNFe?.infProt;

        if (retornoEnvio?.Retorno?.protNFe == null || (prot?.cStat != 100 && prot?.cStat != 150))
        {
            string motivo = prot?.xMotivo ?? retornoEnvio?.Retorno?.xMotivo ?? "Rejeição SEFAZ";
            fiscalDoc.MarkAsRejected($"[Rejeição SEFAZ {prot?.cStat ?? retornoEnvio?.Retorno?.cStat}]: {motivo}", chaveAcesso, xmlAssinado);
            await _db.SaveChangesAsync(ct);
            return Results.BadRequest(new
            {
                Message = $"NF-e Rejeitada pela SEFAZ: {motivo}",
                DocumentId = fiscalDoc.Id,
                AccessKey = chaveAcesso
            });
        }

        var proc = new NFe.Classes.nfeProc { NFe = nfe, protNFe = retornoEnvio.Retorno.protNFe, versao = retornoEnvio.Retorno.versao };
        fiscalDoc.MarkAsAuthorized(prot.chNFe, prot.nProt, proc.ObterXmlString(), prot.xMotivo);

        long nNf = nfe.infNFe.ide.nNF;
        company.UpdateNfeAndTransportDetails(company.NfeSerie, company.NfeNextNumber + 1, company.Rntrc);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"NF-e Avulsa Nº {nNf} Autorizada com Sucesso!",
            DocumentId = fiscalDoc.Id,
            AccessKey = prot.chNFe,
            Protocol = prot.nProt,
            InvoiceNumber = nNf.ToString()
        });
    }
}

public static class EmitStandaloneNfeEndpoints
{
    public static void MapEmitStandaloneNfeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/fiscal/documents/standalone/emit", async (EmitStandaloneNfeCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.Manage);
    }
}