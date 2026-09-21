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

    // Baldes de Progresso (Alta precisão 28,10)
    public decimal ExpectedQuantity { get; private set; } // O que o cliente pediu
    public decimal AllocatedQuantity { get; private set; } // O que o WMS reservou do Saldo (InventoryBalance)
    public decimal PickedQuantity { get; private set; } // O que o operador já tirou da prateleira (Coletor)
    public decimal PackedQuantity { get; private set; } // O que já foi colocado num palete de envio (Shipping HU)

    // Valor base para a emissão da NF-e de Retorno (opcional, pode vir do ERP do cliente)
    public decimal UnitValue { get; private set; }

    public OutboundOrderItemStatus Status { get; private set; }

    // Concorrência Otimista (Dois operadores tentando faturar o mesmo item)
    public Guid Version { get; private set; } = FastGuid.NewPostgreSqlGuid();

    protected OutboundOrderItem() { }

    public OutboundOrderItem(Guid outboundOrderId, Guid productId, int lineNumber, string skuCode, decimal expectedQuantity, decimal unitValue)
    {
        OutboundOrderId = outboundOrderId;
        ProductId = productId;
        LineNumber = lineNumber;
        SkuCode = skuCode;
        ExpectedQuantity = expectedQuantity;
        UnitValue = unitValue;

        AllocatedQuantity = 0;
        PickedQuantity = 0;
        PackedQuantity = 0;
        Status = OutboundOrderItemStatus.Pending;
    }

    public void AddAllocatedQuantity(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("Quantidade deve ser maior que zero.");
        if (AllocatedQuantity + quantity > ExpectedQuantity) throw new InvalidOperationException("Não é possível alocar mais do que o solicitado.");

        AllocatedQuantity += quantity;

        if (AllocatedQuantity == ExpectedQuantity)
            Status = OutboundOrderItemStatus.Allocated;

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void AddPickedQuantity(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("Quantidade deve ser maior que zero.");
        if (PickedQuantity + quantity > AllocatedQuantity) throw new InvalidOperationException("Não é possível separar mais do que foi alocado pelo sistema.");

        PickedQuantity += quantity;
        Status = PickedQuantity == AllocatedQuantity ? OutboundOrderItemStatus.Picked : OutboundOrderItemStatus.Picking;

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void AddPackedQuantity(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("Quantidade deve ser maior que zero.");
        if (PackedQuantity + quantity > PickedQuantity) throw new InvalidOperationException("Não é possível empacotar mais do que foi fisicamente separado.");

        PackedQuantity += quantity;

        if (PackedQuantity == ExpectedQuantity)
            Status = OutboundOrderItemStatus.Packed;

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }
}