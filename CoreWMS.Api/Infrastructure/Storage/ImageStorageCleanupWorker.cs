namespace CoreWMS.Api.Infrastructure.Storage;

public class ImageStorageCleanupWorker : BackgroundService
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<ImageStorageCleanupWorker> _logger;

    // Limite de 10GB em bytes
    private const long MaxStorageBytes = 10L * 1024 * 1024 * 1024;

    public ImageStorageCleanupWorker(IWebHostEnvironment env, ILogger<ImageStorageCleanupWorker> logger)
    {
        _env = env;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var storageDirectory = Path.Combine(_env.ContentRootPath, "uploads", "quality");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (Directory.Exists(storageDirectory))
                {
                    EnforceStorageLimit(storageDirectory);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro ao executar rotina de limpeza de imagens de qualidade.");
            }

            // Executa esta verificação a cada 24 horas
            await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
        }
    }

    private void EnforceStorageLimit(string directoryPath)
    {
        var dirInfo = new DirectoryInfo(directoryPath);
        var files = dirInfo.GetFiles().OrderBy(f => f.CreationTimeUtc).ToList();

        long currentTotalSize = files.Sum(f => f.Length);

        if (currentTotalSize <= MaxStorageBytes) return;

        _logger.LogWarning("Limite de armazenamento de 10GB atingido. Iniciando limpeza das imagens mais antigas...");

        // Apaga os ficheiros mais antigos até que o tamanho volte a ficar 10% abaixo do limite (9GB)
        var targetSize = MaxStorageBytes * 0.9;

        foreach (var file in files)
        {
            if (currentTotalSize <= targetSize) break;

            try
            {
                currentTotalSize -= file.Length;
                file.Delete();
                _logger.LogInformation("Imagem removida por limite de armazenamento: {FileName}", file.Name);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Não foi possível apagar o ficheiro {FileName}", file.Name);
            }
        }
    }
}