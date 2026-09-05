using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Inbound.Enums;

namespace CoreWMS.Api.Features.Inbound.Entities;

public class HandlingUnit : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;
    public string LpnCode { get; private set; } = string.Empty;
    public Guid ProductId { get; private set; }
    public Product Product { get; private set; } = null!;
    public Guid? ProductPackagingId { get; private set; }
    public ProductPackaging? ProductPackaging { get; private set; }
    public decimal Quantity { get; private set; }

    public Guid InboundOrderId { get; private set; }
    public InboundOrder InboundOrder { get; private set; } = null!;
    public Guid InboundOrderItemId { get; private set; }
    public InboundOrderItem InboundOrderItem { get; private set; } = null!;

    public string? Batch { get; private set; }
    public DateTime? ManufactureDate { get; private set; }
    public DateTime? ExpirationDate { get; private set; }

    public HandlingUnitStatus Status { get; private set; }
    public HandlingUnitQuality Quality { get; private set; }

    public Guid? CurrentLocationId { get; private set; }
    public Location? CurrentLocation { get; private set; }

    protected HandlingUnit() { }

    public HandlingUnit(Guid companyId, string lpnCode, Guid productId, Guid? productPackagingId, decimal quantity, Guid inboundOrderId, Guid inboundOrderItemId, string? batch, DateTime? manufactureDate, DateTime? expirationDate, HandlingUnitQuality quality)
    {
        CompanyId = companyId;
        LpnCode = lpnCode;
        ProductId = productId;
        ProductPackagingId = productPackagingId;
        Quantity = quantity;
        InboundOrderId = inboundOrderId;
        InboundOrderItemId = inboundOrderItemId;
        Batch = batch;
        ManufactureDate = manufactureDate;
        ExpirationDate = expirationDate;
        Quality = quality;
        Status = HandlingUnitStatus.Received;
    }

    public void MoveToLocation(Guid locationId)
    {
        CurrentLocationId = locationId;
        Status = HandlingUnitStatus.Stored;
        UpdatedAt = DateTime.UtcNow;
    }
}