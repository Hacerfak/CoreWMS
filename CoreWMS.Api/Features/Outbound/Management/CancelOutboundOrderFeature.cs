using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Operations;
using CoreWMS.Api.Features.Fiscal.Queries;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound.Management;

public record CancelOutboundOrderRequest(string Reason);
public record CancelOutboundOrderCommand(Guid Id, string Reason) : IRequest<IResult>;

public class CancelOutboundOrderCommandValidator : AbstractValidator<CancelOutboundOrderCommand>
{
    public CancelOutboundOrderCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("O motivo do cancelamento é obrigatório.")
            .MinimumLength(15).WithMessage("O motivo do cancelamento deve conter no mínimo 15 caracteres.")
            .MaximumLength(500).WithMessage("O motivo do cancelamento deve conter no máximo 500 caracteres.");
    }
}

public class CancelOutboundOrderHandler : IRequestHandler<CancelOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;
    private readonly IMediator _mediator;

    public CancelOutboundOrderHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IHttpContextAccessor http,
        IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(CancelOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.Id, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status == OutboundOrderStatus.Canceled)
            return Results.BadRequest(new { Message = "O pedido já está cancelado." });

        if (order.Status == OutboundOrderStatus.Shipped)
        {
            return Results.BadRequest(new
            {
                Message = "Não é possível cancelar directamente um pedido expedido (Shipped). Execute o 'Estorno de Expedição' primeiro para restaurar o estoque."
            });
        }

        // 1. DELEGAÇÃO AO FISCAL: Verifica a existência de notas fiscais autorizadas vinculadas à ordem
        var hasAuthorizedInvoices = await _mediator.Send(new HasActiveFiscalDocumentByOutboundOrderQuery(order.Id), ct);

        if (hasAuthorizedInvoices)
        {
            return Results.BadRequest(new
            {
                Message = "Não é possível cancelar o pedido pois existem notas fiscais autorizadas vinculadas. Cancele as notas fiscais na SEFAZ primeiro."
            });
        }

        // 2. Localiza as alocações da ordem no domínio de Outbound
        var allocations = await _db.OutboundAllocations
            .Where(a => a.OutboundOrderId == order.Id)
            .ToListAsync(ct);

        if (allocations.Any())
        {
            var itemsMap = order.Items.ToDictionary(i => i.Id, i => i.ProductId);
            var allocationDtos = allocations.Select(a => new CancelAllocationItemDto(
                itemsMap.TryGetValue(a.OutboundOrderItemId, out var prodId) ? prodId : Guid.Empty,
                a.Quantity,
                a.HandlingUnitId
            )).Where(a => a.ProductId != Guid.Empty).ToList();

            // 3. DELEGAÇÃO AO INVENTORY: Liberta as reservas de saldo (Unallocate) e reabre HUs consumidas
            await _mediator.Send(new CancelOutboundInventoryAllocationsCommand(
                order.CustomerId,
                order.DockLocationId,
                allocationDtos
            ), ct);

            // Remove as alocações da ordem
            _db.OutboundAllocations.RemoveRange(allocations);
        }

        // 4. Limpeza interna de registros do módulo Outbound
        var checkLogs = await _db.OutboundCheckLogs
            .Where(c => c.OutboundOrderId == order.Id)
            .ToListAsync(ct);
        if (checkLogs.Any()) _db.OutboundCheckLogs.RemoveRange(checkLogs);

        var volumes = await _db.OutboundVolumes
            .Where(v => v.OutboundOrderId == order.Id)
            .ToListAsync(ct);
        if (volumes.Any()) _db.OutboundVolumes.RemoveRange(volumes);

        var itemPacks = await _db.OutboundItemPacks
            .Where(p => p.OutboundOrderId == order.Id)
            .ToListAsync(ct);
        if (itemPacks.Any()) _db.OutboundItemPacks.RemoveRange(itemPacks);

        // 5. DELEGAÇÃO AO BILLING: Expurga itens de facturação abertos e agenda recálculo de diárias
        await _mediator.Send(new RollbackOutboundBillingCommand(
            order.Id,
            order.OrderNumber,
            order.CustomerId
        ), ct);

        // 6. Cancela a ordem no domínio
        var user = _http.HttpContext?.User;
        var userName = user?.FindFirst("Name")?.Value ?? user?.Identity?.Name ?? "Operador";
        var formattedReason = $"{request.Reason.Trim()} (por {userName})";
        order.Cancel(formattedReason);

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito ao cancelar o pedido. Tente novamente." });
        }

        return Results.Ok(new { Message = "Pedido cancelado, HUs físicas reativadas, conferência e reservas estornadas com sucesso." });
    }
}

public static class CancelOutboundOrderEndpoints
{
    public static void MapCancelOutboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/outbound/orders/{id:guid}/cancel", async (Guid id, [FromBody] CancelOutboundOrderRequest req, IMediator mediator) =>
            await mediator.Send(new CancelOutboundOrderCommand(id, req.Reason)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);

        app.MapDelete("/api/outbound/orders/{id:guid}/cancel", async (Guid id, [FromBody] CancelOutboundOrderRequest req, IMediator mediator) =>
            await mediator.Send(new CancelOutboundOrderCommand(id, req.Reason)))
           .WithTags("Outbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Outbound.Manage);
    }
}