using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Yard.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record OutboundAllocatedHuDetailDto(
    Guid AllocationId,
    Guid HandlingUnitId,
    string Lpn,
    string? LocationPath,
    string? PackagingTypeCode,
    string? InboundInvoiceNumber,
    DateTime? InboundReceiptDate,
    string? Batch,
    DateTime? ManufactureDate,
    DateTime? ExpirationDate,
    string? SerialNumber,
    decimal Quantity,
    bool IsPicked,
    string? PickedByName,
    DateTime? PickedAt,
    bool IsChecked,
    string? CheckedByName,
    DateTime? CheckedAt,
    bool IsFractional = false
);

public record OutboundOrderItemDetailDto(
    Guid Id,
    Guid ProductId,
    int LineNumber,
    string SkuCode,
    string Description,
    string Unit,
    decimal ExpectedQuantity,
    decimal AllocatedQuantity,
    decimal PickedQuantity,
    decimal PackedQuantity,
    decimal CheckedQuantity,
    decimal UnitValue,
    decimal InboundUnitValue,
    string Status,
    List<OutboundAllocatedHuDetailDto> Allocations
);

public record OutboundOrderVolumeDetailDto(
    Guid Id,
    string VolumeLpn,
    string PackagingTypeCode,
    string PackagingTypeDescription,
    decimal GrossWeight,
    bool UsedStretchFilm,
    bool IsAutoPacked,
    string? PackedByName,
    DateTime? PackedAt,
    bool IsChecked,
    string? CheckedByName,
    DateTime? CheckedAt
);

public record OutboundFiscalDocumentDto(
    Guid Id,
    string Type,
    string Status,
    string? AccessKey,
    string? Protocol,
    string? ReturnMessage,
    DateTime CreatedAt
);

public record OutboundYardAppointmentDetailDto(
    Guid Id,
    string ReservationCode,
    int Status,
    string StatusDescription,
    string? VehiclePlate,
    string? VehiclePlateState,
    string? DriverName,
    string? DriverCpf,
    string? CarrierName,
    DateTime ScheduledDate,
    DateTime? ArrivedAt,
    DateTime? DockedAt,
    int? StayMinutes,
    Guid? DockLocationId,
    string? DockName
);

public record OutboundOrderFullDetailDto(
    Guid Id,
    Guid CustomerId,
    string CustomerName,
    string OrderNumber,
    string? RequestedBy,
    string? InvoiceNumber,
    string? InvoiceSerie,
    string? AccessKey,
    bool IsReturnToCustomer,
    string? DestinationCnpjCpf,
    string? DestinationName,
    string? DestinationStateRegistration,
    int DestinationIeIndicator,
    string? DestinationStreet,
    string? DestinationNumber,
    string? DestinationComplement,
    string? DestinationNeighborhood,
    int DestinationCityCode,
    string? DestinationCity,
    string? DestinationState,
    string? DestinationZipCode,
    string? CarrierCnpjCpf,
    string? CarrierName,
    string? CarrierStateRegistration,
    string? VehiclePlate,
    string? VehiclePlateState,
    int FreightModality,
    string? AdditionalNotes,
    DateTime IssueDate,
    DateTime ExpectedShipDate,
    string Status,
    Guid? DockLocationId,
    string? DockLocationName,
    bool HasRawXml,
    List<OutboundOrderItemDetailDto> Items,
    List<OutboundOrderVolumeDetailDto> Volumes,
    List<OutboundFiscalDocumentDto> FiscalDocuments,
    OutboundYardAppointmentDetailDto? YardAppointment = null
);

public record GetOutboundOrderByIdQuery(Guid Id) : IRequest<IResult>;

