using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Yard.Entities;
using CoreWMS.Api.Features.Yard.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record CreateYardAppointmentCommand(
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
    Guid? DockLocationId,
    Guid? InboundOrderId,
    Guid? OutboundOrderId,
    bool DirectCheckIn = false // Se true, já cria no status "No Pátio"
) : IRequest<IResult>;

public class CreateYardAppointmentCommandValidator : AbstractValidator<CreateYardAppointmentCommand>
{
    public CreateYardAppointmentCommandValidator()
    {
        RuleFor(x => x.ScheduledDate).NotEmpty().WithMessage("A data do agendamento é obrigatória.");
        RuleFor(x => x.Type).IsInEnum().WithMessage("Tipo de agendamento inválido.");
        When(x => !string.IsNullOrWhiteSpace(x.VehiclePlate), () =>
        {
            RuleFor(x => x.VehiclePlate).MaximumLength(15);
        });
    }
}

public class CreateYardAppointmentHandler : IRequestHandler<CreateYardAppointmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateYardAppointmentHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CreateYardAppointmentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var appointment = new YardAppointment(
            companyId,
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
            request.DockLocationId,
            request.InboundOrderId,
            request.OutboundOrderId
        );

        if (request.DirectCheckIn)
        {
            appointment.CheckIn(request.VehiclePlate, request.DriverName, request.DriverCpf, request.DockLocationId);
        }

        _db.YardAppointments.Add(appointment);

        // Se uma ordem já foi vinculada no agendamento, atualiza a chave estrangeira na ordem
        if (request.InboundOrderId.HasValue)
        {
            var inb = await _db.InboundOrders.FirstOrDefaultAsync(o => o.Id == request.InboundOrderId.Value && o.CompanyId == companyId, ct);
            inb?.LinkYardAppointment(appointment.Id);
        }
        else if (request.OutboundOrderId.HasValue)
        {
            var outb = await _db.OutboundOrders.FirstOrDefaultAsync(o => o.Id == request.OutboundOrderId.Value && o.CompanyId == companyId, ct);
            outb?.LinkYardAppointment(appointment.Id);
        }

        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/yard/appointments/{appointment.Id}", new
        {
            appointment.Id,
            appointment.ReservationCode,
            Message = "Agendamento registrado com sucesso!"
        });
    }
}

public static class CreateYardAppointmentEndpoints
{
    public static void MapCreateYardAppointmentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/yard/appointments", async (CreateYardAppointmentCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .WithTags("Yard")
            .RequireAuthorization()
            .RequirePermission(Permissions.Yard.Manage);
    }
}