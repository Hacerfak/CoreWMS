using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record OutboundAllocatedHuDetailDto(
    Guid AllocationId,
    Guid HandlingUnitId,
    string Lpn,
    string? LocationPath,
    string? Batch,
    DateTime? ExpirationDate,
    decimal Quantity,
    bool IsPicked
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
    decimal UnitValue,
    string Status,
    List<OutboundAllocatedHuDetailDto> Allocations
);

public record OutboundOrderVolumeDetailDto(
    Guid Id,
    string VolumeLpn,
    string PackagingTypeCode,
    string PackagingTypeDescription,
    decimal GrossWeight,
    bool UsedStretchFilm
);

public record OutboundOrderFullDetailDto(
    Guid Id,
    Guid CustomerId,
    string CustomerName,
    string OrderNumber,
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
    List<OutboundOrderVolumeDetailDto> Volumes
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

        // Busca todas as alocações e HUs vinculadas
        var allocations = await _db.OutboundAllocations
            .AsNoTracking()
            .Include(a => a.HandlingUnit)
                .ThenInclude(h => h.CurrentLocation)
            .Where(a => a.OutboundOrderId == order.Id)
            .ToListAsync(ct);

        var itemDtos = order.Items.OrderBy(i => i.LineNumber).Select(item =>
        {
            var itemAllocations = allocations
                .Where(a => a.OutboundOrderItemId == item.Id)
                .Select(a => new OutboundAllocatedHuDetailDto(
                    a.Id,
                    a.HandlingUnitId,
                    a.HandlingUnit.Lpn,
                    a.HandlingUnit.CurrentLocation != null ? a.HandlingUnit.CurrentLocation.FullPath : "SEM ENDEREÇO",
                    a.HandlingUnit.Batch,
                    a.HandlingUnit.ExpirationDate,
                    a.Quantity,
                    a.IsPicked
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
                item.UnitValue,
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
            v.UsedStretchFilm
        )).ToList();

        var dto = new OutboundOrderFullDetailDto(
            order.Id,
            order.CustomerId,
            order.Customer.CorporateName,
            order.OrderNumber,
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
            volumeDtos
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