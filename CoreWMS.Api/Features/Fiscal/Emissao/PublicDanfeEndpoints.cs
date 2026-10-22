using CoreWMS.Api.Infrastructure.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System.Linq;

namespace CoreWMS.Api.Infrastructure.Fiscal.Emissao;

public static class PublicDanfeEndpoints
{
    public static void MapPublicDanfeEndpoints(this IEndpointRouteBuilder app)
    {
        // Rota pública acessível com prefixo /api para compatibilidade total com Proxy do Vite e Nginx
        app.MapGet("/api/public/danfe/{accessKey}", async (string accessKey, ApplicationDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(accessKey))
                return Results.BadRequest("A Chave de Acesso é obrigatória.");

            var cleanKey = new string(accessKey.Where(char.IsDigit).ToArray());
            if (cleanKey.Length != 44)
                return Results.BadRequest("A Chave de Acesso da NF-e deve conter exatamente 44 dígitos numéricos.");

            var doc = await db.CompanyFiscalDocuments
                .AsNoTracking()
                .Include(d => d.Company)
                .Include(d => d.OutboundOrder).ThenInclude(o => o!.Company)
                .FirstOrDefaultAsync(d => d.AccessKey == cleanKey);

            if (doc == null || string.IsNullOrWhiteSpace(doc.RawXml))
                return Results.NotFound("Documento fiscal não localizado ou XML autorizado indisponível.");

            string? logoBase64 = doc.Company?.LogoBase64 ?? doc.OutboundOrder?.Company?.LogoBase64;
            string html = DanfeHtmlGenerator.Generate(doc.RawXml, logoBase64);

            return Results.Content(html, "text/html; charset=utf-8");
        })
        .AllowAnonymous()
        .RequireCors(cors => cors.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader())
        .WithTags("Public Fiscal");
    }
}