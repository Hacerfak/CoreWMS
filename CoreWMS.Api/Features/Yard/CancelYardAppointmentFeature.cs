using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record CancelYardAppointmentCommand(Guid AppointmentId, string? Reason = null) : IRequest<IResult>;

public class CancelYardAppointmentHandler : IRequestHandler<CancelYardAppointmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CancelYardAppointmentHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CancelYardAppointmentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var appointment = await _db.YardAppointments
            .FirstOrDefaultAsync(y => y.Id == request.AppointmentId && y.CompanyId == companyId, ct);

        if (appointment == null) return Results.NotFound(new { Message = "Agendamento não encontrado." });

        try
        {
            appointment.Cancel(request.Reason);
            await _db.SaveChangesAsync(ct);

            return Results.Ok(new { Message = "Agendamento cancelado com sucesso." });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
    }
}

public static class CancelYardAppointmentEndpoints
{
    public static void MapCancelYardAppointmentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/yard/appointments/{appointmentId:guid}/cancel", async (
            Guid appointmentId,
            string? reason,
            IMediator mediator) =>
            await mediator.Send(new CancelYardAppointmentCommand(appointmentId, reason)))
            .WithTags("Yard")
            .RequireAuthorization()
            .RequirePermission(Permissions.Yard.Manage);
    }
}