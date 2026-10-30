using System;
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

    public decimal QuantityChange { get; private set; } // Variação (+ ou -)
    public decimal BalanceAfter { get; private set; }   // Saldo resultante após a movimentação (Sempre >= 0)

    // Referências Fiscais / Rastreabilidade
    public Guid? SourceDocumentId { get; private set; }
    public string? SourceDocumentNumber { get; private set; }

    protected InventoryTransaction() { }

    public InventoryTransaction(
        Guid companyId,
        Guid customerId,
        Guid productId,
        Guid? handlingUnitId,
        Guid? locationId,
        TransactionType type,
        decimal quantityChange,
        decimal balanceAfter,
        Guid? sourceDocumentId,
        string? sourceDocumentNumber)
    {
        if (companyId == Guid.Empty)
            throw new ArgumentException("A empresa é obrigatória.", nameof(companyId));
        if (customerId == Guid.Empty)
            throw new ArgumentException("O depositante é obrigatório.", nameof(customerId));
        if (productId == Guid.Empty)
            throw new ArgumentException("O produto é obrigatório.", nameof(productId));

        // BLINDAGEM DE DOMÍNIO: O saldo nunca pode ser negativo.
        // Tolerância de epsilon para evitar falsos positivos por dízimas periódicas.
        if (balanceAfter < 0 && balanceAfter > -0.00000001m)
        {
            balanceAfter = 0m;
        }

        if (balanceAfter < 0)
        {
            throw new InvalidOperationException(
                $"[KARDEX VIOLAÇÃO] Saldo negativo não permitido! Tentativa de registrar saldo {balanceAfter} para o Produto {productId} (HU: {handlingUnitId})."
            );
        }

        CompanyId = companyId;
        CustomerId = customerId;
        ProductId = productId;
        HandlingUnitId = handlingUnitId;
        LocationId = locationId;
        Type = type;
        QuantityChange = quantityChange;
        BalanceAfter = balanceAfter;
        SourceDocumentId = sourceDocumentId;
        SourceDocumentNumber = sourceDocumentNumber?.Trim();
    }
}