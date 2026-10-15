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
using NFe.Classes.Servicos.Tipos;
using NFe.Servicos;
using NFe.Utils.NFe;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record StandaloneNfeItemCommand(
    Guid ProductId,
    decimal Quantity,
    decimal UnitValue
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
    string? VehiclePlate = null,
    string? VehiclePlateState = null
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

        // 1. Constrói o DTO completo de entrada para o builder
        var builderInput = new StandaloneNfeInput(
            companyId,
            request.FiscalRuleId,
            request.DestinationName,
            request.DestinationCnpjCpf,
            request.DestinationStateRegistration,
            request.DestinationIeIndicator,
            request.DestinationStreet,
            request.DestinationNumber,
            request.DestinationComplement,
            request.DestinationNeighborhood,
            request.DestinationCityCode,
            request.DestinationCity,
            request.DestinationState,
            request.DestinationZipCode,
            request.IndFinal,
            request.IndPres,
            request.TpImp,
            request.AdditionalNotes,
            request.Items.Select(i => new StandaloneNfeItemInput(i.ProductId, i.Quantity, i.UnitValue)).ToList(),
            request.FreightModality,
            request.CarrierCnpjCpf,
            request.CarrierName,
            request.CarrierStateRegistration,
            request.VehiclePlate,
            request.VehiclePlateState
        );

        NFe.Classes.NFe nfe;
        FiscalOperationRule rule;

        try
        {
            (nfe, rule) = await _builder.BuildStandaloneNfeAsync(builderInput, ct);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { Message = $"Falha ao montar o XML da NF-e: {ex.Message}" });
        }

        // 2. Registra o documento inicial no banco (sem ordem vinculada)
        var fiscalDoc = new CompanyFiscalDocument(companyId, rule.Finalidade, outboundOrderId: null);
        _db.CompanyFiscalDocuments.Add(fiscalDoc);

        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;
        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);
        cfgServico.ValidarSchemas = false; // Schemas locais desabilitados

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        // 3. Assina e valida
        try
        {
            nfe.Assina(cfgServico);
            nfe.Valida(cfgServico);
        }
        catch (Exception ex)
        {
            fiscalDoc.MarkAsRejected($"Erro ao validar/assinar XML: {ex.Message}");
            await _db.SaveChangesAsync(ct);
            return Results.BadRequest(new { Message = $"Falha na validação do XML: {ex.Message}" });
        }

        // 4. Transmissão síncrona
        using var servicoNFe = new ServicosNFe(cfgServico, certificado);
        var loteId = new Random().Next(1000, 99999);
        var retornoEnvio = servicoNFe.NFeAutorizacao(loteId, IndicadorSincronizacao.Sincrono, new List<NFe.Classes.NFe> { nfe }, false);
        var prot = retornoEnvio?.Retorno?.protNFe?.infProt;

        if (retornoEnvio?.Retorno?.protNFe == null || (prot?.cStat != 100 && prot?.cStat != 150))
        {
            string motivo = prot?.xMotivo ?? retornoEnvio?.Retorno?.xMotivo ?? "Rejeição SEFAZ";
            fiscalDoc.MarkAsRejected($"[Rejeição SEFAZ {prot?.cStat ?? retornoEnvio?.Retorno?.cStat}]: {motivo}");
            await _db.SaveChangesAsync(ct);
            return Results.BadRequest(new { Message = $"NF-e Rejeitada pela SEFAZ: {motivo}", DocumentId = fiscalDoc.Id });
        }

        // 5. Sucesso: grava XML e atualiza sequencial
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