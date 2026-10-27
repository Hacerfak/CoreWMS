using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Yard.Entities;
using CoreWMS.Api.Features.Yard.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

// 1. DTOs de Listagem para os Modais de Vínculo
public record AvailableAppointmentForLinkDto(
    Guid Id,
    string ReservationCode,
    YardAppointmentType Type,
    YardAppointmentStatus Status,
    string StatusDescription,
    string? VehiclePlate,
    string? DriverName,
    string? CarrierName,
    DateTime ScheduledDate,
    string? InvoiceNumber
);

public record AvailableOrderForLinkDto(
    Guid Id,
    string OrderNumber,
    string? InvoiceNumber,
    string? CustomerOrDestinationName,
    DateTime IssueDate,
    string Status,
    string? CarrierName,
    string? VehiclePlate
);

// 2. Comandos e Consultas
public record LinkOrderToAppointmentCommand(
    Guid AppointmentId,
    YardAppointmentType Type,
    Guid OrderId
) : IRequest<IResult>;

public record UnlinkYardAppointmentCommand(
    Guid AppointmentId
) : IRequest<IResult>;

public record GetAvailableAppointmentsForLinkQuery(YardAppointmentType Type) : IRequest<IResult>;
public record GetAvailableOrdersForLinkQuery(YardAppointmentType Type) : IRequest<IResult>;
public record GetYardAppointmentByOrderQuery(Guid OrderId) : IRequest<IResult>;

// 3. Validadores
public class LinkOrderToAppointmentCommandValidator : AbstractValidator<LinkOrderToAppointmentCommand>
{
    public LinkOrderToAppointmentCommandValidator()
    {
        RuleFor(x => x.AppointmentId).NotEmpty();
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.Type).IsInEnum();
    }
}

