using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Yard.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Management;

public record GetInboundOrderByIdQuery(Guid Id) : IRequest<IResult>;

public class GetInboundOrderByIdHandler : IRequestHandler<GetInboundOrderByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetInboundOrderByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetInboundOrderByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.InboundOrders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Include(o => o.Items)
                .ThenInclude(i => i.DockLocation)
            .Include(o => o.Items)
                .ThenInclude(i => i.Product)
            .Where(o => o.CompanyId == companyId && o.Id == request.Id);

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(o => o.CustomerId.HasValue && allowedCustomerIds.Contains(o.CustomerId.Value));
        }

        var order = await query.FirstOrDefaultAsync(ct);

        if (order == null)
            return Results.NotFound(new { Message = "Ordem de recebimento não encontrada." });

        // Busca o agendamento de pátio vinculado
        var yardApp = await _db.YardAppointments
            .AsNoTracking()
            .Include(y => y.DockLocation)
            .FirstOrDefaultAsync(y => (y.InboundOrderId == order.Id || (order.YardAppointmentId != null && y.Id == order.YardAppointmentId)) && y.CompanyId == companyId, ct);

        InboundYardAppointmentDetailDto? yardDto = null;
        if (yardApp != null)
        {
            yardDto = new InboundYardAppointmentDetailDto(
                yardApp.Id,
                yardApp.ReservationCode,
                (int)yardApp.Status,
                yardApp.Status switch
                {
                    YardAppointmentStatus.Scheduled => "Agendado",
                    YardAppointmentStatus.InYard => "No Pátio",
                    YardAppointmentStatus.InDock => "Na Doca",
                    YardAppointmentStatus.Finished => "Finalizado",
                    YardAppointmentStatus.Canceled => "Cancelado",
                    _ => yardApp.Status.ToString()
                },
                yardApp.VehiclePlate,
                yardApp.VehiclePlateState,
                yardApp.DriverName,
                yardApp.DriverCpf,
                yardApp.CarrierName,
                yardApp.ScheduledDate,
                yardApp.ArrivedAt,
                yardApp.DockedAt,
                yardApp.ArrivedAt.HasValue ? (int)((yardApp.DepartedAt ?? DateTime.UtcNow) - yardApp.ArrivedAt.Value).TotalMinutes : null,
                yardApp.DockLocationId,
                yardApp.DockLocation?.FullPath
            );
        }

        var itemDtos = order.Items.OrderBy(i => i.LineNumber).Select(i => new InboundOrderItemDto(
            i.Id,
            i.ProductId,
            i.LineNumber,
            i.Product != null ? i.Product.Sku : i.RawSkuCode,
            i.Product != null ? i.Product.Description : i.RawDescription,
            i.Product != null ? i.Product.BaseUnit : i.RawUnit,
            i.ExpectedQuantity,
            i.ReceivedQuantity,
            i.Status.ToString(),
            i.LockedByUserId,
            i.DockLocationId,
            i.DockLocation != null ? i.DockLocation.FullPath : null,
            i.ExpectedBatch,
            i.ExpectedManufactureDate,
            i.ExpectedExpirationDate
        )).ToList();

        var dto = new InboundOrderDetailsDto(
            order.Id,
            order.CustomerId,
            order.Customer != null ? order.Customer.CorporateName : null,
            order.IssuerCnpj,
            order.IssuerName,
            order.AccessKey,
            order.RawXml,
            order.IssueDate,
            order.CreatedAt,
            order.Status.ToString(),
            order.LastSefazManifestType,
            order.SefazManifestProtocol,
            order.SefazManifestDate,
            order.SefazManifestJustification,
            itemDtos,
            yardDto
        );

        return Results.Ok(dto);
    }
}

public static class GetInboundOrderByIdEndpoints
{
    public static void MapGetInboundOrderByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inbound/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetInboundOrderByIdQuery(id)))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.View);
    }
}