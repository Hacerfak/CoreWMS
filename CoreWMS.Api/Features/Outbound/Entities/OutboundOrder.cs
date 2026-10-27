using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Yard.Entities;
using SecurityDriven;

namespace CoreWMS.Api.Features.Outbound.Entities;

public class OutboundOrder : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    public string? RequestedBy { get; private set; }
    public string OrderNumber { get; private set; } = string.Empty;
    public string? InvoiceNumber { get; private set; }
    public string? InvoiceSerie { get; private set; }
    public string? AccessKey { get; private set; }
    public string? RawXml { get; private set; }

    public bool IsReturnToCustomer { get; private set; }

    public string? DestinationCnpjCpf { get; private set; }
    public string? DestinationName { get; private set; }
    public string? DestinationStateRegistration { get; private set; }
    public int DestinationIeIndicator { get; private set; } = 9;
    public string? DestinationStreet { get; private set; }
    public string? DestinationNumber { get; private set; }
    public string? DestinationComplement { get; private set; }
    public string? DestinationNeighborhood { get; private set; }
    public int DestinationCityCode { get; private set; }
    public string? DestinationCity { get; private set; }
    public string? DestinationState { get; private set; }
    public string? DestinationZipCode { get; private set; }

    public string? CarrierCnpjCpf { get; private set; }
    public string? CarrierName { get; private set; }
    public string? CarrierStateRegistration { get; private set; }
    public string? CarrierAddress { get; private set; }
    public string? CarrierCity { get; private set; }
    public string? CarrierState { get; private set; }
    public string? VehiclePlate { get; private set; }
    public string? VehiclePlateState { get; private set; }
    public int FreightModality { get; private set; } = 9;

    public string? AdditionalNotes { get; private set; }
    public DateTime IssueDate { get; private set; }
    public DateTime ExpectedShipDate { get; private set; }

    public Guid? DockLocationId { get; private set; }
    public Location? DockLocation { get; private set; }

    public OutboundOrderStatus Status { get; private set; }

    private readonly List<OutboundOrderItem> _items = new();
    public IReadOnlyCollection<OutboundOrderItem> Items => _items.AsReadOnly();
    public ICollection<OutboundVolume> Volumes { get; private set; } = new List<OutboundVolume>();

    public Guid? YardAppointmentId { get; private set; }
    public YardAppointment? YardAppointment { get; private set; }

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
        string? carrierAddress,
        string? carrierCity,
        string? carrierState,
        string? vehiclePlate,
        string? vehiclePlateState,
        int freightModality,
        string? additionalNotes,
        DateTime issueDate,
        DateTime expectedShipDate,
        string? requestedBy = null)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        OrderNumber = string.IsNullOrWhiteSpace(orderNumber)
            ? $"{DateTime.UtcNow:yyMMdd}-{FastGuid.NewGuid().ToString()[..6].ToUpper()}"
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
        CarrierAddress = carrierAddress?.Trim();
        CarrierCity = carrierCity?.Trim();
        CarrierState = carrierState?.Trim()?.ToUpper();
        VehiclePlate = vehiclePlate?.Trim().ToUpper();
        VehiclePlateState = vehiclePlateState?.Trim().ToUpper();
        FreightModality = freightModality;
        AdditionalNotes = additionalNotes?.Trim();
        IssueDate = issueDate.ToUniversalTime();
        ExpectedShipDate = expectedShipDate.ToUniversalTime();
        Status = OutboundOrderStatus.Pending;
        RequestedBy = requestedBy?.Trim();
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
        string? carrierAddress,
        string? carrierCity,
        string? carrierState,
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
        CarrierAddress = carrierAddress?.Trim();
        CarrierCity = carrierCity?.Trim();
        CarrierState = carrierState?.Trim()?.ToUpper();
        VehiclePlate = vehiclePlate?.Trim().ToUpper();
        VehiclePlateState = vehiclePlateState?.Trim().ToUpper();
        FreightModality = freightModality;
        AdditionalNotes = additionalNotes?.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetDockLocation(Guid dockLocationId)
    {
        DockLocationId = dockLocationId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void StageAtDock(Guid dockLocationId)
    {
        if (Items.Any(i => i.PackedQuantity < i.ExpectedQuantity))
            throw new InvalidOperationException("Não é possível enviar o pedido para a doca pois existem itens ainda não empacotados.");

        DockLocationId = dockLocationId;
        RefreshStatusAfterProgress();
    }

    // Máquina de estados que reavalia a ordem após qualquer evento operacional
    public void RefreshStatusAfterProgress()
    {
        if (Status == OutboundOrderStatus.Canceled || Status == OutboundOrderStatus.Shipped)
            return;

        if (_items.Count == 0)
        {
            Status = OutboundOrderStatus.Pending;
            UpdatedAt = DateTime.UtcNow;
            return;
        }

        bool allPicked = _items.All(i => i.PickedQuantity >= i.ExpectedQuantity);
        bool allPacked = _items.All(i => i.PackedQuantity >= i.ExpectedQuantity);
        bool allChecked = _items.All(i => i.CheckedQuantity >= i.ExpectedQuantity);

        if (allPicked && allPacked && allChecked)
        {
            Status = OutboundOrderStatus.ReadyToShip;
        }
        else if (allPicked && allPacked)
        {
            Status = OutboundOrderStatus.Checking;
        }
        else if (allPicked)
        {
            Status = OutboundOrderStatus.Packing;
        }
        else if (_items.Any(i => i.PickedQuantity > 0))
        {
            Status = OutboundOrderStatus.Picking;
        }
        else if (_items.All(i => i.AllocatedQuantity >= i.ExpectedQuantity))
        {
            Status = OutboundOrderStatus.Allocated;
        }
        else
        {
            Status = OutboundOrderStatus.Pending;
        }

        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateStatus(OutboundOrderStatus newStatus)
    {
        Status = newStatus;
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

    public void SetRequestedBy(string? userName)
    {
        RequestedBy = userName?.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void Cancel(string reason, DateTime? localTimestamp = null)
    {
        if (Status == OutboundOrderStatus.Canceled)
            throw new InvalidOperationException("O pedido já está cancelado.");

        if (Status == OutboundOrderStatus.Shipped)
            throw new InvalidOperationException("Não é possível cancelar diretamente um pedido expedido (Shipped). Execute o 'Estorno de Expedição' primeiro para restaurar o estoque.");

        if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < 15)
            throw new ArgumentException("O motivo do cancelamento deve conter no mínimo 15 caracteres.", nameof(reason));

        foreach (var item in _items)
        {
            item.ResetQuantities();
        }

        Status = OutboundOrderStatus.Canceled;

        var displayTime = localTimestamp ?? ToOperationalTime(DateTime.UtcNow);
        var cancelLog = $"[CANCELADO em {displayTime:dd/MM/yyyy HH:mm}]: {reason.Trim()}";
        AdditionalNotes = string.IsNullOrWhiteSpace(AdditionalNotes)
            ? cancelLog
            : $"{AdditionalNotes}\n{cancelLog}";

        UpdatedAt = DateTime.UtcNow;
    }

    private static DateTime ToOperationalTime(DateTime utcDateTime)
    {
        try
        {
            var tz = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
            return TimeZoneInfo.ConvertTimeFromUtc(utcDateTime, tz);
        }
        catch
        {
            try
            {
                var tz = TimeZoneInfo.FindSystemTimeZoneById("E. South America Standard Time");
                return TimeZoneInfo.ConvertTimeFromUtc(utcDateTime, tz);
            }
            catch
            {
                return utcDateTime.AddHours(-3);
            }
        }
    }

    public void LinkYardAppointment(Guid appointmentId)
    {
        YardAppointmentId = appointmentId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UnlinkYardAppointment()
    {
        YardAppointmentId = null;
        UpdatedAt = DateTime.UtcNow;
    }
}