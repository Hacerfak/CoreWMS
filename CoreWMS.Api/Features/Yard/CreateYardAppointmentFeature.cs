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
    bool DirectCheckIn = false,
    Guid? CustomerId = null
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
        var isPartner = _tenant.IsPartnerUser();
        var allowedCustomerIds = isPartner ? _tenant.GetAllowedCustomerIds() : new List<Guid>();

        // 1. Trava estrita: Entrada direta no pátio é exclusiva da equipe interna
        if (isPartner && request.DirectCheckIn)
        {
            return Results.Forbid();
        }

        Guid? effectiveCustomerId = request.CustomerId;
        Guid? dockLocationId = isPartner ? null : request.DockLocationId;

        // 2. Validação e resolução do depositante para ordens vinculadas ou seleção manual
        Inbound.Entities.InboundOrder? inboundOrder = null;
        Outbound.Entities.OutboundOrder? outboundOrder = null;

        if (request.InboundOrderId.HasValue)
        {
            inboundOrder = await _db.InboundOrders
                .FirstOrDefaultAsync(o => o.Id == request.InboundOrderId.Value && o.CompanyId == companyId, ct);

            if (inboundOrder == null)
                return Results.NotFound(new { Message = "Ordem de entrada não encontrada." });

            if (isPartner && (!inboundOrder.CustomerId.HasValue || !allowedCustomerIds.Contains(inboundOrder.CustomerId.Value)))
                return Results.Forbid();

            effectiveCustomerId ??= inboundOrder.CustomerId;
        }
        else if (request.OutboundOrderId.HasValue)
        {
            outboundOrder = await _db.OutboundOrders
                .FirstOrDefaultAsync(o => o.Id == request.OutboundOrderId.Value && o.CompanyId == companyId, ct);

            if (outboundOrder == null)
                return Results.NotFound(new { Message = "Ordem de saída não encontrada." });

            if (isPartner && !allowedCustomerIds.Contains(outboundOrder.CustomerId))
                return Results.Forbid();

            effectiveCustomerId ??= outboundOrder.CustomerId;
        }

        if (isPartner)
        {
            if (effectiveCustomerId.HasValue)
            {
                if (!allowedCustomerIds.Contains(effectiveCustomerId.Value))
                    return Results.Forbid();
            }
            else if (allowedCustomerIds.Count == 1)
            {
                effectiveCustomerId = allowedCustomerIds[0];
            }
            else
            {
                return Results.BadRequest(new { Message = "Selecione o depositante para registrar o agendamento programado." });
            }
        }

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
            dockLocationId,
            request.InboundOrderId,
            request.OutboundOrderId,
            effectiveCustomerId
        );

        if (!isPartner && request.DirectCheckIn)
        {
            appointment.CheckIn(request.VehiclePlate, request.DriverName, request.DriverCpf, dockLocationId);
        }

        _db.YardAppointments.Add(appointment);

        if (inboundOrder != null)
        {
            inboundOrder.LinkYardAppointment(appointment.Id);
        }
        else if (outboundOrder != null)
        {
            outboundOrder.LinkYardAppointment(appointment.Id);
        }

        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/yard/appointments/{appointment.Id}", new
        {
            appointment.Id,
            appointment.ReservationCode,
            Message = "Agendamento programado registrado com sucesso!"
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
            .RequirePermission(Permissions.Yard.Schedule);
    }
}