using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Topology.Entities;

namespace CoreWMS.Api.Features.Outbound.Entities;

public class OutboundOrder : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    // Identificação do Pedido e Documentos Fiscais
    public string OrderNumber { get; private set; } = string.Empty;
    public string? InvoiceNumber { get; private set; }
    public string? InvoiceSerie { get; private set; }
    public string? AccessKey { get; private set; }
    public string? RawXml { get; private set; }

    // Tipo de Operação
    public bool IsReturnToCustomer { get; private set; }

    // Dados do Destinatário Final
    public string? DestinationCnpjCpf { get; private set; }
    public string? DestinationName { get; private set; }
    public string? DestinationCity { get; private set; }
    public string? DestinationState { get; private set; }
    public string? DestinationZipCode { get; private set; }

    // Dados da Transportadora e Veículo
    public string? CarrierCnpjCpf { get; private set; }
    public string? CarrierName { get; private set; }
    public string? VehiclePlate { get; private set; }
    public string? VehiclePlateState { get; private set; }

    // Observações Fiscais e Operacionais
    public string? AdditionalNotes { get; private set; }

    public DateTime IssueDate { get; private set; }
    public DateTime ExpectedShipDate { get; private set; }

    // Localização na Doca
    public Guid? DockLocationId { get; private set; }
    public Location? DockLocation { get; private set; }

    public OutboundOrderStatus Status { get; private set; }

    private readonly List<OutboundOrderItem> _items = new();
    public IReadOnlyCollection<OutboundOrderItem> Items => _items.AsReadOnly();
    public ICollection<OutboundVolume> Volumes { get; private set; } = new List<OutboundVolume>();

    protected OutboundOrder() { }

    public OutboundOrder(
        Guid companyId,
        Guid customerId,
        string? orderNumber,
        string? invoiceNumber,
        string? invoiceSerie,
        string? accessKey,
        string? rawXml,
        bool isReturnToCustomer,
        string? destCnpjCpf,
        string? destName,
        string? destCity,
        string? destState,
        string? destZipCode,
        string? carrierCnpjCpf,
        string? carrierName,
        string? vehiclePlate,
        string? vehiclePlateState,
        string? additionalNotes,
        DateTime issueDate,
        DateTime expectedShipDate)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        OrderNumber = string.IsNullOrWhiteSpace(orderNumber) ? $"PED-{DateTime.UtcNow:yyyyMMddHHmmss}" : orderNumber.Trim();
        InvoiceNumber = invoiceNumber?.Trim();
        InvoiceSerie = invoiceSerie?.Trim();
        AccessKey = accessKey?.Trim();
        RawXml = rawXml;
        IsReturnToCustomer = isReturnToCustomer;
        DestinationCnpjCpf = destCnpjCpf?.Trim();
        DestinationName = destName?.Trim();
        DestinationCity = destCity?.Trim();
        DestinationState = destState?.Trim();
        DestinationZipCode = destZipCode?.Trim();
        CarrierCnpjCpf = carrierCnpjCpf?.Trim();
        CarrierName = carrierName?.Trim();
        VehiclePlate = vehiclePlate?.Trim().ToUpper();
        VehiclePlateState = vehiclePlateState?.Trim().ToUpper();
        AdditionalNotes = additionalNotes?.Trim();
        IssueDate = issueDate.ToUniversalTime();
        ExpectedShipDate = expectedShipDate.ToUniversalTime();
        Status = OutboundOrderStatus.Pending;
    }

    public void UpdateStatus(OutboundOrderStatus newStatus)
    {
        Status = newStatus;
        UpdatedAt = DateTime.UtcNow;
    }

    public void StageAtDock(Guid dockLocationId)
    {
        if (Items.Any(i => i.Status != OutboundOrderItemStatus.Packed))
            throw new InvalidOperationException("Não é possível enviar o pedido para a doca pois existem itens não empacotados.");

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