// 4. Handlers
public class LinkYardAppointmentHandler :
    IRequestHandler<LinkOrderToAppointmentCommand, IResult>,
    IRequestHandler<UnlinkYardAppointmentCommand, IResult>,
    IRequestHandler<GetAvailableAppointmentsForLinkQuery, IResult>,
    IRequestHandler<GetAvailableOrdersForLinkQuery, IResult>,
    IRequestHandler<GetYardAppointmentByOrderQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public LinkYardAppointmentHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    // A. Vincular Ordem a um Agendamento
    public async Task<IResult> Handle(LinkOrderToAppointmentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var appointment = await _db.YardAppointments
            .FirstOrDefaultAsync(y => y.Id == request.AppointmentId && y.CompanyId == companyId, ct);

        if (appointment == null)
            return Results.NotFound(new { Message = "Agendamento não encontrado." });

        if (appointment.Status != YardAppointmentStatus.Scheduled && appointment.Status != YardAppointmentStatus.InYard)
        {
            return Results.BadRequest(new
            {
                Message = $"Apenas agendamentos em status 'Agendado' ou 'No Pátio' podem ser vinculados. Status atual: {appointment.Status}."
            });
        }

        // Vínculo com Ordem de Entrada
        if (request.Type == YardAppointmentType.Inbound)
        {
            var inboundOrder = await _db.InboundOrders
                .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

            if (inboundOrder == null)
                return Results.NotFound(new { Message = "Ordem de entrada não encontrada." });

            if (inboundOrder.Status == InboundOrderStatus.Completed || inboundOrder.Status == InboundOrderStatus.Canceled)
                return Results.BadRequest(new { Message = "Não é possível vincular uma ordem de entrada já finalizada ou cancelada." });

            if (inboundOrder.YardAppointmentId.HasValue && inboundOrder.YardAppointmentId.Value != appointment.Id)
                return Results.BadRequest(new { Message = "Esta ordem de entrada já está vinculada a outro agendamento." });

            appointment.LinkInboundOrder(inboundOrder.Id, inboundOrder.InvoiceNumber, inboundOrder.AccessKey);
            inboundOrder.LinkYardAppointment(appointment.Id);
        }
        // Vínculo com Ordem de Saída
        else if (request.Type == YardAppointmentType.Outbound)
        {
            var outboundOrder = await _db.OutboundOrders
                .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

            if (outboundOrder == null)
                return Results.NotFound(new { Message = "Ordem de saída não encontrada." });

            if (outboundOrder.Status == OutboundOrderStatus.Shipped || outboundOrder.Status == OutboundOrderStatus.Canceled)
                return Results.BadRequest(new { Message = "Não é possível vincular um pedido de saída já expedido ou cancelado." });

            if (outboundOrder.YardAppointmentId.HasValue && outboundOrder.YardAppointmentId.Value != appointment.Id)
                return Results.BadRequest(new { Message = "Esta ordem de saída já está vinculada a outro agendamento." });

            appointment.LinkOutboundOrder(
                outboundOrder.Id,
                outboundOrder.OrderNumber,
                outboundOrder.InvoiceNumber,
                outboundOrder.AccessKey,
                outboundOrder.DockLocationId,
                outboundOrder.VehiclePlate,
                outboundOrder.CarrierName
            );
            outboundOrder.LinkYardAppointment(appointment.Id);
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            appointment.Id,
            appointment.ReservationCode,
            Message = "Ordem vinculada ao agendamento com sucesso!"
        });
    }

    // B. Desvincular Ordem do Agendamento
    public async Task<IResult> Handle(UnlinkYardAppointmentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var appointment = await _db.YardAppointments
            .Include(y => y.InboundOrder)
            .Include(y => y.OutboundOrder)
            .FirstOrDefaultAsync(y => y.Id == request.AppointmentId && y.CompanyId == companyId, ct);

        if (appointment == null)
            return Results.NotFound(new { Message = "Agendamento não encontrado." });

        if (appointment.Status != YardAppointmentStatus.Scheduled && appointment.Status != YardAppointmentStatus.InYard)
        {
            return Results.BadRequest(new
            {
                Message = $"Não é permitido desvincular ordens de um agendamento em status '{appointment.Status}'."
            });
        }

        if (appointment.InboundOrder != null)
        {
            appointment.InboundOrder.UnlinkYardAppointment();
        }

        if (appointment.OutboundOrder != null)
        {
            appointment.OutboundOrder.UnlinkYardAppointment();
        }

        appointment.UnlinkOrder();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Vínculo removido com sucesso." });
    }

    // C. Listar Agendamentos Disponíveis para Vínculo
    public async Task<IResult> Handle(GetAvailableAppointmentsForLinkQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var appointments = await _db.YardAppointments
            .AsNoTracking()
            .Where(y => y.CompanyId == companyId &&
                        y.Type == request.Type &&
                        (y.Status == YardAppointmentStatus.Scheduled || y.Status == YardAppointmentStatus.InYard) &&
                        (request.Type == YardAppointmentType.Inbound ? y.InboundOrderId == null : y.OutboundOrderId == null))
            .OrderByDescending(y => y.ScheduledDate)
            .Select(y => new AvailableAppointmentForLinkDto(
                y.Id,
                y.ReservationCode,
                y.Type,
                y.Status,
                y.Status == YardAppointmentStatus.Scheduled ? "Agendado" : "No Pátio",
                y.VehiclePlate,
                y.DriverName,
                y.CarrierName,
                y.ScheduledDate,
                y.InvoiceNumber
            ))
            .ToListAsync(ct);

        return Results.Ok(appointments);
    }

    // D. Listar Ordens Disponíveis para Vínculo
    public async Task<IResult> Handle(GetAvailableOrdersForLinkQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (request.Type == YardAppointmentType.Inbound)
        {
            var orders = await _db.InboundOrders
                .AsNoTracking()
                .Include(o => o.Customer)
                .Where(o => o.CompanyId == companyId &&
                            o.YardAppointmentId == null &&
                            o.Status != InboundOrderStatus.Completed &&
                            o.Status != InboundOrderStatus.Canceled)
                .OrderByDescending(o => o.CreatedAt)
                .Select(o => new AvailableOrderForLinkDto(
                    o.Id,
                    o.InvoiceNumber ?? (o.AccessKey.Length >= 34 ? o.AccessKey.Substring(25, 9) : "S/N"),
                    o.InvoiceNumber,
                    o.Customer != null ? o.Customer.CorporateName : o.IssuerName,
                    o.IssueDate,
                    o.Status.ToString(),
                    null,
                    null
                ))
                .ToListAsync(ct);

            return Results.Ok(orders);
        }
        else
        {
            var orders = await _db.OutboundOrders
                .AsNoTracking()
                .Include(o => o.Customer)
                .Where(o => o.CompanyId == companyId &&
                            o.YardAppointmentId == null &&
                            o.Status != OutboundOrderStatus.Shipped &&
                            o.Status != OutboundOrderStatus.Canceled)
                .OrderByDescending(o => o.CreatedAt)
                .Select(o => new AvailableOrderForLinkDto(
                    o.Id,
                    o.OrderNumber,
                    o.InvoiceNumber,
                    o.DestinationName ?? (o.Customer != null ? o.Customer.CorporateName : "Cliente"),
                    o.IssueDate,
                    o.Status.ToString(),
                    o.CarrierName,
                    o.VehiclePlate
                ))
                .ToListAsync(ct);

            return Results.Ok(orders);
        }
    }

    // E. Obter Agendamento pelo ID da Ordem (Inbound ou Outbound)
    public async Task<IResult> Handle(GetYardAppointmentByOrderQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var y = await _db.YardAppointments
            .AsNoTracking()
            .Include(x => x.DockLocation)
            .Include(x => x.InboundOrder)
            .Include(x => x.OutboundOrder)
            .FirstOrDefaultAsync(x => (x.OutboundOrderId == request.OrderId || x.InboundOrderId == request.OrderId) && x.CompanyId == companyId, ct);

        if (y == null)
            return Results.NotFound(new { Message = "Nenhum agendamento vinculado a esta ordem." });

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
            y.DockLocation != null ? y.DockLocation.FullPath : null,
            y.AccessKey,
            y.InvoiceNumber,
            y.InvoiceSerie,
            y.AdditionalNotes,
            y.InboundOrderId,
            y.InboundOrder != null ? y.InboundOrder.InvoiceNumber : null,
            y.OutboundOrderId,
            y.OutboundOrder != null ? y.OutboundOrder.OrderNumber : null
        );

        return Results.Ok(dto);
    }
}

