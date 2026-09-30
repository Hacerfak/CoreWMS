using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

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
    string Status
);

public record OutboundOrderFullDetailDto(
    Guid Id,
    Guid CustomerId,
    string CustomerName,
    string OrderNumber,
    string? AccessKey,
    string DestinationCnpjCpf,
    string DestinationName,
    string DestinationCity,
    string DestinationState,
    string? DestinationZipCode,
    string? CarrierCnpjCpf,
    string? CarrierName,
    string? AdditionalNotes,
    DateTime IssueDate,
    DateTime? ExpectedShipDate,
    string Status,
    Guid? DockLocationId,
    bool HasRawXml,
    List<OutboundOrderItemDetailDto> Items
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
            .Include(o => o.Items)
                .ThenInclude(i => i.Product)
            .Where(o => o.CompanyId == companyId && o.Id == request.Id)
            .Select(o => new OutboundOrderFullDetailDto(
                o.Id,
                o.CustomerId,
                o.Customer.CorporateName,
                o.OrderNumber,
                o.AccessKey,
                o.DestinationCnpjCpf,
                o.DestinationName,
                o.DestinationCity,
                o.DestinationState,
                o.DestinationZipCode,
                o.CarrierCnpjCpf,
                o.CarrierName,
                o.AdditionalNotes,
                o.IssueDate,
                o.ExpectedShipDate,
                o.Status.ToString(),
                o.DockLocationId,
                !string.IsNullOrWhiteSpace(o.RawXml),
                o.Items.OrderBy(i => i.LineNumber).Select(i => new OutboundOrderItemDetailDto(
                    i.Id,
                    i.ProductId,
                    i.LineNumber,
                    i.SkuCode,
                    i.Product != null ? i.Product.Description : i.SkuCode,
                    i.Product != null ? i.Product.BaseUnit : "UN",
                    i.ExpectedQuantity,
                    i.AllocatedQuantity,
                    i.PickedQuantity,
                    i.PackedQuantity,
                    i.UnitValue,
                    i.Status.ToString()
                )).ToList()
            )).FirstOrDefaultAsync(ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(order.CustomerId))
            return Results.Forbid();

        return Results.Ok(order);
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