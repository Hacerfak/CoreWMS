using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Products.Entities;

namespace CoreWMS.Api.Features.Customers.Entities;

public class CustomerPackagingLimit : AuditableEntity
{
    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    public Guid PackagingTypeId { get; private set; }
    public PackagingType PackagingType { get; private set; } = null!;

    public int MaxQuantityPerOrder { get; private set; }

    protected CustomerPackagingLimit() { }

    public CustomerPackagingLimit(Guid customerId, Guid packagingTypeId, int maxQuantityPerOrder)
    {
        CustomerId = customerId;
        PackagingTypeId = packagingTypeId;
        MaxQuantityPerOrder = maxQuantityPerOrder;
    }

    public void UpdateLimit(int maxQuantityPerOrder)
    {
        if (maxQuantityPerOrder <= 0) throw new ArgumentException("A quantidade máxima deve ser maior que zero.");
        MaxQuantityPerOrder = maxQuantityPerOrder;
        UpdatedAt = DateTime.UtcNow;
    }
}