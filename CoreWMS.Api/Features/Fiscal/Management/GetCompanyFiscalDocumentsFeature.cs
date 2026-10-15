using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Utils;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

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

public class GetCompanyFiscalDocumentsHandler : IRequestHandler<GetCompanyFiscalDocumentsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetCompanyFiscalDocumentsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
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

public static class GetCompanyFiscalDocumentsEndpoints
{
    public static void MapGetCompanyFiscalDocumentsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/fiscal/documents", async ([AsParameters] GetCompanyFiscalDocumentsQuery query, IMediator mediator) =>
            await mediator.Send(query))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.View);
    }
}