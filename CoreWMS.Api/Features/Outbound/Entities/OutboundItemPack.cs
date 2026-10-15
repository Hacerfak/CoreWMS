using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Products.Entities;
using SecurityDriven;

namespace CoreWMS.Api.Features.Outbound.Entities;

public class OutboundItemPack : AuditableEntity
{
    public Guid OutboundOrderId { get; private set; }
    public OutboundOrder OutboundOrder { get; private set; } = null!;

    public Guid OutboundOrderItemId { get; private set; }
    public OutboundOrderItem OutboundOrderItem { get; private set; } = null!;

    public Guid PackagingTypeId { get; private set; }
    public PackagingType PackagingType { get; private set; } = null!;

    public int VolumeCount { get; private set; }
    public decimal QuantityPerVolume { get; private set; }
    public decimal TotalQuantity => VolumeCount * QuantityPerVolume;

    protected OutboundItemPack() { }

    public OutboundItemPack(
        Guid outboundOrderId,
        Guid outboundOrderItemId,
        Guid packagingTypeId,
        int volumeCount,
        decimal quantityPerVolume)
    {
        if (outboundOrderId == Guid.Empty)
            throw new ArgumentException("O identificador da ordem de saída é obrigatório.", nameof(outboundOrderId));

        if (outboundOrderItemId == Guid.Empty)
            throw new ArgumentException("O identificador do item da ordem de saída é obrigatório.", nameof(outboundOrderItemId));

        if (packagingTypeId == Guid.Empty)
            throw new ArgumentException("O tipo de embalagem é obrigatório.", nameof(packagingTypeId));

        if (volumeCount <= 0)
            throw new ArgumentException("A quantidade de volumes deve ser maior que zero.", nameof(volumeCount));

        if (quantityPerVolume <= 0)
            throw new ArgumentException("A quantidade por volume deve ser maior que zero.", nameof(quantityPerVolume));

        Id = FastGuid.NewPostgreSqlGuid();
        OutboundOrderId = outboundOrderId;
        OutboundOrderItemId = outboundOrderItemId;
        PackagingTypeId = packagingTypeId;
        VolumeCount = volumeCount;
        QuantityPerVolume = quantityPerVolume;
    }

    public void UpdateDetails(int volumeCount, decimal quantityPerVolume)
    {
        if (volumeCount <= 0)
            throw new ArgumentException("A quantidade de volumes deve ser maior que zero.", nameof(volumeCount));

        if (quantityPerVolume <= 0)
            throw new ArgumentException("A quantidade por volume deve ser maior que zero.", nameof(quantityPerVolume));

        VolumeCount = volumeCount;
        QuantityPerVolume = quantityPerVolume;
        UpdatedAt = DateTime.UtcNow;
    }
}