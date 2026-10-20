using System.Text;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Emissao;

public record DownloadNfeXmlQuery(Guid DocumentId) : IRequest<IResult>;

public class DownloadNfeXmlHandler : IRequestHandler<DownloadNfeXmlQuery, IResult>
{
    private readonly ApplicationDbContext _db;

    public DownloadNfeXmlHandler(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> Handle(DownloadNfeXmlQuery request, CancellationToken ct)
    {
        var doc = await _db.CompanyFiscalDocuments
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == request.DocumentId, ct);

        if (doc == null) return Results.NotFound(new { Message = "Documento fiscal não encontrado." });
        if (string.IsNullOrWhiteSpace(doc.RawXml)) return Results.BadRequest(new { Message = "O XML não está disponível." });

        byte[] xmlBytes = Encoding.UTF8.GetBytes(doc.RawXml);

        string suffix = doc.Type.IsEvent()
            ? "-procEvento.xml"
            : (doc.Status == FiscalDocumentStatus.Authorized ? "-procNFe.xml" : "-nfe-assinado.xml");

        string fileName = $"{doc.AccessKey ?? doc.Id.ToString()}{suffix}";

        return Results.File(xmlBytes, "application/xml; charset=utf-8", fileName);
    }
}

public static class DownloadNfeXmlEndpoints
{
    public static void MapDownloadNfeXmlEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/fiscal/nfe/{documentId:guid}/xml", async (Guid documentId, IMediator mediator) =>
            await mediator.Send(new DownloadNfeXmlQuery(documentId)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Identity.Constants.Permissions.Outbound.View);
    }
}