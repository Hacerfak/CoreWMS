using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Billing.Entities;

public class BillingItem : AuditableEntity
{
    public Guid BillingCycleId { get; private set; }
    public Guid BillingServiceId { get; private set; }
    public BillingService BillingService { get; private set; } = null!;

    public string Description { get; private set; } = string.Empty; // Vai virar o Nome da Aba no Excel

    // Valores Consolidados Financeiros
    public decimal QuantityTotal { get; private set; }
    public decimal ServiceTotal { get; private set; }

    // O Pulo do Gato: O Extrato Detalhado (Raw JSON) gerado pelo SQL dinâmico
    public string? StatementDataJson { get; private set; }

    // Anotação para justificar apontamentos manuais (Ex: "Retrabalho autorizado via email")
    public string? ManualNotes { get; private set; }

    protected BillingItem() { }

    public BillingItem(Guid billingCycleId, Guid billingServiceId, string description, decimal quantityTotal, decimal serviceTotal, string? statementDataJson, string? manualNotes)
    {
        BillingCycleId = billingCycleId;
        BillingServiceId = billingServiceId;
        Description = description;
        QuantityTotal = quantityTotal;
        ServiceTotal = serviceTotal;
        StatementDataJson = statementDataJson;
        ManualNotes = manualNotes;
    }
}