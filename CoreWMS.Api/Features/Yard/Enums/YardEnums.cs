namespace CoreWMS.Api.Features.Yard.Enums;

public enum YardAppointmentType
{
    Inbound = 1,   // Recebimento / Descarga
    Outbound = 2   // Expedição / Carga
}

public enum YardAppointmentStatus
{
    Scheduled = 1,  // Agendado
    InYard = 2,     // No Pátio (Check-in realizado)
    InDock = 3,     // Na Doca (Operação de carga/descarga em andamento)
    Finished = 4,   // Finalizado (Check-out realizado)
    Canceled = 5    // Cancelado
}