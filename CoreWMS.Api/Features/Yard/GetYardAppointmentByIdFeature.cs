using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Yard.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record GetYardAppointmentByIdQuery(Guid Id) : IRequest<IResult>;

public class GetYardAppointmentByIdHandler : IRequestHandler<GetYardAppointmentByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetYardAppointmentByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetYardAppointmentByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var y = await _db.YardAppointments
            .AsNoTracking()
            .Include(x => x.DockLocation)
            .Include(x => x.InboundOrder)
            .Include(x => x.OutboundOrder)
            .FirstOrDefaultAsync(x => x.Id == request.Id && x.CompanyId == companyId, ct);

        if (y == null) return Results.NotFound(new { Message = "Agendamento não encontrado." });

        var dto = new YardAppointmentDto(
            y.Id,
            y.ReservationCode,
            y.Type,
            y.Type == YardAppointmentType.Inbound ? "Recebimento / Descarga" : "Expedição / Carga",
            y.Status,
            y.Status switch
            {
                YardAppointmentStatus.Scheduled => "Agendado",
                YardAppointmentStatus.InYard => "No Pátio",
                YardAppointmentStatus.InDock => "Na Doca",
                YardAppointmentStatus.Finished => "Finalizado",
                YardAppointmentStatus.Canceled => "Cancelado",
                _ => y.Status.ToString()
            },
            y.DriverName,
            y.DriverCpf,
            y.VehiclePlate,
            y.VehiclePlateState,
            y.CarrierName,
            y.CarrierCnpj,
            y.ScheduledDate,
            y.ArrivedAt,
            y.DockedAt,
            y.DepartedAt,
            y.ArrivedAt.HasValue ? (int)((y.DepartedAt ?? DateTime.UtcNow) - y.ArrivedAt.Value).TotalMinutes : null,
            y.DockLocationId,
            y.DockLocation?.FullPath,
            y.AccessKey,
            y.InvoiceNumber,
            y.InvoiceSerie,
            y.AdditionalNotes,
            y.InboundOrderId,
            y.InboundOrder?.InvoiceNumber,
            y.OutboundOrderId,
            y.OutboundOrder?.OrderNumber
        );

        return Results.Ok(dto);
    }
}

public static class GetYardAppointmentByIdEndpoints
{
    public static void MapGetYardAppointmentByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/yard/appointments/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetYardAppointmentByIdQuery(id)))
            .WithTags("Yard")
            .RequireAuthorization()
            .RequirePermission(Permissions.Yard.View);
    }
}