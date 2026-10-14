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

// --- DTOS ---
public record LinkedFiscalEventDto(
    Guid Id,
    int Type,
    string TypeDescription,
    string Status,
    string? Protocol,
    string? ReturnMessage,
    DateTime CreatedAt
);

public record CompanyFiscalDocumentItemDto(
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
    string? RecipientName,
    string? RecipientUf,
    decimal TotalValue,
    List<LinkedFiscalEventDto> LinkedEvents
);

public record CompanyFiscalDocumentsListResult(
    List<CompanyFiscalDocumentItemDto> Items,
    int TotalCount
);

public record GetCompanyFiscalDocumentsQuery(
    string? Search = null,
    FiscalDocumentStatus? Status = null,
    int? Type = null,
    int Page = 1,
    int PageSize = 25
) : IRequest<IResult>;

public record DeletePendingFiscalDocumentCommand(Guid Id) : IRequest<IResult>;

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
    List<StandaloneNfeItemCommand> Items
) : IRequest<IResult>;

// --- HANDLER ---
public class CompanyFiscalDocumentsHandler :
    IRequestHandler<GetCompanyFiscalDocumentsQuery, IResult>,
    IRequestHandler<DeletePendingFiscalDocumentCommand, IResult>,
    IRequestHandler<EmitStandaloneNfeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IZeusConfigurator _zeusConfigurator;
    private readonly NfeBuilderService _builder;

    public CompanyFiscalDocumentsHandler(
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

    public async Task<IResult> Handle(GetCompanyFiscalDocumentsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Busca todos os documentos principais (NF-es de tipo 1 a 6)
        var query = _db.CompanyFiscalDocuments
            .AsNoTracking()
            .Include(d => d.OutboundOrder)
            .Where(d => d.CompanyId == companyId && (int)d.Type <= 6);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(d =>
                (d.AccessKey != null && d.AccessKey.ToLower().Contains(s)) ||
                (d.Protocol != null && d.Protocol.ToLower().Contains(s)) ||
                (d.OutboundOrder != null && d.OutboundOrder.OrderNumber.ToLower().Contains(s)) ||
                (d.ReturnMessage != null && d.ReturnMessage.ToLower().Contains(s)));
        }

        if (request.Status.HasValue)
            query = query.Where(d => d.Status == request.Status.Value);

        if (request.Type.HasValue)
            query = query.Where(d => (int)d.Type == request.Type.Value);

        var totalCount = await query.CountAsync(ct);

        var mainDocs = await query
            .OrderByDescending(d => d.CreatedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(ct);

        // 2. Busca eventos fiscais vinculados às chaves de acesso das notas recuperadas
        var accessKeys = mainDocs
            .Where(d => !string.IsNullOrWhiteSpace(d.AccessKey))
            .Select(d => d.AccessKey!)
            .Distinct()
            .ToList();

        var events = await _db.CompanyFiscalDocuments
            .AsNoTracking()
            .Where(d => d.CompanyId == companyId && ((int)d.Type == 7 || (int)d.Type == 8) && accessKeys.Contains(d.AccessKey!))
            .OrderBy(d => d.CreatedAt)
            .ToListAsync(ct);

        var items = mainDocs.Select(doc =>
        {
            string recipientName = doc.OutboundOrder?.DestinationName ?? "Emissão Avulsa";
            string recipientUf = doc.OutboundOrder?.DestinationState ?? "-";
            decimal totalVal = 0m;

            if (!string.IsNullOrWhiteSpace(doc.RawXml))
            {
                try
                {
                    var nfeProc = FuncoesXml.XmlStringParaClasse<NFe.Classes.nfeProc>(doc.RawXml);
                    recipientName = nfeProc.NFe.infNFe.dest?.xNome ?? recipientName;
                    recipientUf = nfeProc.NFe.infNFe.dest?.enderDest?.UF ?? recipientUf;
                    totalVal = nfeProc.NFe.infNFe.total?.ICMSTot?.vNF ?? 0m;
                }
                catch { }
            }

            var linkedEvents = events
                .Where(e => e.AccessKey == doc.AccessKey)
                .Select(e => new LinkedFiscalEventDto(
                    e.Id,
                    (int)e.Type,
                    e.Type == FiscalDocumentType.Cancelamento ? "Cancelamento" : "Carta de Correção (CC-e)",
                    e.Status.ToString(),
                    e.Protocol,
                    e.ReturnMessage,
                    e.CreatedAt
                )).ToList();

            return new CompanyFiscalDocumentItemDto(
                doc.Id,
                doc.OutboundOrderId,
                doc.OutboundOrder?.OrderNumber,
                (int)doc.Type,
                ObterDescricaoTipo(doc.Type),
                doc.Status.ToString(),
                doc.AccessKey,
                doc.Protocol,
                doc.ReturnMessage,
                doc.CreatedAt,
                recipientName,
                recipientUf,
                totalVal,
                linkedEvents
            );
        }).ToList();

        return Results.Ok(new CompanyFiscalDocumentsListResult(items, totalCount));
    }

    public async Task<IResult> Handle(DeletePendingFiscalDocumentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var doc = await _db.CompanyFiscalDocuments
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.CompanyId == companyId, ct);

        if (doc == null)
            return Results.NotFound(new { Message = "Documento fiscal não encontrado." });

        if (doc.Status != FiscalDocumentStatus.Pending)
        {
            return Results.BadRequest(new { Message = "Apenas notas fiscais em situação 'Pendente' podem ser excluídas." });
        }

        _db.CompanyFiscalDocuments.Remove(doc);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Nota fiscal pendente excluída com sucesso! Uma nova nota pode ser gerada." });
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

        // 1. DELEGAÇÃO TOTAL DA CONSTRUÇÃO DA NOTA AO NfeBuilderService
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
            request.Items.Select(i => new StandaloneNfeItemInput(i.ProductId, i.Quantity, i.UnitValue)).ToList()
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

        // 2. REGISTRA DOCUMENTO INICIAL NO BANCO (com OutboundOrderId = null)
        var fiscalDoc = new CompanyFiscalDocument(companyId, rule.Finalidade, outboundOrderId: null);
        _db.CompanyFiscalDocuments.Add(fiscalDoc);

        var tpAmb = company.Environment == 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao;
        var cfgServico = _zeusConfigurator.GetCompanyConfiguration(company, tpAmb);
        cfgServico.ValidarSchemas = false;

        using var certificado = CertificadoDigitalUtils.ObterDosBytes(
            cfgServico.Certificado.ArrayBytesArquivo,
            cfgServico.Certificado.Senha,
            System.Security.Cryptography.X509Certificates.X509KeyStorageFlags.MachineKeySet);

        // 3. ASSINATURA E VALIDAÇÃO LOCAL
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

        // 4. TRANSMISSÃO SÍNCRONA À SEFAZ
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

        // 5. AUTORIZADO -> GRAVA XML E INCREMENTA SEQUÊNCIA
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

// --- ENDPOINTS ---
public static class CompanyFiscalDocumentsEndpoints
{
    public static void MapCompanyFiscalDocumentsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fiscal/documents").WithTags("Fiscal").RequireAuthorization();

        group.MapGet("/", async ([AsParameters] GetCompanyFiscalDocumentsQuery query, IMediator mediator) =>
            await mediator.Send(query))
            .RequirePermission(Permissions.Outbound.View);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeletePendingFiscalDocumentCommand(id)))
            .RequirePermission(Permissions.Outbound.Manage);

        group.MapPost("/standalone/emit", async (EmitStandaloneNfeCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .RequirePermission(Permissions.Outbound.Manage);
    }
}