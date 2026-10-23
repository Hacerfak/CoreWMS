using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Checking;

public record CheckingItemDto(
    Guid OrderItemId,
    Guid ProductId,
    string SkuCode,
    string Description,
    string Unit,
    decimal ExpectedQuantity,
    decimal PickedQuantity,
    decimal PackedQuantity,
    decimal CheckedQuantity,
    bool IsFullyChecked
);

public record CheckingVolumeHuDto(
    Guid Id,
    string Lpn,
    string SkuCode,
    decimal Quantity,
    string Unit,
    string? LocationPath,
    bool IsPicked,
    string? PickedByName,
    DateTime? PickedAt,
    bool IsChecked,
    string? CheckedByName,
    DateTime? CheckedAt
);

public record OutboundCheckingSummaryDto(
    Guid OrderId,
    string OrderNumber,
    string CustomerName,
    string Status,
    decimal TotalExpected,
    decimal TotalPicked,
    decimal TotalChecked,
    bool IsOrderFullyChecked,
    bool HasFractionalPendingPacking, // <-- Novo parâmetro
    List<CheckingItemDto> Items,
    List<CheckingVolumeHuDto> Volumes
);

public record GetOutboundCheckingTasksQuery(Guid OrderId) : IRequest<IResult>;

public class GetOutboundCheckingTasksHandler : IRequestHandler<GetOutboundCheckingTasksQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetOutboundCheckingTasksHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetOutboundCheckingTasksQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId && o.CompanyId == companyId, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        var allocations = await _db.OutboundAllocations
            .AsNoTracking()
            .Include(a => a.HandlingUnit).ThenInclude(h => h.CurrentLocation)
            .Include(a => a.OutboundOrderItem)
            .Where(a => a.OutboundOrderId == order.Id)
            .ToListAsync(ct);

        var itemsDto = order.Items.OrderBy(i => i.LineNumber).Select(i => new CheckingItemDto(
            i.Id,
            i.ProductId,
            i.SkuCode,
            i.Product?.Description ?? i.SkuCode,
            i.Product?.BaseUnit ?? "UN",
            i.ExpectedQuantity,
            i.PickedQuantity,
            i.PackedQuantity,
            i.CheckedQuantity,
            i.CheckedQuantity >= i.ExpectedQuantity
        )).ToList();

        var volumesDto = allocations.Select(a => new CheckingVolumeHuDto(
            a.Id,
            a.HandlingUnit.Lpn,
            a.OutboundOrderItem.SkuCode,
            a.Quantity,
            a.OutboundOrderItem.Product?.BaseUnit ?? "UN",
            a.HandlingUnit.CurrentLocation?.FullPath ?? "DOCA",
            a.IsPicked,
            a.PickedByName,
            a.PickedAt,
            a.IsChecked,
            a.CheckedByName,
            a.CheckedAt
        )).OrderBy(v => v.IsChecked).ThenBy(v => v.Lpn).ToList();

        decimal totalExp = itemsDto.Sum(i => i.ExpectedQuantity);
        decimal totalPck = itemsDto.Sum(i => i.PickedQuantity);
        decimal totalChk = itemsDto.Sum(i => i.CheckedQuantity);

        bool hasFractionalPendingPacking = allocations.Any(a => a.IsFractional && !a.OutboundOrderItem.Status.HasFlag(Enums.OutboundOrderItemStatus.Packed));

        var response = new OutboundCheckingSummaryDto(
            order.Id,
            order.OrderNumber,
            order.Customer.CorporateName,
            order.Status.ToString(),
            totalExp,
            totalPck,
            totalChk,
            totalChk >= totalExp && totalExp > 0,
            hasFractionalPendingPacking, // Exposto
            itemsDto,
            volumesDto
        );

        return Results.Ok(response);
    }
}

public static class GetOutboundCheckingTasksEndpoints
{
    public static void MapGetOutboundCheckingTasksEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/outbound/checking/{orderId:guid}/tasks", async (Guid orderId, IMediator mediator) =>
            await mediator.Send(new GetOutboundCheckingTasksQuery(orderId)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.View);
    }
}