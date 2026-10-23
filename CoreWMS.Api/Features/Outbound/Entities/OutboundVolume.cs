using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Products.Entities;

namespace CoreWMS.Api.Features.Outbound.Entities;

public class OutboundVolume : AuditableEntity
{
    public Guid OutboundOrderId { get; private set; }
    public OutboundOrder OutboundOrder { get; private set; } = null!;

    public Guid PackagingTypeId { get; private set; }
    public PackagingType PackagingType { get; private set; } = null!;

    public string VolumeLpn { get; private set; } = string.Empty; // Ex: HU original ou EXP-P1-0001
    public decimal GrossWeight { get; private set; }
    public bool UsedStretchFilm { get; private set; }

    // Rastreabilidade de Embalagem (Packing)
    public bool IsAutoPacked { get; private set; }
    public Guid? PackedByUserId { get; private set; }
    public string? PackedByName { get; private set; }
    public DateTime? PackedAt { get; private set; }

    // Rastreabilidade de Conferência (Checking)
    public bool IsChecked { get; private set; }
    public Guid? CheckedByUserId { get; private set; }
    public string? CheckedByName { get; private set; }
    public DateTime? CheckedAt { get; private set; }

    protected OutboundVolume() { }

    public OutboundVolume(
        Guid outboundOrderId,
        Guid packagingTypeId,
        string volumeLpn,
        decimal grossWeight = 0m,
        bool usedStretchFilm = false,
        bool isAutoPacked = false,
        Guid? packedByUserId = null,
        string? packedByName = null)
    {
        OutboundOrderId = outboundOrderId;
        PackagingTypeId = packagingTypeId;
        VolumeLpn = volumeLpn.Trim().ToUpper();
        GrossWeight = grossWeight >= 0 ? grossWeight : 0m;
        UsedStretchFilm = usedStretchFilm;
        IsAutoPacked = isAutoPacked;
        PackedByUserId = packedByUserId;
        PackedByName = packedByName?.Trim();
        PackedAt = DateTime.UtcNow;
        IsChecked = false;
    }

    public void MarkAsChecked(Guid userId, string userName)
    {
        if (IsChecked)
            throw new InvalidOperationException($"O volume {VolumeLpn} já foi conferido anteriormente.");

        IsChecked = true;
        CheckedByUserId = userId;
        CheckedByName = userName.Trim();
        CheckedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }
}