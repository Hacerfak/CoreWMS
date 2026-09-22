using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Management;

public record DeleteInboundOrderCommand(Guid Id) : IRequest<IResult>;

public class DeleteInboundOrderHandler : IRequestHandler<DeleteInboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteInboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteInboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.InboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.Id, ct);

        if (order == null) return Results.NotFound();

        if (order.Status != InboundOrderStatus.Canceled)
        {
            return Results.BadRequest(new { Message = "Apenas ordens no estado 'Cancelada' podem ser excluídas definitivamente." });
        }

        _db.InboundOrders.Remove(order);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public static class DeleteInboundOrderEndpoints
{
    public static void MapDeleteInboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/inbound/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteInboundOrderCommand(id)))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Manage);
    }
}