using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Inventory.Entities;
using SecurityDriven;

namespace CoreWMS.Api.Features.Outbound.Entities;

public class OutboundAllocation : AuditableEntity
{
    public Guid OutboundOrderId { get; private set; }
    public OutboundOrder OutboundOrder { get; private set; } = null!;

    public Guid OutboundOrderItemId { get; private set; }
    public OutboundOrderItem OutboundOrderItem { get; private set; } = null!;

    public Guid HandlingUnitId { get; private set; }
    public HandlingUnit HandlingUnit { get; private set; } = null!;

    public decimal Quantity { get; private set; }
    public bool IsPicked { get; private set; }

    protected OutboundAllocation() { }

    public OutboundAllocation(Guid outboundOrderId, Guid outboundOrderItemId, Guid handlingUnitId, decimal quantity)
    {
        Id = FastGuid.NewPostgreSqlGuid();
        OutboundOrderId = outboundOrderId;
        OutboundOrderItemId = outboundOrderItemId;
        HandlingUnitId = handlingUnitId;
        Quantity = quantity;
        IsPicked = false;
    }

    public void BindToOrderItem(OutboundOrderItem orderItem)
    {
        if (orderItem == null) throw new ArgumentNullException(nameof(orderItem));
        OutboundOrderItemId = orderItem.Id;
        OutboundOrderItem = orderItem;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateQuantity(decimal newQuantity)
    {
        if (newQuantity <= 0) throw new ArgumentException("A quantidade deve ser maior que zero.");
        Quantity = newQuantity;
        UpdatedAt = DateTime.UtcNow;
    }

    public void MarkAsPicked()
    {
        IsPicked = true;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SwapHandlingUnit(HandlingUnit newHandlingUnit)
    {
        if (newHandlingUnit == null) throw new ArgumentNullException(nameof(newHandlingUnit));
        if (IsPicked) throw new InvalidOperationException("Não é possível trocar a HU de uma alocação já separada.");

        HandlingUnitId = newHandlingUnit.Id;
        HandlingUnit = newHandlingUnit;
        UpdatedAt = DateTime.UtcNow;
    }
}