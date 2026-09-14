using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;

namespace CoreWMS.Api.Features.Billing.Entities;

public class CustomerTariff : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    public Guid BillingServiceId { get; private set; }
    public BillingService BillingService { get; private set; } = null!;

    public decimal UnitValue { get; private set; } // O valor que substituirá a tag {servico_valor} no SQL

    public DateTime ValidFrom { get; private set; }
    public DateTime? ValidTo { get; private set; }

    protected CustomerTariff() { }

    public CustomerTariff(Guid companyId, Guid customerId, Guid billingServiceId, decimal unitValue, DateTime validFrom, DateTime? validTo)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        BillingServiceId = billingServiceId;
        UnitValue = unitValue;
        ValidFrom = validFrom.ToUniversalTime();
        ValidTo = validTo?.ToUniversalTime();
    }
}