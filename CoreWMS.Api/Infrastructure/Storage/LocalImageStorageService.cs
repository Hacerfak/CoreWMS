using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;

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
        // Define a pasta raiz no disco do servidor (ex: /app/uploads/quality)
        _storageDirectory = Path.Combine(env.ContentRootPath, "uploads", "quality");

        if (!Directory.Exists(_storageDirectory))
        {
            Directory.CreateDirectory(_storageDirectory);
        }
    }

    public async Task<(string FilePath, long FileSizeBytes)> CompressAndSaveImageAsync(string fileName, string base64Data, CancellationToken ct = default)
    {
        // Limpa o prefixo do Base64 caso o frontend envie "data:image/jpeg;base64,..."
        var base64Clean = base64Data.Contains(",") ? base64Data.Split(',')[1] : base64Data;
        var imageBytes = Convert.FromBase64String(base64Clean);

        var safeFileName = $"{Guid.NewGuid():N}_{Path.GetFileNameWithoutExtension(fileName)}.jpg";
        var fullPath = Path.Combine(_storageDirectory, safeFileName);
        var relativePath = $"/uploads/quality/{safeFileName}"; // Caminho para guardar na BD e servir na API

        // Comprime e redimensiona a imagem para poupar espaço
        using var image = Image.Load(imageBytes);

        // Redimensiona mantendo o aspect ratio, limitando a largura máxima a 1024px (suficiente para avarias)
        image.Mutate(x => x.Resize(new ResizeOptions
        {
            Size = new Size(1024, 1024),
            Mode = ResizeMode.Max
        }));

        // Guarda em JPEG com 75% de qualidade (Equilíbrio perfeito entre tamanho e visibilidade)
        var encoder = new JpegEncoder { Quality = 75 };
        await image.SaveAsJpegAsync(fullPath, encoder, ct);

        var fileInfo = new FileInfo(fullPath);
        return (relativePath, fileInfo.Length);
    }
}