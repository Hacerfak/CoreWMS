using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record YardMoveToDockCommand(Guid AppointmentId, Guid DockLocationId) : IRequest<IResult>;

public class YardMoveToDockCommandValidator : AbstractValidator<YardMoveToDockCommand>
{
    public YardMoveToDockCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
        RuleFor(x => x.DockLocationId).NotEmpty().WithMessage("A doca de destino é obrigatória.");
    }
}

public class YardMoveToDockHandler : IRequestHandler<YardMoveToDockCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public YardMoveToDockHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(YardMoveToDockCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var appointment = await _db.YardAppointments
            .Include(y => y.DockLocation)
            .FirstOrDefaultAsync(y => y.Id == request.AppointmentId && y.CompanyId == companyId, ct);

        if (appointment == null) return Results.NotFound(new { Message = "Agendamento não encontrado." });

        try
        {
            appointment.MoveToDock(request.DockLocationId);
            await _db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                appointment.Id,
                Status = appointment.Status.ToString(),
                appointment.DockLocationId,
                Message = "Veículo posicionado na doca com sucesso!"
            });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
    }
}

public static class YardMoveToDockEndpoints
{
    public static void MapYardMoveToDockEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/yard/appointments/{appointmentId:guid}/move-to-dock", async (
            Guid appointmentId,
            Guid dockLocationId,
            IMediator mediator) =>
            await mediator.Send(new YardMoveToDockCommand(appointmentId, dockLocationId)))
            .WithTags("Yard")
            .RequireAuthorization()
            .RequirePermission(Permissions.Yard.Operate);
    }
}