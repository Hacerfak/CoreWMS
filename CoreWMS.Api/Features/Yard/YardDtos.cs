using CoreWMS.Api.Features.Yard.Enums;

namespace CoreWMS.Api.Features.Yard;

public record YardAppointmentDto(
    Guid Id,
    string ReservationCode,
    YardAppointmentType Type,
    string TypeDescription,
    YardAppointmentStatus Status,
    string StatusDescription,
    string? DriverName,
    string? DriverCpf,
    string? VehiclePlate,
    string? VehiclePlateState,
    string? CarrierName,
    string? CarrierCnpj,
    DateTime ScheduledDate,
    DateTime? ArrivedAt,
    DateTime? DockedAt,
    DateTime? DepartedAt,
    int? StayMinutes,
    Guid? DockLocationId,
    string? DockName,
    string? AccessKey,
    string? InvoiceNumber,
    string? InvoiceSerie,
    string? AdditionalNotes,
    Guid? InboundOrderId,
    string? InboundOrderNumber,
    Guid? OutboundOrderId,
    string? OutboundOrderNumber
);