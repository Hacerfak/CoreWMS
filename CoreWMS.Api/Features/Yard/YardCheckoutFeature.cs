using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record YardCheckoutCommand(Guid AppointmentId) : IRequest<IResult>;

public class YardCheckoutHandler : IRequestHandler<YardCheckoutCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public YardCheckoutHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(YardCheckoutCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var appointment = await _db.YardAppointments
            .FirstOrDefaultAsync(y => y.Id == request.AppointmentId && y.CompanyId == companyId, ct);

        if (appointment == null) return Results.NotFound(new { Message = "Agendamento não encontrado." });

        try
        {
            appointment.CheckOut();
            await _db.SaveChangesAsync(ct);

            int stayMinutes = appointment.ArrivedAt.HasValue
                ? (int)(appointment.DepartedAt!.Value - appointment.ArrivedAt.Value).TotalMinutes
                : 0;

            return Results.Ok(new
            {
                appointment.Id,
                Status = appointment.Status.ToString(),
                appointment.DepartedAt,
                StayMinutes = stayMinutes,
                Message = $"Saída do veículo {appointment.VehiclePlate} concluída! Tempo de permanência: {stayMinutes} min."
            });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
    }
}

public static class YardCheckoutEndpoints
{
    public static void MapYardCheckoutEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/yard/appointments/{appointmentId:guid}/checkout", async (Guid appointmentId, IMediator mediator) =>
            await mediator.Send(new YardCheckoutCommand(appointmentId)))
            .WithTags("Yard")
            .RequireAuthorization()
            .RequirePermission(Permissions.Yard.Operate);
    }
}