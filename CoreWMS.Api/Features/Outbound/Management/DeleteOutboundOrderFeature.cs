using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record DeleteOutboundOrderCommand(Guid Id) : IRequest<IResult>;

public class DeleteOutboundOrderCommandValidator : AbstractValidator<DeleteOutboundOrderCommand>
{
    public DeleteOutboundOrderCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteOutboundOrderHandler : IRequestHandler<DeleteOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.Volumes)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.Id, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Ordem de saída não encontrada." });

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(order.CustomerId))
            return Results.Forbid();

        // 1. Só pode excluir ordens canceladas
        if (order.Status != OutboundOrderStatus.Canceled)
        {
            return Results.BadRequest(new { Message = "Apenas ordens com status 'Cancelado' podem ser excluídas permanentemente." });
        }

        // 2. Trava de Histórico Fiscal: Se houver documentos fiscais vinculados, proíbe exclusão física
        var hasFiscalDocuments = await _db.CompanyFiscalDocuments
            .AnyAsync(d => d.OutboundOrderId == order.Id, ct);

        if (hasFiscalDocuments)
        {
            return Results.BadRequest(new
            {
                Message = "Esta ordem de saída não pode ser excluída pois possui documentos fiscais vinculados em seu histórico (mesmo cancelados). O histórico fiscal deve ser mantido por exigência legal e de auditoria."
            });
        }

        // 3. Limpeza das entidades dependentes
        var allocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderId == order.Id)
            .ToListAsync(ct);
        if (allocations.Any()) _db.OutboundAllocations.RemoveRange(allocations);

        if (order.Volumes.Any()) _db.Set<Entities.OutboundVolume>().RemoveRange(order.Volumes);
        if (order.Items.Any()) _db.OutboundOrderItems.RemoveRange(order.Items);

        _db.OutboundOrders.Remove(order);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = $"Ordem de saída #{order.OrderNumber} excluída com sucesso." });
    }
}

public static class DeleteOutboundOrderEndpoints
{
    public static void MapDeleteOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/outbound/orders/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteOutboundOrderCommand(id)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}