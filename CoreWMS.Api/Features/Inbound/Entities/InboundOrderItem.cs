using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Inbound.Enums;

namespace CoreWMS.Api.Features.Inbound.Entities;

public class InboundOrderItem : AuditableEntity
{
    public Guid InboundOrderId { get; private set; }
    public InboundOrder InboundOrder { get; private set; } = null!;
    public Guid? ProductId { get; private set; }
    public Product? Product { get; private set; }

    public string SkuOriginal { get; private set; } = string.Empty;
    public string? BarcodeOriginal { get; private set; }
    public string DescriptionOriginal { get; private set; } = string.Empty;
    public string UnitOriginal { get; private set; } = string.Empty;
    public decimal ExpectedQty { get; private set; }
    public decimal UnitValue { get; private set; }
    public decimal TotalValue { get; private set; }
    public string? Ncm { get; private set; }
    public string? Cest { get; private set; }
    public string? BatchOriginal { get; private set; }
    public DateTime? ManufactureDateOriginal { get; private set; }
    public DateTime? ExpirationDateOriginal { get; private set; }

    public InboundItemStatus Status { get; private set; } = InboundItemStatus.PendingReview;

    // Topologia Direta no Item
    public Guid? DockLocationId { get; private set; }
    public Location? DockLocation { get; private set; }

    // Concorrência e Operação
    public Guid? AssignedUserId { get; private set; }
    public string? AssignedUserName { get; private set; }

    // Qualidade e Faturamento
    public string? ServiceType { get; private set; }
    public decimal GoodQty { get; private set; }
    public decimal DamagedQty { get; private set; }
    public decimal MissingQty { get; private set; }
    public decimal OverageQty { get; private set; }

    protected InboundOrderItem() { }

    public InboundOrderItem(Guid inboundOrderId, string skuOriginal, string? barcodeOriginal, string descriptionOriginal, string unitOriginal, decimal expectedQty, decimal unitValue, decimal totalValue, string? ncm, string? cest, string? batchOriginal, DateTime? manufactureDateOriginal, DateTime? expirationDateOriginal)
    {
        InboundOrderId = inboundOrderId;
        SkuOriginal = skuOriginal;
        BarcodeOriginal = barcodeOriginal;
        DescriptionOriginal = descriptionOriginal;
        UnitOriginal = unitOriginal;
        ExpectedQty = expectedQty;
        UnitValue = unitValue;
        TotalValue = totalValue;
        Ncm = ncm;
        Cest = cest;
        BatchOriginal = batchOriginal;
        ManufactureDateOriginal = manufactureDateOriginal?.Kind == DateTimeKind.Utc ? manufactureDateOriginal : manufactureDateOriginal?.ToUniversalTime();
        ExpirationDateOriginal = expirationDateOriginal?.Kind == DateTimeKind.Utc ? expirationDateOriginal : expirationDateOriginal?.ToUniversalTime();
    }

    public void LinkProduct(Guid productId)
    {
        ProductId = productId;
        Status = InboundItemStatus.AwaitingDock;
        UpdatedAt = DateTime.UtcNow;
    }

    public void AssignDock(Guid dockLocationId)
    {
        if (Status != InboundItemStatus.AwaitingDock)
            throw new InvalidOperationException("Este item não está aguardando doca.");

        DockLocationId = dockLocationId;
        Status = InboundItemStatus.AwaitingReceiving;
        UpdatedAt = DateTime.UtcNow;
    }

    public void StartReceiving(Guid userId, string userName)
    {
        if (Status == InboundItemStatus.Finished) throw new InvalidOperationException("Este item já foi recebido.");
        if (Status == InboundItemStatus.Receiving && AssignedUserId != userId) throw new InvalidOperationException($"Em conferência por {AssignedUserName}.");
        if (DockLocationId == null) throw new InvalidOperationException("Nenhuma doca foi atribuída a este item.");

        Status = InboundItemStatus.Receiving;
        AssignedUserId = userId;
        AssignedUserName = userName;
        UpdatedAt = DateTime.UtcNow;
    }

    public void FinishReceiving(string serviceType, decimal goodQty, decimal damagedQty, decimal missingQty, decimal overageQty)
    {
        if ((goodQty + damagedQty + missingQty) != ExpectedQty)
            throw new InvalidOperationException("A soma de mercadorias boas, avariadas e faltantes deve ser exatamente igual à quantidade da NF-e.");

        Status = InboundItemStatus.Finished;
        ServiceType = serviceType;
        GoodQty = goodQty;
        DamagedQty = damagedQty;
        MissingQty = missingQty;
        OverageQty = overageQty;
        UpdatedAt = DateTime.UtcNow;
    }
}