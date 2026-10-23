using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Outbound.Enums;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

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

    public CancelOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(CancelOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.OutboundOrders
            .Include(o => o.Items)
            .Include(o => o.Volumes)
            .Include(o => o.DockLocation)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.Id, ct);

        if (order == null) return Results.NotFound(new { Message = "Pedido de saída não encontrado." });

        if (order.Status == OutboundOrderStatus.Canceled)
            return Results.BadRequest(new { Message = "O pedido já está cancelado." });

        if (order.Status == OutboundOrderStatus.Shipped)
        {
            return Results.BadRequest(new
            {
                Message = "Não é possível cancelar diretamente um pedido expedido (Shipped). Execute o 'Estorno de Expedição' primeiro para restaurar o estoque."
            });
        }

        var hasAuthorizedInvoices = await _db.CompanyFiscalDocuments
            .AnyAsync(d => d.OutboundOrderId == order.Id
                        && (int)d.Type >= 1 && (int)d.Type <= 6
                        && d.Status == FiscalDocumentStatus.Authorized, ct);

        if (hasAuthorizedInvoices)
        {
            return Results.BadRequest(new
            {
                Message = "Não é possível cancelar o pedido pois existem notas fiscais autorizadas vinculadas. Cancele as notas fiscais na SEFAZ primeiro."
            });
        }

        // 1. Estorna alocações e devolve saldo reservado
        var allocations = await _db.OutboundAllocations
            .Include(a => a.HandlingUnit)
            .Where(a => a.OutboundOrderId == order.Id)
            .ToListAsync(ct);

        var targetLocationId = order.DockLocationId;
        if (!targetLocationId.HasValue)
        {
            targetLocationId = await _db.Set<Location>()
                .Where(l => l.IsActive)
                .Select(l => (Guid?)l.Id)
                .FirstOrDefaultAsync(ct);
        }

        foreach (var alloc in allocations)
        {
            var orderItem = order.Items.First(i => i.Id == alloc.OutboundOrderItemId);

            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == orderItem.ProductId && b.CustomerId == order.CustomerId, ct);

            if (balance != null)
            {
                balance.UnallocateForPicking(alloc.Quantity);
            }

            if (alloc.HandlingUnit != null && alloc.HandlingUnit.Status == HuStatus.Consumed)
            {
                alloc.HandlingUnit.RestoreConsumed(alloc.Quantity, targetLocationId);
            }
        }

        if (allocations.Any()) _db.OutboundAllocations.RemoveRange(allocations);

        // 2. Remove logs de conferência (Checking)
        var checkLogs = await _db.OutboundCheckLogs
            .Where(c => c.OutboundOrderId == order.Id)
            .ToListAsync(ct);
        if (checkLogs.Any()) _db.OutboundCheckLogs.RemoveRange(checkLogs);

        // 3. Remove volumes de expedição (auto-packing e fracionados)
        var volumes = await _db.OutboundVolumes
            .Where(v => v.OutboundOrderId == order.Id)
            .ToListAsync(ct);
        if (volumes.Any()) _db.OutboundVolumes.RemoveRange(volumes);

        // 4. Remove apontamentos de embalagem (Packing Momento 1)
        var itemPacks = await _db.OutboundItemPacks
            .Where(p => p.OutboundOrderId == order.Id)
            .ToListAsync(ct);
        if (itemPacks.Any()) _db.OutboundItemPacks.RemoveRange(itemPacks);

        // 5. Remove itens de cobrança associados em ciclos abertos
        var billingItems = await _db.BillingItems
            .Where(b => b.DocumentId == order.Id || b.Description.Contains(order.OrderNumber))
            .ToListAsync(ct);
        if (billingItems.Any()) _db.BillingItems.RemoveRange(billingItems);

        // 6. Cancela a ordem no domínio (zera Allocated, Picked, Packed, Checked nos itens)
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