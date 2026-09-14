using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;

namespace CoreWMS.Api.Features.Billing.Entities;

public enum BillingStatus
{
    Draft = 1,   // Aberto (Aceita recálculo e apontamentos manuais)
    Closed = 2,  // Fechado (Pronto para faturar no ERP, extrato congelado)
    Canceled = 3 // Cancelado
}

public class BillingCycle : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    public string ReferenceMonth { get; private set; } = string.Empty; // Ex: "08/2026"
    public DateTime StartDate { get; private set; }
    public DateTime EndDate { get; private set; }

    public BillingStatus Status { get; private set; }

    // Relação com as abas do extrato
    private readonly List<BillingItem> _items = new();
    public IReadOnlyCollection<BillingItem> Items => _items.AsReadOnly();

    public decimal TotalAmount => _items.Sum(i => i.ServiceTotal);

    protected BillingCycle() { }

    public BillingCycle(Guid companyId, Guid customerId, string referenceMonth, DateTime startDate, DateTime endDate)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        ReferenceMonth = referenceMonth;
        StartDate = startDate.ToUniversalTime();
        EndDate = endDate.ToUniversalTime();
        Status = BillingStatus.Draft;
    }

    public void CloseCycle()
    {
        Status = BillingStatus.Closed;
        UpdatedAt = DateTime.UtcNow;
    }
}