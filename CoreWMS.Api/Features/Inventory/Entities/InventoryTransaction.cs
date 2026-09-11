using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Inventory.Enums;

namespace CoreWMS.Api.Features.Inventory.Entities;

public class InventoryTransaction : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Guid CustomerId { get; private set; }
    public Guid ProductId { get; private set; }
    public Guid? HandlingUnitId { get; private set; }
    public Guid? LocationId { get; private set; }

    public TransactionType Type { get; private set; }

    public decimal QuantityChange { get; private set; } // + ou -
    public decimal BalanceAfter { get; private set; } // Saldo final da HU após o evento (Auditoria pura)

    // Referências Fiscais/Operacionais
    public Guid? SourceDocumentId { get; private set; }
    public string? SourceDocumentNumber { get; private set; }

    protected InventoryTransaction() { }

    public InventoryTransaction(
        Guid companyId, Guid customerId, Guid productId, Guid? handlingUnitId, Guid? locationId,
        TransactionType type, decimal quantityChange, decimal balanceAfter,
        Guid? sourceDocumentId, string? sourceDocumentNumber)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        ProductId = productId;
        HandlingUnitId = handlingUnitId;
        LocationId = locationId;
        Type = type;
        QuantityChange = quantityChange;
        BalanceAfter = balanceAfter;
        SourceDocumentId = sourceDocumentId;
        SourceDocumentNumber = sourceDocumentNumber;
    }
}