using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Yard.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record ListYardAppointmentsQuery(
    DateTime? StartDate,
    DateTime? EndDate,
    YardAppointmentStatus? Status,
    YardAppointmentType? Type,
    string? SearchTerm,
    Guid? CustomerId = null
) : IRequest<IResult>;

public class ListYardAppointmentsHandler : IRequestHandler<ListYardAppointmentsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListYardAppointmentsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListYardAppointmentsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var query = _db.YardAppointments
            .AsNoTracking()
            .Include(y => y.Customer)
            .Include(y => y.DockLocation)
            .Include(y => y.InboundOrder)
                .ThenInclude(o => o!.Customer)
            .Include(y => y.OutboundOrder)
                .ThenInclude(o => o!.Customer)
            .Where(y => y.CompanyId == companyId);

        // Viseira B2B: usuário externo visualiza apenas agendamentos dos seus depositantes
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(y =>
                (y.CustomerId.HasValue && allowedCustomerIds.Contains(y.CustomerId.Value)) ||
                (y.InboundOrder != null && y.InboundOrder.CustomerId.HasValue && allowedCustomerIds.Contains(y.InboundOrder.CustomerId.Value)) ||
                (y.OutboundOrder != null && allowedCustomerIds.Contains(y.OutboundOrder.CustomerId))
            );
        }

        if (request.CustomerId.HasValue)
        {
            query = query.Where(y =>
                y.CustomerId == request.CustomerId.Value ||
                (y.InboundOrder != null && y.InboundOrder.CustomerId == request.CustomerId.Value) ||
                (y.OutboundOrder != null && y.OutboundOrder.CustomerId == request.CustomerId.Value)
            );
        }

        if (request.StartDate.HasValue)
        {
            var startUtc = request.StartDate.Value.Date.ToUniversalTime();
            query = query.Where(y => y.ScheduledDate >= startUtc);
        }

        if (request.EndDate.HasValue)
        {
            var endUtc = request.EndDate.Value.Date.AddDays(1).AddTicks(-1).ToUniversalTime();
            query = query.Where(y => y.ScheduledDate <= endUtc);
        }

        if (request.Status.HasValue)
        {
            query = query.Where(y => y.Status == request.Status.Value);
        }

        if (request.Type.HasValue)
        {
            query = query.Where(y => y.Type == request.Type.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var term = request.SearchTerm.Trim().ToUpper();
            query = query.Where(y =>
                y.ReservationCode.Contains(term) ||
                (y.VehiclePlate != null && y.VehiclePlate.Contains(term)) ||
                (y.DriverName != null && y.DriverName.ToUpper().Contains(term)) ||
                (y.DriverCpf != null && y.DriverCpf.Contains(term)) ||
                (y.AccessKey != null && y.AccessKey.Contains(term)) ||
                (y.InvoiceNumber != null && y.InvoiceNumber.Contains(term))
            );
        }

        var rawAppointments = await query
            .OrderByDescending(y => y.ScheduledDate)
            .ToListAsync(ct);

        var appointments = rawAppointments.Select(y =>
        {
            var customerId = y.CustomerId ?? y.InboundOrder?.CustomerId ?? y.OutboundOrder?.CustomerId;
            var customerName = y.Customer?.CorporateName
                ?? y.InboundOrder?.Customer?.CorporateName
                ?? y.OutboundOrder?.Customer?.CorporateName;

            return new YardAppointmentDto(
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
                y.ArrivedAt.HasValue
                    ? (int)((y.DepartedAt ?? DateTime.UtcNow) - y.ArrivedAt.Value).TotalMinutes
                    : null,
                y.DockLocationId,
                y.DockLocation?.FullPath,
                y.AccessKey,
                y.InvoiceNumber,
                y.InvoiceSerie,
                y.AdditionalNotes,
                y.InboundOrderId,
                y.InboundOrder?.InvoiceNumber,
                y.OutboundOrderId,
                y.OutboundOrder?.OrderNumber,
                customerId,
                customerName
            );
        }).ToList();

        return Results.Ok(appointments);
    }
}

public static class ListYardAppointmentsEndpoints
{
    public static void MapListYardAppointmentsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/yard/appointments", async (
            DateTime? startDate,
            DateTime? endDate,
            YardAppointmentStatus? status,
            YardAppointmentType? type,
            string? search,
            Guid? customerId,
            IMediator mediator) =>
            await mediator.Send(new ListYardAppointmentsQuery(startDate, endDate, status, type, search, customerId)))
            .WithTags("Yard")
            .RequireAuthorization()
            .RequirePermission(Permissions.Yard.View);
    }
}