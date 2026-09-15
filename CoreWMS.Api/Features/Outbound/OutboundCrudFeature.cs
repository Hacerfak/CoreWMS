using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Core.Models;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Outbound;

// ==========================================
// 1. DTOs
// ==========================================
public record OutboundOrderItemDto(Guid Id, Guid ProductId, int LineNumber, string SkuCode, decimal ExpectedQuantity, decimal AllocatedQuantity, decimal PickedQuantity, decimal PackedQuantity, decimal UnitValue, string Status);
public record OutboundOrderDto(Guid Id, Guid CustomerId, string OrderNumber, string DestinationName, string DestinationCity, string DestinationState, DateTime IssueDate, string Status, int ItemsCount);
public record OutboundOrderDetailsDto(Guid Id, Guid CustomerId, string OrderNumber, string? AccessKey, string DestinationCnpjCpf, string DestinationName, string DestinationCity, string DestinationState, string? DestinationZipCode, DateTime IssueDate, DateTime? ExpectedShipDate, string Status, Guid? DockLocationId, List<OutboundOrderItemDto> Items);

public record CreateOutboundOrderItemCommand(Guid ProductId, int LineNumber, decimal Quantity, decimal UnitValue);
public record CreateOutboundOrderCommand(
    Guid CustomerId, string OrderNumber, string DestinationCnpjCpf, string DestinationName,
    string DestinationCity, string DestinationState, string? DestinationZipCode,
    DateTime? ExpectedShipDate, List<CreateOutboundOrderItemCommand> Items) : IRequest<IResult>;

public record ListOutboundOrdersQuery(Guid? CustomerId, string? Search, string? Status, int Page = 1, int PageSize = 20) : IRequest<IResult>;
public record GetOutboundOrderByIdQuery(Guid Id) : IRequest<IResult>;
public record CancelOutboundOrderCommand(Guid Id) : IRequest<IResult>;

// ==========================================
// 2. VALIDADORES
// ==========================================
public class CreateOutboundOrderCommandValidator : AbstractValidator<CreateOutboundOrderCommand>
{
    public CreateOutboundOrderCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.OrderNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.DestinationCnpjCpf).NotEmpty().MaximumLength(14);
        RuleFor(x => x.DestinationName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.DestinationCity).NotEmpty();
        RuleFor(x => x.DestinationState).NotEmpty().MaximumLength(2);
        RuleFor(x => x.Items).NotEmpty().WithMessage("O pedido deve conter pelo menos um item.");
    }
}

// ==========================================
// 3. HANDLERS
// ==========================================
public class CreateOutboundOrderHandler : IRequestHandler<CreateOutboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CreateOutboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Validação de Viseira de Segurança B2B
        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(request.CustomerId))
            return Results.Forbid();

        if (await _db.OutboundOrders.AnyAsync(o => o.CompanyId == companyId && o.OrderNumber == request.OrderNumber, ct))
            return Results.BadRequest(new { Message = "Já existe um pedido de saída com este número." });

        // 2. Cria Cabeçalho
        var order = new OutboundOrder(
            companyId, request.CustomerId, request.OrderNumber, null, null,
            request.DestinationCnpjCpf, request.DestinationName, request.DestinationCity, request.DestinationState, request.DestinationZipCode,
            DateTime.UtcNow, request.ExpectedShipDate
        );

        // 3. Valida Produtos e adiciona os Itens
        var productIds = request.Items.Select(i => i.ProductId).ToList();
        var validProducts = await _db.Products
            .Where(p => p.CompanyId == companyId && p.CustomerId == request.CustomerId && productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Sku, ct);

        foreach (var itemCmd in request.Items)
        {
            if (!validProducts.TryGetValue(itemCmd.ProductId, out var sku))
                return Results.BadRequest(new { Message = $"Produto com ID {itemCmd.ProductId} é inválido ou não pertence a este depositante." });

            var item = new OutboundOrderItem(order.Id, itemCmd.ProductId, itemCmd.LineNumber, sku, itemCmd.Quantity, itemCmd.UnitValue);
            order.AddItem(item);
        }

        _db.OutboundOrders.Add(order);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/outbound/orders/{order.Id}", new { order.Id, order.OrderNumber });
    }
}

public class ListOutboundOrdersHandler : IRequestHandler<ListOutboundOrdersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListOutboundOrdersHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListOutboundOrdersQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var q = _db.OutboundOrders.AsNoTracking().Where(o => o.CompanyId == companyId);

        // Segurança B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(o => allowedIds.Contains(o.CustomerId));
        }

        // Filtros
        if (request.CustomerId.HasValue) q = q.Where(o => o.CustomerId == request.CustomerId);

        if (!string.IsNullOrWhiteSpace(request.Status) && Enum.TryParse<Enums.OutboundOrderStatus>(request.Status, true, out var statusEnum))
            q = q.Where(o => o.Status == statusEnum);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = $"%{request.Search.Trim()}%";
            q = q.Where(o => EF.Functions.ILike(o.OrderNumber, s) ||
                             EF.Functions.ILike(o.DestinationName, s) ||
                             (o.AccessKey != null && EF.Functions.ILike(o.AccessKey, s)));
        }

        var totalTask = q.CountAsync(ct);

        var itemsTask = q
            .OrderByDescending(o => o.IssueDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(o => new OutboundOrderDto(
                o.Id, o.CustomerId, o.OrderNumber, o.DestinationName, o.DestinationCity, o.DestinationState,
                o.IssueDate, o.Status.ToString(), o.Items.Count
            )).ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        var response = new PaginatedResult<OutboundOrderDto>(itemsTask.Result, totalTask.Result, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

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

        // Trava de Viseira B2B
        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(order.CustomerId))
            return Results.Forbid();

        return Results.Ok(order);
    }
}

// ==========================================
// 4. ENDPOINTS
// ==========================================
public static class OutboundCrudEndpoints
{
    public static void MapOutboundCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/outbound/orders").WithTags("Outbound").RequireAuthorization();

        group.MapPost("/", async (CreateOutboundOrderCommand cmd, IMediator mediator) => await mediator.Send(cmd))
             .RequirePermission(Permissions.Outbound.Manage);

        group.MapGet("/", async ([AsParameters] ListOutboundOrdersQuery query, IMediator mediator) => await mediator.Send(query))
             .RequirePermission(Permissions.Outbound.View);

        group.MapGet("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new GetOutboundOrderByIdQuery(id)))
             .RequirePermission(Permissions.Outbound.View);
    }
}