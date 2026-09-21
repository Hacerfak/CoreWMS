using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Features.Identity.Constants;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

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
            .Include(o => o.Items)
            .Where(o => o.CompanyId == companyId && o.Id == request.Id)
            .Select(o => new OutboundOrderDetailsDto(
                o.Id, o.CustomerId, o.OrderNumber, o.AccessKey, o.DestinationCnpjCpf, o.DestinationName, o.DestinationCity, o.DestinationState, o.DestinationZipCode,
                o.IssueDate, o.ExpectedShipDate, o.Status.ToString(), o.DockLocationId,
                o.Items.OrderBy(i => i.LineNumber).Select(i => new OutboundOrderItemDto(
                    i.Id, i.ProductId, i.LineNumber, i.SkuCode, i.ExpectedQuantity, i.AllocatedQuantity, i.PickedQuantity, i.PackedQuantity, i.UnitValue, i.Status.ToString()
                )).ToList()
            )).FirstOrDefaultAsync(ct);

        if (order == null) return Results.NotFound();

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