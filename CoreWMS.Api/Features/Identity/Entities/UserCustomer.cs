using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;

namespace CoreWMS.Api.Features.Identity.Entities;

public class UserCustomer : AuditableEntity
{
    public Guid UserId { get; private set; }
    public User User { get; private set; } = null!;

    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    protected UserCustomer() { }

    public UserCustomer(Guid userId, Guid customerId)
    {
        UserId = userId;
        CustomerId = customerId;
    }
}