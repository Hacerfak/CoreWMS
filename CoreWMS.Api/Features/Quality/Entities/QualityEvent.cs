namespace CoreWMS.Api.Features.Quality.Entities;

using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Topology.Entities;

public class QualityEvent : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Guid HandlingUnitId { get; private set; }
    public HandlingUnit HandlingUnit { get; private set; } = null!;

    // De onde a HU foi arrancada
    public Guid? OriginalLocationId { get; private set; }
    public Location? OriginalLocation { get; private set; }

    // Dados do Bloqueio
    public Guid HoldReasonId { get; private set; }
    public QualityReason HoldReason { get; private set; } = null!;
    public string HoldNotes { get; private set; } = string.Empty;

    // Dados da Liberação
    public Guid? ReleaseReasonId { get; private set; }
    public QualityReason? ReleaseReason { get; private set; }
    public string? ReleaseNotes { get; private set; }

    public bool IsResolved { get; private set; } // true = Liberado ou Descartado

    // Coleção de Imagens
    private readonly List<QualityEventImage> _images = new();
    public IReadOnlyCollection<QualityEventImage> Images => _images.AsReadOnly();

    protected QualityEvent() { }

    public QualityEvent(Guid companyId, Guid handlingUnitId, Guid? originalLocationId, Guid holdReasonId, string holdNotes)
    {
        CompanyId = companyId;
        HandlingUnitId = handlingUnitId;
        OriginalLocationId = originalLocationId;
        HoldReasonId = holdReasonId;
        HoldNotes = holdNotes;
        IsResolved = false;
    }

    public void AddImage(string fileName, string base64Data)
    {
        _images.Add(new QualityEventImage(Id, fileName, base64Data));
        UpdatedAt = DateTime.UtcNow;
    }

    public void Resolve(Guid releaseReasonId, string releaseNotes)
    {
        if (IsResolved) throw new InvalidOperationException("Este evento de qualidade já foi resolvido.");

        ReleaseReasonId = releaseReasonId;
        ReleaseNotes = releaseNotes;
        IsResolved = true;
        UpdatedAt = DateTime.UtcNow;
    }
}