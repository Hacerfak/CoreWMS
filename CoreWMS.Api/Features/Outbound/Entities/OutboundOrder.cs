using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Topology.Entities;
using SecurityDriven;

namespace CoreWMS.Api.Features.Outbound.Entities;

public class OutboundOrder : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    // Identificação do Pedido e Documentos Fiscais de Venda/ERP
    public string OrderNumber { get; private set; } = string.Empty;
    public string? InvoiceNumber { get; private set; }
    public string? InvoiceSerie { get; private set; }
    public string? AccessKey { get; private set; }
    public string? RawXml { get; private set; }

    // Tipo de Operação
    public bool IsReturnToCustomer { get; private set; }

    // Dados do Destinatário Final (Completos para validação SEFAZ)
    public string? DestinationCnpjCpf { get; private set; }
    public string? DestinationName { get; private set; }
    public string? DestinationStateRegistration { get; private set; } // IE Destinatário
    public int DestinationIeIndicator { get; private set; } = 9;       // 1=Contribuinte, 2=Isento, 9=Não Contribuinte
    public string? DestinationStreet { get; private set; }
    public string? DestinationNumber { get; private set; }
    public string? DestinationComplement { get; private set; }
    public string? DestinationNeighborhood { get; private set; }
    public int DestinationCityCode { get; private set; }               // Código IBGE Município
    public string? DestinationCity { get; private set; }
    public string? DestinationState { get; private set; }
    public string? DestinationZipCode { get; private set; }

    // Dados da Transportadora e Veículo
    public string? CarrierCnpjCpf { get; private set; }
    public string? CarrierName { get; private set; }
    public string? CarrierStateRegistration { get; private set; }
    public string? VehiclePlate { get; private set; }
    public string? VehiclePlateState { get; private set; }
    public int FreightModality { get; private set; } = 9;              // 0=CIF, 1=FOB, 2=Terceiros, 9=Sem Frete

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
        string? destIe,
        int destIeIndicator,
        string? destStreet,
        string? destNumber,
        string? destComplement,
        string? destNeighborhood,
        int destCityCode,
        string? destCity,
        string? destState,
        string? destZipCode,
        string? carrierCnpjCpf,
        string? carrierName,
        string? carrierIe,
        string? vehiclePlate,
        string? vehiclePlateState,
        int freightModality,
        string? additionalNotes,
        DateTime issueDate,
        DateTime expectedShipDate)
    {
        CompanyId = companyId;
        CustomerId = customerId;

        // Gera código no formato YYMMDD-HEX (Exemplo: 261007-8A2F4B) quando não informado
        OrderNumber = string.IsNullOrWhiteSpace(orderNumber)
            ? $"{DateTime.UtcNow:yyMMdd}-{FastGuid.NewPostgreSqlGuid().ToString()[..6].ToUpper()}"
            : orderNumber.Trim();

        InvoiceNumber = invoiceNumber?.Trim();
        InvoiceSerie = invoiceSerie?.Trim();
        AccessKey = accessKey?.Trim();
        RawXml = rawXml;
        IsReturnToCustomer = isReturnToCustomer;

        DestinationCnpjCpf = destCnpjCpf?.Trim();
        DestinationName = destName?.Trim();
        DestinationStateRegistration = destIe?.Trim();
        DestinationIeIndicator = destIeIndicator;
        DestinationStreet = destStreet?.Trim();
        DestinationNumber = destNumber?.Trim();
        DestinationComplement = destComplement?.Trim();
        DestinationNeighborhood = destNeighborhood?.Trim();
        DestinationCityCode = destCityCode;
        DestinationCity = destCity?.Trim();
        DestinationState = destState?.Trim();
        DestinationZipCode = destZipCode?.Trim();

        CarrierCnpjCpf = carrierCnpjCpf?.Trim();
        CarrierName = carrierName?.Trim();
        CarrierStateRegistration = carrierIe?.Trim();
        VehiclePlate = vehiclePlate?.Trim().ToUpper();
        VehiclePlateState = vehiclePlateState?.Trim().ToUpper();
        FreightModality = freightModality;

        AdditionalNotes = additionalNotes?.Trim();
        IssueDate = issueDate.ToUniversalTime();
        ExpectedShipDate = expectedShipDate.ToUniversalTime();
        Status = OutboundOrderStatus.Pending;
    }

    public void SetInvoiceDetails(string invoiceNumber, string invoiceSerie, string accessKey)
    {
        if (string.IsNullOrWhiteSpace(invoiceNumber))
            throw new ArgumentException("O número da NF-e é obrigatório.", nameof(invoiceNumber));

        InvoiceNumber = invoiceNumber.Trim();
        InvoiceSerie = invoiceSerie?.Trim();
        AccessKey = accessKey?.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateHeaderDetails(
        DateTime expectedShipDate,
        string? orderNumber,
        string? invoiceNumber,
        string? invoiceSerie,
        string? accessKey,
        bool isReturnToCustomer,
        string? destCnpjCpf,
        string? destName,
        string? destIe,
        int destIeIndicator,
        string? destStreet,
        string? destNumber,
        string? destComplement,
        string? destNeighborhood,
        int destCityCode,
        string? destCity,
        string? destState,
        string? destZipCode,
        string? carrierCnpjCpf,
        string? carrierName,
        string? carrierIe,
        string? vehiclePlate,
        string? vehiclePlateState,
        int freightModality,
        string? additionalNotes)
    {
        if ((int)Status > (int)OutboundOrderStatus.Allocated)
            throw new InvalidOperationException($"Não é possível alterar dados do cabeçalho quando o pedido está em status '{Status}'.");

        ExpectedShipDate = expectedShipDate.ToUniversalTime();
        if (!string.IsNullOrWhiteSpace(orderNumber)) OrderNumber = orderNumber.Trim();
        InvoiceNumber = invoiceNumber?.Trim();
        InvoiceSerie = invoiceSerie?.Trim();
        AccessKey = accessKey?.Trim();
        IsReturnToCustomer = isReturnToCustomer;

        DestinationCnpjCpf = destCnpjCpf?.Trim();
        DestinationName = destName?.Trim();
        DestinationStateRegistration = destIe?.Trim();
        DestinationIeIndicator = destIeIndicator;
        DestinationStreet = destStreet?.Trim();
        DestinationNumber = destNumber?.Trim();
        DestinationComplement = destComplement?.Trim();
        DestinationNeighborhood = destNeighborhood?.Trim();
        DestinationCityCode = destCityCode;
        DestinationCity = destCity?.Trim();
        DestinationState = destState?.Trim();
        DestinationZipCode = destZipCode?.Trim();

        CarrierCnpjCpf = carrierCnpjCpf?.Trim();
        CarrierName = carrierName?.Trim();
        CarrierStateRegistration = carrierIe?.Trim();
        VehiclePlate = vehiclePlate?.Trim().ToUpper();
        VehiclePlateState = vehiclePlateState?.Trim().ToUpper();
        FreightModality = freightModality;
        AdditionalNotes = additionalNotes?.Trim();
        UpdatedAt = DateTime.UtcNow;
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

    public void ClearItems()
    {
        _items.Clear();
        UpdatedAt = DateTime.UtcNow;
    }
}