public class GetOutboundOrderByIdHandler : IRequestHandler<GetOutboundOrderByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetOutboundOrderByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetOutboundOrderByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Include(o => o.DockLocation)
            .Include(o => o.Items)
                .ThenInclude(i => i.Product)
            .Include(o => o.Volumes)
                .ThenInclude(v => v.PackagingType)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.Id, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(order.CustomerId))
            return Results.Forbid();

        var allocations = await _db.OutboundAllocations
            .AsNoTracking()
            .Include(a => a.HandlingUnit)
                .ThenInclude(h => h.CurrentLocation)
            .Include(a => a.HandlingUnit)
                .ThenInclude(h => h.PackagingType)
            .Where(a => a.OutboundOrderId == order.Id)
            .ToListAsync(ct);

        // Localiza as notas de remessa/entrada das HUs
        var receiptDocIds = allocations
            .Where(a => a.HandlingUnit?.ReceiptDocumentId != null)
            .Select(a => a.HandlingUnit!.ReceiptDocumentId!.Value)
            .Distinct()
            .ToList();

        var inboundOrders = await _db.InboundOrders
            .AsNoTracking()
            .Where(io => receiptDocIds.Contains(io.Id))
            .ToDictionaryAsync(io => io.Id, ct);

        string? GetInboundInvoiceNumber(Guid? docId)
        {
            if (!docId.HasValue || !inboundOrders.TryGetValue(docId.Value, out var inb))
                return null;

            return !string.IsNullOrWhiteSpace(inb.InvoiceNumber)
                ? inb.InvoiceNumber.TrimStart('0')
                : (!string.IsNullOrWhiteSpace(inb.AccessKey) && inb.AccessKey.Length >= 34
                    ? inb.AccessKey.Substring(25, 9).TrimStart('0')
                    : inb.InvoiceNumber);
        }

        DateTime? GetInboundReceiptDate(Guid? docId, DateTime fallbackDate)
        {
            if (docId.HasValue && inboundOrders.TryGetValue(docId.Value, out var inb))
                return inb.IssueDate;
            return fallbackDate;
        }

        var itemDtos = order.Items.OrderBy(i => i.LineNumber).Select(item =>
        {
            var itemAllocations = allocations
                .Where(a => a.OutboundOrderItemId == item.Id)
                .Select(a => new OutboundAllocatedHuDetailDto(
                    a.Id,
                    a.HandlingUnitId,
                    a.HandlingUnit.Lpn,
                    a.HandlingUnit.CurrentLocation != null ? a.HandlingUnit.CurrentLocation.FullPath : "SEM ENDEREÇO",
                    a.HandlingUnit.PackagingType != null ? a.HandlingUnit.PackagingType.Code : "PLT",
                    GetInboundInvoiceNumber(a.HandlingUnit.ReceiptDocumentId),
                    GetInboundReceiptDate(a.HandlingUnit.ReceiptDocumentId, a.HandlingUnit.CreatedAt),
                    a.HandlingUnit.Batch,
                    a.HandlingUnit.ManufactureDate,
                    a.HandlingUnit.ExpirationDate,
                    a.HandlingUnit.SerialNumber,
                    a.Quantity,
                    a.IsPicked,
                    a.PickedByName,
                    a.PickedAt,
                    a.IsChecked,
                    a.CheckedByName,
                    a.CheckedAt,
                    a.IsFractional
                )).ToList();

            return new OutboundOrderItemDetailDto(
                item.Id,
                item.ProductId,
                item.LineNumber,
                item.SkuCode,
                item.Product != null ? item.Product.Description : item.SkuCode,
                item.Product != null ? item.Product.BaseUnit : "UN",
                item.ExpectedQuantity,
                item.AllocatedQuantity,
                item.PickedQuantity,
                item.PackedQuantity,
                item.CheckedQuantity,
                item.UnitValue,
                item.InboundUnitValue,
                item.Status.ToString(),
                itemAllocations
            );
        }).ToList();

        var volumeDtos = order.Volumes.Select(v => new OutboundOrderVolumeDetailDto(
            v.Id,
            v.VolumeLpn,
            v.PackagingType != null ? v.PackagingType.Code : "VOL",
            v.PackagingType != null ? v.PackagingType.Description : "Volume de Envio",
            v.GrossWeight,
            v.UsedStretchFilm,
            v.IsAutoPacked,
            v.PackedByName,
            v.PackedAt,
            v.IsChecked,
            v.CheckedByName,
            v.CheckedAt
        )).ToList();

        var fiscalDocDtos = await _db.CompanyFiscalDocuments
            .AsNoTracking()
            .Where(f => f.OutboundOrderId == order.Id)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => new OutboundFiscalDocumentDto(
                f.Id,
                f.Type.ToString(),
                f.Status.ToString(),
                f.AccessKey,
                f.Protocol,
                f.ReturnMessage,
                f.CreatedAt
            )).ToListAsync(ct);

        // 1. Busca o Agendamento de Pátio diretamente vinculado (por ID da Ordem ou pela FK direta)
        var yardApp = await _db.YardAppointments
            .AsNoTracking()
            .Include(y => y.DockLocation)
            .FirstOrDefaultAsync(y => (y.OutboundOrderId == order.Id || (order.YardAppointmentId != null && y.Id == order.YardAppointmentId)) && y.CompanyId == companyId, ct);

        OutboundYardAppointmentDetailDto? yardDto = null;
        if (yardApp != null)
        {
            yardDto = new OutboundYardAppointmentDetailDto(
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

        var customerName = order.Customer?.CorporateName ?? "NÃO INFORMADO";

        var dto = new OutboundOrderFullDetailDto(
            order.Id,
            order.CustomerId,
            customerName,
            order.OrderNumber,
            order.RequestedBy,
            order.InvoiceNumber,
            order.InvoiceSerie,
            order.AccessKey,
            order.IsReturnToCustomer,
            order.DestinationCnpjCpf,
            order.DestinationName,
            order.DestinationStateRegistration,
            order.DestinationIeIndicator,
            order.DestinationStreet,
            order.DestinationNumber,
            order.DestinationComplement,
            order.DestinationNeighborhood,
            order.DestinationCityCode,
            order.DestinationCity,
            order.DestinationState,
            order.DestinationZipCode,
            order.CarrierCnpjCpf,
            order.CarrierName,
            order.CarrierStateRegistration,
            order.VehiclePlate,
            order.VehiclePlateState,
            order.FreightModality,
            order.AdditionalNotes,
            order.IssueDate,
            order.ExpectedShipDate,
            order.Status.ToString(),
            order.DockLocationId,
            order.DockLocation != null ? order.DockLocation.FullPath : null,
            !string.IsNullOrWhiteSpace(order.RawXml),
            itemDtos,
            volumeDtos,
            fiscalDocDtos,
            yardDto
        );

        return Results.Ok(dto);
    }
}

public static class GetOutboundOrderByIdEndpoints
{
    public static void MapGetOutboundOrderByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/outbound/orders/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new GetOutboundOrderByIdQuery(id)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.View);
    }
}