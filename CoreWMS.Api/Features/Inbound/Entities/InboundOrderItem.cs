using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Topology.Entities;

namespace CoreWMS.Api.Features.Inbound.Entities;

public class InboundOrderItem : AuditableEntity
{
    public Guid InboundOrderId { get; private set; }
    public InboundOrder InboundOrder { get; private set; } = null!;

    public Guid? ProductId { get; private set; } // Nullable para pré-cadastro
    public Product? Product { get; private set; }

    public int LineNumber { get; private set; }

    // Dados Brutos da NF-e (Para ajudar na tela de pré-cadastro)
    public string RawSkuCode { get; private set; } = string.Empty;
    public string? RawBarcode { get; private set; }
    public string RawDescription { get; private set; } = string.Empty;
    public string RawNcm { get; private set; } = string.Empty;

    // Expectativas Fiscais (Imutáveis) - Decimais preparados para (28,10)
    public decimal ExpectedQuantity { get; private set; }
    public decimal ExpectedUnitValue { get; private set; }
    public string? ExpectedBatch { get; private set; }
    public DateTime? ExpectedManufactureDate { get; private set; }
    public DateTime? ExpectedExpirationDate { get; private set; }

    // Progresso
    public decimal ReceivedQuantity { get; private set; }
    public InboundOrderItemStatus Status { get; private set; }

    // Concorrência e Operação (O Carrinho)
    public Guid? LockedByUserId { get; private set; }
    public DateTime? LockedAt { get; private set; }
    public Guid? DockLocationId { get; private set; }
    public Location? DockLocation { get; private set; }

    // Trava para evitar double-checkouts
    public Guid Version { get; private set; } = Guid.NewGuid();

    protected InboundOrderItem() { }

    public InboundOrderItem(
        Guid inboundOrderId, int lineNumber, string rawSkuCode, string? rawBarcode, string rawDescription, string rawNcm,
        decimal expectedQuantity, decimal expectedUnitValue, string? expectedBatch, DateTime? expectedMfgDate, DateTime? expectedExpDate)
    {
        InboundOrderId = inboundOrderId;
        LineNumber = lineNumber;
        RawSkuCode = rawSkuCode;
        RawBarcode = rawBarcode;
        RawDescription = rawDescription;
        RawNcm = rawNcm;
        ExpectedQuantity = expectedQuantity;
        ExpectedUnitValue = expectedUnitValue;
        ExpectedBatch = expectedBatch;
        ExpectedManufactureDate = expectedMfgDate;
        ExpectedExpirationDate = expectedExpDate;

        ReceivedQuantity = 0;
        Status = InboundOrderItemStatus.Pending_Review;
    }

    public void LinkProduct(Guid productId)
    {
        if (Status != InboundOrderItemStatus.Pending_Review)
            throw new InvalidOperationException("Este item já foi revisado ou vinculado.");

        ProductId = productId;
        Status = InboundOrderItemStatus.Ready_To_Receive;
        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid();
    }

    public void LockForReceiving(Guid userId, Guid dockLocationId)
    {
        if (Status == InboundOrderItemStatus.Pending_Review)
            throw new InvalidOperationException("Este item precisa de revisão de cadastro antes de ser recebido.");

        if (Status == InboundOrderItemStatus.Completed)
            throw new InvalidOperationException("Este item já foi 100% recebido.");

        if (LockedByUserId.HasValue && LockedByUserId.Value != userId)
            throw new InvalidOperationException("Este item já está sendo recebido por outro operador.");

        LockedByUserId = userId;
        LockedAt = DateTime.UtcNow;
        DockLocationId = dockLocationId;
        Status = InboundOrderItemStatus.Receiving;

        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid();
    }

    public void Unlock()
    {
        LockedByUserId = null;
        LockedAt = null;
        Status = ReceivedQuantity > 0 ? InboundOrderItemStatus.Receiving : InboundOrderItemStatus.Ready_To_Receive;

        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid();
    }

    public void AddReceivedQuantity(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("A quantidade recebida deve ser maior que zero.");

        ReceivedQuantity += quantity;

        if (ReceivedQuantity >= ExpectedQuantity)
        {
            Status = InboundOrderItemStatus.Completed;
            LockedByUserId = null;
            LockedAt = null;
        }

        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid();
    }

    public void ResetForRollback()
    {
        ReceivedQuantity = 0;
        Status = InboundOrderItemStatus.Ready_To_Receive;
        LockedByUserId = null;
        LockedAt = null;
        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid();
    }
}