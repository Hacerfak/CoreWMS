using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Quality.Entities;

public class QualityEventImage : AuditableEntity
{
    public Guid QualityEventId { get; private set; }
    public string FileName { get; private set; } = string.Empty;
    public string FilePath { get; private set; } = string.Empty;
    public long FileSizeBytes { get; private set; }

    protected QualityEventImage() { }

    public QualityEventImage(Guid qualityEventId, string fileName, string filePath, long fileSizeBytes)
    {
        QualityEventId = qualityEventId;
        FileName = fileName;
        FilePath = filePath;
        FileSizeBytes = fileSizeBytes;
    }
}