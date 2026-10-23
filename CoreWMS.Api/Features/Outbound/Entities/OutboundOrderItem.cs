using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Products.Entities;
using SecurityDriven;

namespace CoreWMS.Api.Features.Outbound.Entities;

public class OutboundOrderItem : AuditableEntity
{
    public Guid OutboundOrderId { get; private set; }
    public OutboundOrder OutboundOrder { get; private set; } = null!;

    public Guid ProductId { get; private set; }
    public Product Product { get; private set; } = null!;

    public int LineNumber { get; private set; }
    public string SkuCode { get; private set; } = string.Empty;

    public decimal ExpectedQuantity { get; private set; }
    public decimal AllocatedQuantity { get; private set; }
    public decimal PickedQuantity { get; private set; }
    public decimal PackedQuantity { get; private set; }
    public decimal CheckedQuantity { get; private set; }

    public decimal UnitValue { get; private set; }
    public decimal InboundUnitValue { get; private set; }

    public OutboundOrderItemStatus Status { get; private set; }
    public Guid Version { get; private set; } = FastGuid.NewPostgreSqlGuid();

    protected OutboundOrderItem() { }

    public OutboundOrderItem(Guid outboundOrderId, Guid productId, int lineNumber, string skuCode, decimal expectedQuantity, decimal unitValue)
    {
        Id = FastGuid.NewPostgreSqlGuid();
        OutboundOrderId = outboundOrderId;
        ProductId = productId;
        LineNumber = lineNumber;
        SkuCode = skuCode;
        ExpectedQuantity = expectedQuantity;
        UnitValue = unitValue;

        AllocatedQuantity = 0;
        PickedQuantity = 0;
        PackedQuantity = 0;
        CheckedQuantity = 0;
        Status = OutboundOrderItemStatus.Pending;
    }

    public void IncreaseExpectedQuantity(decimal additionalQuantity)
    {
        if (additionalQuantity <= 0) throw new ArgumentException("A quantidade adicional deve ser maior que zero.");
        ExpectedQuantity += additionalQuantity;
        if (AllocatedQuantity < ExpectedQuantity) Status = OutboundOrderItemStatus.Pending;
        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void AddAllocatedQuantity(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("Quantidade deve ser maior que zero.");
        if (AllocatedQuantity + quantity > ExpectedQuantity) throw new InvalidOperationException("Não é possível alocar mais do que o solicitado.");

        AllocatedQuantity += quantity;
        if (AllocatedQuantity == ExpectedQuantity) Status = OutboundOrderItemStatus.Allocated;

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void AddPickedQuantity(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("Quantidade deve ser maior que zero.");
        if (PickedQuantity + quantity > AllocatedQuantity) throw new InvalidOperationException("Não é possível separar mais do que foi alocado.");

        PickedQuantity += quantity;
        Status = PickedQuantity == AllocatedQuantity ? OutboundOrderItemStatus.Picked : OutboundOrderItemStatus.Picking;

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void AddPackedQuantity(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("Quantidade deve ser maior que zero.");
        if (PackedQuantity + quantity > PickedQuantity) throw new InvalidOperationException("Não é possível empacotar mais do que foi separado.");

        PackedQuantity += quantity;
        if (PackedQuantity >= ExpectedQuantity && CheckedQuantity < ExpectedQuantity)
            Status = OutboundOrderItemStatus.Packed;

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void AddCheckedQuantity(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("Quantidade a conferir deve ser maior que zero.");
        if (CheckedQuantity + quantity > PickedQuantity)
            throw new InvalidOperationException($"Não é possível conferir ({CheckedQuantity + quantity}) acima do total já separado ({PickedQuantity}).");

        CheckedQuantity += quantity;
        if (CheckedQuantity >= ExpectedQuantity)
            Status = OutboundOrderItemStatus.Checked;

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void ReduceCheckedQuantity(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("Quantidade deve ser maior que zero.");
        CheckedQuantity -= quantity;
        if (CheckedQuantity < 0) CheckedQuantity = 0;

        if (CheckedQuantity < ExpectedQuantity)
        {
            Status = PackedQuantity >= ExpectedQuantity ? OutboundOrderItemStatus.Packed : OutboundOrderItemStatus.Picked;
        }

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void UpdateInboundUnitValue(decimal inboundUnitValue)
    {
        if (inboundUnitValue < 0) throw new ArgumentException("O valor de entrada não pode ser negativo.");
        InboundUnitValue = Math.Round(inboundUnitValue, 4);
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateUnitValue(decimal unitValue)
    {
        if (unitValue < 0) throw new ArgumentException("O valor unitário não pode ser negativo.");
        UnitValue = Math.Round(unitValue, 4);
        UpdatedAt = DateTime.UtcNow;
    }

    public void ResetQuantities()
    {
        AllocatedQuantity = 0m;
        PickedQuantity = 0m;
        PackedQuantity = 0m;
        CheckedQuantity = 0m;
        Status = OutboundOrderItemStatus.Pending;
        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }
}