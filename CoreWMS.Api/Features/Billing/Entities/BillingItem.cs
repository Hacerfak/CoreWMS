using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Billing.Entities;

public class BillingItem : AuditableEntity
{
    public Guid BillingCycleId { get; private set; }
    public Guid BillingServiceId { get; private set; }
    public BillingService BillingService { get; private set; } = null!;

    // Identificação e Data da Cobrança no Ciclo
    public DateTime ChargeDate { get; private set; }
    public string? DocumentType { get; private set; }   // Ex: "NF-e Entrada", "Ordem de Saída", "Diária de Estoque", "Manual"
    public string? DocumentNumber { get; private set; } // Ex: "NF 1401997", "Ped 261016-A1", "16/10/2026"
    public Guid? DocumentId { get; private set; }       // Identificador da InboundOrder ou OutboundOrder

    public string Description { get; private set; } = string.Empty;

    // Valores Consolidados Financeiros
    public decimal QuantityTotal { get; private set; }
    public decimal ServiceTotal { get; private set; }

    // Extrato Detalhado (Raw JSON) gerado pelo SQL dinâmico
    public string? StatementDataJson { get; private set; }

    // Anotação ou justificativa de auditoria
    public string? ManualNotes { get; private set; }

    protected BillingItem() { }

    public BillingItem(
        Guid billingCycleId,
        Guid billingServiceId,
        DateTime chargeDate,
        string? documentType,
        string? documentNumber,
        Guid? documentId,
        string description,
        decimal quantityTotal,
        decimal serviceTotal,
        string? statementDataJson,
        string? manualNotes)
    {
        BillingCycleId = billingCycleId;
        BillingServiceId = billingServiceId;
        ChargeDate = DateTime.SpecifyKind(chargeDate.Date, DateTimeKind.Utc);
        DocumentType = documentType?.Trim();
        DocumentNumber = documentNumber?.Trim();
        DocumentId = documentId;
        Description = description.Trim();
        QuantityTotal = quantityTotal;
        ServiceTotal = serviceTotal;
        StatementDataJson = statementDataJson;
        ManualNotes = manualNotes?.Trim();
    }

    public void UpdateValues(decimal quantityTotal, decimal serviceTotal, string? statementDataJson, string? manualNotes = null)
    {
        QuantityTotal = quantityTotal;
        ServiceTotal = serviceTotal;
        StatementDataJson = statementDataJson;
        if (!string.IsNullOrWhiteSpace(manualNotes))
        {
            ManualNotes = manualNotes.Trim();
        }
        UpdatedAt = DateTime.UtcNow;
    }
}