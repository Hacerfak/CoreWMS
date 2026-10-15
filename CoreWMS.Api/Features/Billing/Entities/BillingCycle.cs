using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;

namespace CoreWMS.Api.Features.Billing.Entities;

public enum BillingStatus
{
    Draft = 1,   // Aberto (Aceita recálculo e apontamentos operacionais/manuais)
    Closed = 2,  // Fechado (Pronto para faturar no ERP, extrato congelado)
    Canceled = 3 // Cancelado
}

public class BillingCycle : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;
    public string ReferenceMonth { get; private set; } = string.Empty; // Padrão oficial: "MM/yyyy" (Ex: "10/2026")
    public DateTime StartDate { get; private set; }
    public DateTime EndDate { get; private set; }
    public BillingStatus Status { get; private set; }

    private readonly List<BillingItem> _items = new();
    public IReadOnlyCollection<BillingItem> Items => _items.AsReadOnly();
    public decimal TotalAmount => _items.Sum(i => i.ServiceTotal);

    protected BillingCycle() { }

    // Construtor completo com período explícito
    public BillingCycle(Guid companyId, Guid customerId, string referenceMonth, DateTime startDate, DateTime endDate)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        ReferenceMonth = referenceMonth.Trim();
        StartDate = startDate.ToUniversalTime();
        EndDate = endDate.ToUniversalTime();
        Status = BillingStatus.Draft;
    }

    // Construtor inteligente para geração automática a partir de uma data de referência
    public BillingCycle(Guid companyId, Guid customerId, DateTime referenceDate)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        ReferenceMonth = referenceDate.ToString("MM/yyyy");

        var year = referenceDate.Year;
        var month = referenceDate.Month;
        StartDate = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        EndDate = new DateTime(year, month, DateTime.DaysInMonth(year, month), 23, 59, 59, 999, DateTimeKind.Utc);
        Status = BillingStatus.Draft;
    }

    // Sobrecarga aceitando string de referência ("10/2026" ou "10-2026")
    public BillingCycle(Guid companyId, Guid customerId, string referenceMonth)
    {
        CompanyId = companyId;
        CustomerId = customerId;

        var cleanRef = referenceMonth.Replace("-", "/").Trim();
        ReferenceMonth = cleanRef;

        var parts = cleanRef.Split('/');
        int month = DateTime.UtcNow.Month;
        int year = DateTime.UtcNow.Year;

        if (parts.Length == 2 && int.TryParse(parts[0], out var m) && int.TryParse(parts[1], out var y))
        {
            month = m;
            year = y;
        }

        StartDate = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        EndDate = new DateTime(year, month, DateTime.DaysInMonth(year, month), 23, 59, 59, 999, DateTimeKind.Utc);
        Status = BillingStatus.Draft;
    }

    public void CloseCycle()
    {
        Status = BillingStatus.Closed;
        UpdatedAt = DateTime.UtcNow;
    }

    public void ReopenCycle()
    {
        Status = BillingStatus.Draft;
        UpdatedAt = DateTime.UtcNow;
    }

    public void CancelCycle()
    {
        Status = BillingStatus.Canceled;
        UpdatedAt = DateTime.UtcNow;
    }
}