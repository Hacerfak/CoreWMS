using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Yard.Enums;

namespace CoreWMS.Api.Features.Yard.Entities;

public class YardAppointment : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public string ReservationCode { get; private set; } = string.Empty; // Ex: AG-261027-A1B2
    public YardAppointmentType Type { get; private set; }
    public YardAppointmentStatus Status { get; private set; }

    // Dados do Motorista e Veículo
    public string? DriverName { get; private set; }
    public string? DriverCpf { get; private set; }
    public string? VehiclePlate { get; private set; }
    public string? VehiclePlateState { get; private set; }
    public string? CarrierName { get; private set; }
    public string? CarrierCnpj { get; private set; }

    // Controle de Tempos e Permanência
    public DateTime ScheduledDate { get; private set; }
    public DateTime? ArrivedAt { get; private set; }  // Entrada no Pátio (Check-in)
    public DateTime? DockedAt { get; private set; }   // Encoste na Doca
    public DateTime? DepartedAt { get; private set; } // Saída da Portaria (Check-out)

    // Doca Física Atribuída (Opcional até encostar)
    public Guid? DockLocationId { get; private set; }
    public Location? DockLocation { get; private set; }

    // Identificadores de Carga / NF-e
    public string? AccessKey { get; private set; }
    public string? InvoiceNumber { get; private set; }
    public string? InvoiceSerie { get; private set; }
    public string? AdditionalNotes { get; private set; }

    // Vínculos Opcionais com as Ordens do WMS
    public Guid? InboundOrderId { get; private set; }
    public InboundOrder? InboundOrder { get; private set; }

    public Guid? OutboundOrderId { get; private set; }
    public OutboundOrder? OutboundOrder { get; private set; }

    protected YardAppointment() { }

    public YardAppointment(
        Guid companyId,
        YardAppointmentType type,
        DateTime scheduledDate,
        string? vehiclePlate,
        string? vehiclePlateState,
        string? driverName,
        string? driverCpf,
        string? carrierName,
        string? carrierCnpj,
        string? accessKey,
        string? invoiceNumber,
        string? invoiceSerie,
        string? additionalNotes,
        Guid? dockLocationId = null,
        Guid? inboundOrderId = null,
        Guid? outboundOrderId = null)
    {
        CompanyId = companyId;
        Type = type;
        ScheduledDate = scheduledDate.ToUniversalTime();
        VehiclePlate = vehiclePlate?.Trim().ToUpper();
        VehiclePlateState = vehiclePlateState?.Trim().ToUpper();
        DriverName = driverName?.Trim();
        DriverCpf = driverCpf?.Trim();
        CarrierName = carrierName?.Trim();
        CarrierCnpj = carrierCnpj?.Trim();
        AccessKey = accessKey?.Trim();
        InvoiceNumber = invoiceNumber?.Trim();
        InvoiceSerie = invoiceSerie?.Trim();
        AdditionalNotes = additionalNotes?.Trim();
        DockLocationId = dockLocationId;
        InboundOrderId = inboundOrderId;
        OutboundOrderId = outboundOrderId;

        Status = YardAppointmentStatus.Scheduled;
        ReservationCode = $"AG-{DateTime.UtcNow:yyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpper()}";
    }

    // ====================================================================
    // MÉTODOS DE TRANSIÇÃO DE ESTADOS E WORKFLOW BIDIRECIONAL
    // ====================================================================

    public void CheckIn(string? plate = null, string? driver = null, string? cpf = null, Guid? dockId = null)
    {
        if (Status != YardAppointmentStatus.Scheduled)
            throw new InvalidOperationException($"Não é possível realizar check-in com status '{Status}'.");

        if (!string.IsNullOrWhiteSpace(plate)) VehiclePlate = plate.Trim().ToUpper();
        if (!string.IsNullOrWhiteSpace(driver)) DriverName = driver.Trim();
        if (!string.IsNullOrWhiteSpace(cpf)) DriverCpf = cpf.Trim();
        if (dockId.HasValue) DockLocationId = dockId.Value;

        Status = YardAppointmentStatus.InYard;
        ArrivedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public void MoveToDock(Guid? dockLocationId = null)
    {
        if (Status == YardAppointmentStatus.Finished || Status == YardAppointmentStatus.Canceled)
            throw new InvalidOperationException($"Agendamento já encerrado com status '{Status}'.");

        // Se ainda estiver agendado, marca a chegada no pátio retroativamente
        ArrivedAt ??= DateTime.UtcNow;

        // Se uma doca foi informada, atualiza; caso contrário, mantém a que já estava
        if (dockLocationId.HasValue && dockLocationId.Value != Guid.Empty)
        {
            DockLocationId = dockLocationId.Value;
        }

        DockedAt = DateTime.UtcNow;
        Status = YardAppointmentStatus.InDock;
        UpdatedAt = DateTime.UtcNow;
    }

    public void CheckOut()
    {
        if (Status == YardAppointmentStatus.Finished || Status == YardAppointmentStatus.Canceled)
            throw new InvalidOperationException($"Agendamento já encerrado com status '{Status}'.");

        DepartedAt = DateTime.UtcNow;
        Status = YardAppointmentStatus.Finished;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Cancel(string? reason = null)
    {
        if (Status == YardAppointmentStatus.Finished)
            throw new InvalidOperationException("Não é possível cancelar um agendamento já finalizado.");

        Status = YardAppointmentStatus.Canceled;
        if (!string.IsNullOrWhiteSpace(reason))
        {
            AdditionalNotes = string.IsNullOrWhiteSpace(AdditionalNotes)
                ? $"[CANCELADO]: {reason.Trim()}"
                : $"{AdditionalNotes}\n[CANCELADO]: {reason.Trim()}";
        }
        UpdatedAt = DateTime.UtcNow;
    }

    public void LinkInboundOrder(Guid orderId)
    {
        InboundOrderId = orderId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void LinkOutboundOrder(Guid orderId)
    {
        OutboundOrderId = orderId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateDetails(
        YardAppointmentType type,
        DateTime scheduledDate,
        string? vehiclePlate,
        string? vehiclePlateState,
        string? driverName,
        string? driverCpf,
        string? carrierName,
        string? carrierCnpj,
        string? accessKey,
        string? invoiceNumber,
        string? invoiceSerie,
        string? additionalNotes,
        Guid? dockLocationId)
    {
        Type = type;
        ScheduledDate = scheduledDate.ToUniversalTime();
        VehiclePlate = vehiclePlate?.Trim().ToUpper();
        VehiclePlateState = vehiclePlateState?.Trim().ToUpper();
        DriverName = driverName?.Trim();
        DriverCpf = driverCpf?.Trim();
        CarrierName = carrierName?.Trim();
        CarrierCnpj = carrierCnpj?.Trim();
        AccessKey = accessKey?.Trim();
        InvoiceNumber = invoiceNumber?.Trim();
        InvoiceSerie = invoiceSerie?.Trim();
        AdditionalNotes = additionalNotes?.Trim();
        DockLocationId = dockLocationId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void LinkInboundOrder(Guid orderId, string? invoiceNumber = null, string? accessKey = null)
    {
        if (Status == YardAppointmentStatus.InDock || Status == YardAppointmentStatus.Finished || Status == YardAppointmentStatus.Canceled)
            throw new InvalidOperationException($"Não é possível vincular uma ordem a um agendamento com status '{Status}'.");

        InboundOrderId = orderId;
        OutboundOrderId = null;
        Type = YardAppointmentType.Inbound;

        if (!string.IsNullOrWhiteSpace(invoiceNumber)) InvoiceNumber = invoiceNumber.Trim();
        if (!string.IsNullOrWhiteSpace(accessKey)) AccessKey = accessKey.Trim();

        UpdatedAt = DateTime.UtcNow;
    }

    public void LinkOutboundOrder(Guid orderId, string? orderNumber = null, string? invoiceNumber = null, string? accessKey = null, Guid? dockId = null, string? plate = null, string? carrier = null)
    {
        if (Status == YardAppointmentStatus.InDock || Status == YardAppointmentStatus.Finished || Status == YardAppointmentStatus.Canceled)
            throw new InvalidOperationException($"Não é possível vincular uma ordem a um agendamento com status '{Status}'.");

        OutboundOrderId = orderId;
        InboundOrderId = null;
        Type = YardAppointmentType.Outbound;

        if (!string.IsNullOrWhiteSpace(invoiceNumber)) InvoiceNumber = invoiceNumber.Trim();
        if (!string.IsNullOrWhiteSpace(accessKey)) AccessKey = accessKey.Trim();
        if (dockId.HasValue && !DockLocationId.HasValue) DockLocationId = dockId.Value;
        if (!string.IsNullOrWhiteSpace(plate) && string.IsNullOrWhiteSpace(VehiclePlate)) VehiclePlate = plate.Trim().ToUpper();
        if (!string.IsNullOrWhiteSpace(carrier) && string.IsNullOrWhiteSpace(CarrierName)) CarrierName = carrier.Trim();

        UpdatedAt = DateTime.UtcNow;
    }

    public void UnlinkOrder()
    {
        if (Status == YardAppointmentStatus.InDock || Status == YardAppointmentStatus.Finished || Status == YardAppointmentStatus.Canceled)
            throw new InvalidOperationException($"Não é possível desvincular ordens de um agendamento com status '{Status}'.");

        InboundOrderId = null;
        OutboundOrderId = null;
        UpdatedAt = DateTime.UtcNow;
    }
}