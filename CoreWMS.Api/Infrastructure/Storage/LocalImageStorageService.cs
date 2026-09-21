using SkiaSharp;
using Microsoft.AspNetCore.Hosting;

namespace CoreWMS.Api.Infrastructure.Storage;

public interface ILocalImageStorageService
{
    Task<(string FilePath, long FileSizeBytes)> CompressAndSaveImageAsync(string fileName, string base64Data, CancellationToken ct = default);
}

public class LocalImageStorageService : ILocalImageStorageService
{
    private readonly string _storageDirectory;

    public LocalImageStorageService(IWebHostEnvironment env)
    {
        _storageDirectory = Path.Combine(env.ContentRootPath, "uploads", "quality");

        if (!Directory.Exists(_storageDirectory))
        {
            Directory.CreateDirectory(_storageDirectory);
        }
    }

    public async Task<(string FilePath, long FileSizeBytes)> CompressAndSaveImageAsync(string fileName, string base64Data, CancellationToken ct = default)
    {
        // Limpa o prefixo do Base64 caso o frontend envie "data:image/jpeg;base64,..."
        var base64Clean = base64Data.Contains(',') ? base64Data.Split(',')[1] : base64Data;
        var imageBytes = Convert.FromBase64String(base64Clean);

        var safeFileName = $"{Guid.NewGuid():N}_{Path.GetFileNameWithoutExtension(fileName)}.jpg";
        var fullPath = Path.Combine(_storageDirectory, safeFileName);
        var relativePath = $"/uploads/quality/{safeFileName}";

        using var originalBitmap = SKBitmap.Decode(imageBytes);

        // Calcula as novas dimensões mantendo o Aspect Ratio (Máximo de 1024px)
        int maxWidth = 1024;
        int maxHeight = 1024;
        int newWidth = originalBitmap.Width;
        int newHeight = originalBitmap.Height;

        if (originalBitmap.Width > maxWidth || originalBitmap.Height > maxHeight)
        {
            double ratioX = (double)maxWidth / originalBitmap.Width;
            double ratioY = (double)maxHeight / originalBitmap.Height;
            double ratio = Math.Min(ratioX, ratioY);

            newWidth = (int)(originalBitmap.Width * ratio);
            newHeight = (int)(originalBitmap.Height * ratio);
        }

        var imageInfo = new SKImageInfo(newWidth, newHeight);

        // CORREÇÃO: Usando SKSamplingOptions com interpolação linear para alta qualidade e performance
        using var resizedBitmap = originalBitmap.Resize(imageInfo, new SKSamplingOptions(SKFilterMode.Linear));

        using var image = SKImage.FromBitmap(resizedBitmap);

        // Comprime para JPEG com 75% de qualidade
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 75);

        // Salva no disco assincronamente
        using var stream = File.OpenWrite(fullPath);
        await stream.WriteAsync(data.AsSpan().ToArray(), ct);

        var fileInfo = new FileInfo(fullPath);
        return (relativePath, fileInfo.Length);
    }
}