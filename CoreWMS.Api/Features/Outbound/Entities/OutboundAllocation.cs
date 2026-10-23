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

    // Indicador direto se a recolha desta alocação é fracionada ou volume fechado
    public bool IsFractional { get; private set; }

    public bool IsPicked { get; private set; }

    // Rastreabilidade de Separação (Picking)
    public Guid? PickedByUserId { get; private set; }
    public string? PickedByName { get; private set; }
    public DateTime? PickedAt { get; private set; }

    // Rastreabilidade de Conferência (Checking)
    public bool IsChecked { get; private set; }
    public Guid? CheckedByUserId { get; private set; }
    public string? CheckedByName { get; private set; }
    public DateTime? CheckedAt { get; private set; }

    protected OutboundAllocation() { }

    public OutboundAllocation(
        Guid outboundOrderId,
        Guid outboundOrderItemId,
        Guid handlingUnitId,
        decimal quantity,
        bool isFractional = false) // Assinatura atualizada
    {
        Id = FastGuid.NewPostgreSqlGuid();
        OutboundOrderId = outboundOrderId;
        OutboundOrderItemId = outboundOrderItemId;
        HandlingUnitId = handlingUnitId;
        Quantity = quantity;
        IsFractional = isFractional;
        IsPicked = false;
        IsChecked = false;
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

    public void MarkAsPicked(Guid userId, string userName)
    {
        IsPicked = true;
        PickedByUserId = userId;
        PickedByName = userName.Trim();
        PickedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public void MarkAsChecked(Guid userId, string userName)
    {
        if (!IsPicked)
            throw new InvalidOperationException("Não é possível conferir uma alocação que ainda não foi recolhida no armazém.");
        if (IsChecked)
            throw new InvalidOperationException("Este volume já foi conferido anteriormente.");

        IsChecked = true;
        CheckedByUserId = userId;
        CheckedByName = userName.Trim();
        CheckedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SwapHandlingUnit(HandlingUnit newHandlingUnit)
    {
        if (newHandlingUnit == null) throw new ArgumentNullException(nameof(newHandlingUnit));
        if (IsPicked) throw new InvalidOperationException("Não é possível trocar a HU de uma alocação separada.");

        HandlingUnitId = newHandlingUnit.Id;
        HandlingUnit = newHandlingUnit;
        UpdatedAt = DateTime.UtcNow;
    }
}