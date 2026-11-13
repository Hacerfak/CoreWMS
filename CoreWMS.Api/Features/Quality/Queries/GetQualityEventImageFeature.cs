using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality.Queries;

public static class GetQualityEventImageEndpoints
{
    public static void MapGetQualityEventImageEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/quality/images/{imageId:guid}", async (
            Guid imageId,
            ApplicationDbContext db,
            IWebHostEnvironment env,
            HttpContext httpContext,
            CancellationToken ct) =>
        {
            var image = await db.QualityEventImages
                .AsNoTracking()
                .FirstOrDefaultAsync(i => i.Id == imageId, ct);

            if (image == null || string.IsNullOrWhiteSpace(image.FilePath))
                return Results.NotFound(new { Message = "Imagem não encontrada." });

            var fileNameOnDisk = Path.GetFileName(image.FilePath);
            if (string.IsNullOrWhiteSpace(fileNameOnDisk))
                return Results.NotFound(new { Message = "Caminho de imagem inválido." });

            var storageDirectory = Path.Combine(env.ContentRootPath, "uploads", "quality");
            var fullPath = Path.Combine(storageDirectory, fileNameOnDisk);

            if (!File.Exists(fullPath))
                return Results.NotFound(new { Message = "Arquivo físico da imagem não encontrado no servidor." });

            httpContext.Response.Headers.CacheControl = "public, max-age=86400";
            return Results.File(fullPath, contentType: "image/jpeg", enableRangeProcessing: true);
        })
        .WithTags("Quality")
        .AllowAnonymous();
    }
}