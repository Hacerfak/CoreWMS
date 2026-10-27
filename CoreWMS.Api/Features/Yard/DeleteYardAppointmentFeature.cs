using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Yard.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record DeleteYardAppointmentCommand(Guid AppointmentId) : IRequest<IResult>;

public class DeleteYardAppointmentHandler : IRequestHandler<DeleteYardAppointmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteYardAppointmentHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteYardAppointmentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var appointment = await _db.YardAppointments
            .FirstOrDefaultAsync(y => y.Id == request.AppointmentId && y.CompanyId == companyId, ct);

        if (appointment == null) return Results.NotFound(new { Message = "Agendamento não encontrado." });

        if (appointment.Status != YardAppointmentStatus.Canceled)
        {
            return Results.BadRequest(new { Message = "Apenas agendamentos no status 'Cancelado' podem ser excluídos definitivamente." });
        }

        _db.YardAppointments.Remove(appointment);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Agendamento excluído definitivamente." });
    }
}

public static class DeleteYardAppointmentEndpoints
{
    public static void MapDeleteYardAppointmentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/yard/appointments/{appointmentId:guid}", async (Guid appointmentId, IMediator mediator) =>
            await mediator.Send(new DeleteYardAppointmentCommand(appointmentId)))
            .WithTags("Yard")
            .RequireAuthorization()
            .RequirePermission(Permissions.Yard.Manage);
    }
}