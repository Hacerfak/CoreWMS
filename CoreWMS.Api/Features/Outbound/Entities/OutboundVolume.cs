using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Products.Entities;

namespace CoreWMS.Api.Features.Outbound.Entities;

public class OutboundVolume : AuditableEntity
{
    public Guid OutboundOrderId { get; private set; }
    public OutboundOrder OutboundOrder { get; private set; } = null!;

    // O tipo do volume final (Ex: Pallet, Caixa Master)
    public Guid PackagingTypeId { get; private set; }
    public PackagingType PackagingType { get; private set; } = null!;

    public string VolumeLpn { get; private set; } = string.Empty; // Ex: EXP-P1-0001

    public decimal GrossWeight { get; private set; }
    public bool UsedStretchFilm { get; private set; }

    protected OutboundVolume() { }

    public OutboundVolume(Guid outboundOrderId, Guid packagingTypeId, string volumeLpn, decimal grossWeight, bool usedStretchFilm)
    {
        OutboundOrderId = outboundOrderId;
        PackagingTypeId = packagingTypeId;
        VolumeLpn = volumeLpn;
        GrossWeight = grossWeight;
        UsedStretchFilm = usedStretchFilm;
    }
}