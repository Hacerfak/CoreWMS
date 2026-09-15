using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Topology.Entities; // <-- Adicionado

namespace CoreWMS.Api.Features.Outbound.Entities;

public class OutboundOrder : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    // Identificação do Pedido/NF-e Venda
    public string OrderNumber { get; private set; } = string.Empty;
    public string? AccessKey { get; private set; }
    public string? RawXml { get; private set; }

    // Dados do Destinatário Final
    public string DestinationCnpjCpf { get; private set; } = string.Empty;
    public string DestinationName { get; private set; } = string.Empty;
    public string DestinationCity { get; private set; } = string.Empty;
    public string DestinationState { get; private set; } = string.Empty;
    public string? DestinationZipCode { get; private set; }

    public DateTime IssueDate { get; private set; }
    public DateTime? ExpectedShipDate { get; private set; }

    // NOVO: Localização onde as HUs estão aguardando o carregamento
    public Guid? DockLocationId { get; private set; }
    public Location? DockLocation { get; private set; }

    public OutboundOrderStatus Status { get; private set; }

    // Relações
    private readonly List<OutboundOrderItem> _items = new();
    public IReadOnlyCollection<OutboundOrderItem> Items => _items.AsReadOnly();
    public ICollection<OutboundVolume> Volumes { get; private set; } = new List<OutboundVolume>();

    protected OutboundOrder() { }

    public OutboundOrder(
        Guid companyId, Guid customerId, string orderNumber, string? accessKey, string? rawXml,
        string destCnpjCpf, string destName, string destCity, string destState, string? destZipCode,
        DateTime issueDate, DateTime? expectedShipDate)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        OrderNumber = orderNumber;
        AccessKey = accessKey;
        RawXml = rawXml;
        DestinationCnpjCpf = destCnpjCpf;
        DestinationName = destName;
        DestinationCity = destCity;
        DestinationState = destState;
        DestinationZipCode = destZipCode;
        IssueDate = issueDate.ToUniversalTime();
        ExpectedShipDate = expectedShipDate?.ToUniversalTime();
        Status = OutboundOrderStatus.Pending;
    }

    public void UpdateStatus(OutboundOrderStatus newStatus)
    {
        Status = newStatus;
        UpdatedAt = DateTime.UtcNow;
    }

    // NOVO: Método disparado no final do Packing
    public void StageAtDock(Guid dockLocationId)
    {
        if (Items.Any(i => i.Status != OutboundOrderItemStatus.Packed))
            throw new InvalidOperationException("Não é possível enviar o pedido para a doca, pois há itens não empacotados.");

        DockLocationId = dockLocationId;
        Status = OutboundOrderStatus.ReadyToShip;
        UpdatedAt = DateTime.UtcNow;
    }

    public void AddItem(OutboundOrderItem item)
    {
        if (item == null) throw new ArgumentNullException(nameof(item));
        _items.Add(item);
    }
}