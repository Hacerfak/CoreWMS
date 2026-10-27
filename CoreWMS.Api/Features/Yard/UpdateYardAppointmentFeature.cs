using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Yard.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record UpdateYardAppointmentCommand(
    Guid Id,
    YardAppointmentType Type,
    DateTime ScheduledDate,
    string? VehiclePlate,
    string? VehiclePlateState,
    string? DriverName,
    string? DriverCpf,
    string? CarrierName,
    string? CarrierCnpj,
    string? AccessKey,
    string? InvoiceNumber,
    string? InvoiceSerie,
    string? AdditionalNotes,
    Guid? DockLocationId
) : IRequest<IResult>;

public class UpdateYardAppointmentCommandValidator : AbstractValidator<UpdateYardAppointmentCommand>
{
    public UpdateYardAppointmentCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ScheduledDate).NotEmpty().WithMessage("A data do agendamento é obrigatória.");
        RuleFor(x => x.Type).IsInEnum();
    }
}

public class UpdateYardAppointmentHandler : IRequestHandler<UpdateYardAppointmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdateYardAppointmentHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdateYardAppointmentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var appointment = await _db.YardAppointments
            .FirstOrDefaultAsync(y => y.Id == request.Id && y.CompanyId == companyId, ct);

        if (appointment == null)
            return Results.NotFound(new { Message = "Agendamento não encontrado." });

        if (appointment.Status == YardAppointmentStatus.Finished)
            return Results.BadRequest(new { Message = "Não é possível alterar dados de um agendamento já finalizado." });

        appointment.UpdateDetails(
            request.Type,
            request.ScheduledDate,
            request.VehiclePlate,
            request.VehiclePlateState,
            request.DriverName,
            request.DriverCpf,
            request.CarrierName,
            request.CarrierCnpj,
            request.AccessKey,
            request.InvoiceNumber,
            request.InvoiceSerie,
            request.AdditionalNotes,
            request.DockLocationId
        );

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { appointment.Id, Message = "Agendamento atualizado com sucesso!" });
    }
}

public static class UpdateYardAppointmentEndpoints
{
    public static void MapUpdateYardAppointmentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/yard/appointments/{id:guid}", async (Guid id, UpdateYardAppointmentCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
            .WithTags("Yard")
            .RequireAuthorization()
            .RequirePermission(Permissions.Yard.Manage);
    }
}