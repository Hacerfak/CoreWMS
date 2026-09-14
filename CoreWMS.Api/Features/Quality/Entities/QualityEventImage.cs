namespace CoreWMS.Api.Features.Quality.Entities;

using CoreWMS.Api.Core.Entities;

public class QualityEventImage : AuditableEntity
{
    public Guid QualityEventId { get; private set; }
    public string FileName { get; private set; } = string.Empty;
    public string Base64Data { get; private set; } = string.Empty;

    protected QualityEventImage() { }

    public QualityEventImage(Guid qualityEventId, string fileName, string base64Data)
    {
        QualityEventId = qualityEventId;
        FileName = fileName;
        Base64Data = base64Data;
    }
}