// 5. Mapeamento de Endpoints
public static class LinkYardAppointmentEndpoints
{
    public static void MapLinkYardAppointmentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/yard").WithTags("Yard").RequireAuthorization();

        // Vincular Ordem <-> Agendamento
        group.MapPost("/appointments/{appointmentId:guid}/link-order", async (
            Guid appointmentId,
            [FromQuery] YardAppointmentType type,
            [FromQuery] Guid orderId,
            IMediator mediator) =>
            await mediator.Send(new LinkOrderToAppointmentCommand(appointmentId, type, orderId)))
            .RequirePermission(Permissions.Yard.Operate);

        // Desvincular Ordem do Agendamento
        group.MapPost("/appointments/{appointmentId:guid}/unlink-order", async (
            Guid appointmentId,
            IMediator mediator) =>
            await mediator.Send(new UnlinkYardAppointmentCommand(appointmentId)))
            .RequirePermission(Permissions.Yard.Operate);

        // Busca o agendamento associado à ordem (Entrada ou Saída)
        group.MapGet("/appointments/by-order/{orderId:guid}", async (Guid orderId, IMediator mediator) =>
            await mediator.Send(new GetYardAppointmentByOrderQuery(orderId)))
            .RequirePermission(Permissions.Yard.View);

        // Listas auxiliares para modais
        group.MapGet("/appointments/available-for-linking", async (
            [FromQuery] YardAppointmentType type,
            IMediator mediator) =>
            await mediator.Send(new GetAvailableAppointmentsForLinkQuery(type)))
            .RequirePermission(Permissions.Yard.View);

        group.MapGet("/orders/available-for-linking", async (
            [FromQuery] YardAppointmentType type,
            IMediator mediator) =>
            await mediator.Send(new GetAvailableOrdersForLinkQuery(type)))
            .RequirePermission(Permissions.Yard.View);
    }
}