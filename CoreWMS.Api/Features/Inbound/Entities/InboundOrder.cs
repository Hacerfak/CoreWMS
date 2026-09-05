using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Inbound.Enums;

namespace CoreWMS.Api.Features.Inbound.Entities;

public class InboundOrder : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;
    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    public string AccessKey { get; private set; } = string.Empty;
    public string Number { get; private set; } = string.Empty;
    public string Series { get; private set; } = string.Empty;
    public DateTime IssueDate { get; private set; }
    public string IssuerCnpj { get; private set; } = string.Empty;
    public string IssuerName { get; private set; } = string.Empty;
    public string XmlContent { get; private set; } = string.Empty;

    public InboundOrderStatus Status { get; private set; }

    // Flags de Qualidade (Sinalização para o Backoffice)
    public bool HasDivergence => HasShortage || HasOverage || HasDamage;
    public bool HasShortage { get; private set; }
    public bool HasOverage { get; private set; }
    public bool HasDamage { get; private set; }

    public ICollection<InboundOrderItem> Items { get; private set; } = new List<InboundOrderItem>();

    protected InboundOrder() { }

    public InboundOrder(Guid companyId, Guid customerId, string accessKey, string number, string series, DateTime issueDate, string issuerCnpj, string issuerName, string xmlContent, InboundOrderStatus initialStatus)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        AccessKey = accessKey;
        Number = number;
        Series = series;
        IssueDate = issueDate.Kind == DateTimeKind.Utc ? issueDate : issueDate.ToUniversalTime();
        IssuerCnpj = issuerCnpj;
        IssuerName = issuerName;
        XmlContent = xmlContent;
        Status = initialStatus;
    }

    public void ChangeStatus(InboundOrderStatus newStatus)
    {
        Status = newStatus;
        UpdatedAt = DateTime.UtcNow;
    }

    public void CheckAndUpdateStatus()
    {
        var allFinished = Items.All(i => i.Status == InboundItemStatus.Finished);
        var anyReceiving = Items.Any(i => i.Status == InboundItemStatus.Receiving || i.Status == InboundItemStatus.Finished);

        if (allFinished)
        {
            Status = InboundOrderStatus.Finished;
            HasShortage = Items.Any(i => i.MissingQty > 0);
            HasOverage = Items.Any(i => i.OverageQty > 0);
            HasDamage = Items.Any(i => i.DamagedQty > 0);
        }
        else if (anyReceiving)
        {
            Status = InboundOrderStatus.Receiving;
        }
        else if (Items.All(i => i.Status != InboundItemStatus.PendingReview && i.Status != InboundItemStatus.AwaitingDock))
        {
            Status = InboundOrderStatus.AwaitingReceiving;
        }

        UpdatedAt = DateTime.UtcNow;
    }
}