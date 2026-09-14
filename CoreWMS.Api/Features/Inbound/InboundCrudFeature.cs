using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound;

// ==========================================
// 1. DTOs
// ==========================================
public record InboundOrderDto(
    Guid Id, Guid? CustomerId, string? CustomerName, string IssuerCnpj, string IssuerName,
    string AccessKey, DateTime IssueDate, string Status);

public record InboundOrderItemDto(
    Guid Id, Guid? ProductId, int LineNumber, string Sku, string Description,
    decimal ExpectedQuantity, decimal ReceivedQuantity, string Status, Guid? LockedByUserId);

public record InboundOrderDetailsDto(
    Guid Id, Guid? CustomerId, string? CustomerName, string IssuerCnpj, string IssuerName,
    string AccessKey, string RawXml, DateTime IssueDate, string Status,
    List<InboundOrderItemDto> Items);

// ==========================================
// 2. QUERIES (LEITURA)
// ==========================================
public record ListInboundOrdersQuery(
    Guid? CustomerId, InboundOrderStatus? Status, string? Search, int Page = 1, int PageSize = 20) : IRequest<IResult>;

public class ListInboundOrdersQueryValidator : AbstractValidator<ListInboundOrdersQuery>
{
    public ListInboundOrdersQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
    }
}

public record GetInboundOrderByIdQuery(Guid Id) : IRequest<IResult>;

// ==========================================
// 3. COMMAND
// ==========================================
public record CancelInboundOrderCommand(Guid Id) : IRequest<IResult>;

public record RollbackInboundOrderCommand(Guid OrderId) : IRequest<IResult>;

// ==========================================
// 3.5 VALIDATORS
// ==========================================

public class RollbackInboundOrderCommandValidator : AbstractValidator<RollbackInboundOrderCommand>
{
    public RollbackInboundOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
    }
}

// ==========================================
// 4. HANDLERS
// ==========================================
public class ListInboundOrdersHandler : IRequestHandler<ListInboundOrdersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListInboundOrdersHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListInboundOrdersQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var q = _db.InboundOrders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Where(o => o.CompanyId == companyId);

        if (request.CustomerId.HasValue) q = q.Where(o => o.CustomerId == request.CustomerId);
        if (request.Status.HasValue) q = q.Where(o => o.Status == request.Status);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            q = q.Where(o => o.AccessKey.Contains(s) || o.IssuerName.ToLower().Contains(s) || o.IssuerCnpj.Contains(s));
        }

        var totalTask = q.CountAsync(ct);

        var itemsTask = q
            .OrderByDescending(o => o.IssueDate)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(o => new InboundOrderDto(
                o.Id, o.CustomerId, o.Customer != null ? o.Customer.CorporateName : null,
                o.IssuerCnpj, o.IssuerName, o.AccessKey, o.IssueDate, o.Status.ToString()
            )).ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        var response = new PaginatedResult<InboundOrderDto>(itemsTask.Result, totalTask.Result, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public class GetInboundOrderByIdHandler : IRequestHandler<GetInboundOrderByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetInboundOrderByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetInboundOrderByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.InboundOrders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Include(o => o.Items)
            .Where(o => o.CompanyId == companyId && o.Id == request.Id)
            .Select(o => new InboundOrderDetailsDto(
                o.Id, o.CustomerId, o.Customer != null ? o.Customer.CorporateName : null,
                o.IssuerCnpj, o.IssuerName, o.AccessKey, o.RawXml, o.IssueDate, o.Status.ToString(),
                o.Items.OrderBy(i => i.LineNumber).Select(i => new InboundOrderItemDto(
                    i.Id, i.ProductId, i.LineNumber, i.RawSkuCode, i.RawDescription,
                    i.ExpectedQuantity, i.ReceivedQuantity, i.Status.ToString(), i.LockedByUserId
                )).ToList()
            )).FirstOrDefaultAsync(ct);

        if (order == null) return Results.NotFound();

        return Results.Ok(order);
    }
}

public class CancelInboundOrderHandler : IRequestHandler<CancelInboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CancelInboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CancelInboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.InboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.Id, ct);

        if (order == null) return Results.NotFound();

        // Regra de segurança: Não pode cancelar se já houver itens 100% recebidos, pois as HUs já existem.
        if (order.Items.Any(i => i.Status == InboundOrderItemStatus.Completed || i.ReceivedQuantity > 0))
            return Results.BadRequest(new { Message = "Não é possível cancelar uma ordem que já possui recebimentos parciais ou totais. Estorne as HUs primeiro." });

        if (order.Status == InboundOrderStatus.Canceled)
            return Results.BadRequest(new { Message = "A ordem já está cancelada." });

        order.UpdateStatus(InboundOrderStatus.Canceled);

        // Destrava todos os itens e joga para status pendente para fins de histórico
        foreach (var item in order.Items)
        {
            if (item.LockedByUserId.HasValue) item.Unlock();
        }

        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public class RollbackInboundOrderHandler : IRequestHandler<RollbackInboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly KardexChannel _kardex;

    public RollbackInboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant, KardexChannel kardex)
    {
        _db = db;
        _tenant = tenant;
        _kardex = kardex;
    }

    public async Task<IResult> Handle(RollbackInboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Busca a Ordem e seus itens
        var order = await _db.InboundOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.Id == request.OrderId, ct);

        if (order == null) return Results.NotFound();

        // 2. Busca todas as HUs geradas por esta ordem
        var generatedHus = await _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && h.ReceiptDocumentId == order.Id)
            .ToListAsync(ct);

        // 3. Trava de Segurança: Verifica se alguma HU já foi expedida (vinculada a saída)
        // Assumindo que a propriedade Status da HU mude para Shipped na expedição
        if (generatedHus.Any(h => h.Status == Inventory.Enums.HuStatus.Shipped))
        {
            return Results.BadRequest(new { Message = "Estorno bloqueado. Uma ou mais HUs desta ordem já foram expedidas." });
        }

        // 4. Reverte os Saldos e grava no Kardex
        foreach (var hu in generatedHus)
        {
            var balance = await _db.InventoryBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.ProductId == hu.ProductId, ct);

            if (balance != null)
            {
                if (hu.QualityStatus == Inventory.Enums.QualityStatus.Available)
                    balance.Ship(hu.CurrentQuantity); // Remove do saldo disponível
                else
                    balance.RemoveQuarantine(hu.CurrentQuantity); // Remove do saldo bloqueado/virtual
            }

            // Grava a contra-partida no Kardex
            await _kardex.WriteAsync(new Inventory.Entities.InventoryTransaction(
                companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId,
                Inventory.Enums.TransactionType.Inventory_Adjustment_Out,
                hu.CurrentQuantity, hu.CurrentQuantity,
                order.Id, $"ESTORNO NF {order.AccessKey}"), ct);
        }

        // 5. Exclui fisicamente as HUs (pois foi um erro de recebimento)
        _db.HandlingUnits.RemoveRange(generatedHus);

        // 6. Reseta os itens da ordem
        foreach (var item in order.Items)
        {
            // Força a reflexão na entidade (bypass do encapsulamento para estorno ou cria um método Reset() na entidade)
            // Caso não tenha um método Reset(), você deve adicionar public void ResetReceivedQuantity() na entidade InboundOrderItem.
            item.ResetForRollback();
            item.Unlock(); // Garante que nenhum lock fique preso
        }
        order.UpdateStatus(InboundOrderStatus.Pending);

        // 7. Estorna o Faturamento (Busca o lançamento gerado por esta NF-e)
        var billingItems = await _db.BillingItems
            .Where(b => b.Description.Contains(order.AccessKey))
            .ToListAsync(ct);

        if (billingItems.Any())
        {
            _db.BillingItems.RemoveRange(billingItems);
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito ao processar o estorno. Tente novamente." });
        }

        return Results.Ok(new { Message = "Estorno realizado com sucesso. A ordem retornou para o status pendente." });
    }
}

// ==========================================
// 5. ENDPOINTS
// ==========================================
public static class InboundCrudEndpoints
{
    public static void MapInboundCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inbound").WithTags("Inbound").RequireAuthorization();

        group.MapGet("/", async ([AsParameters] ListInboundOrdersQuery query, IMediator mediator) =>
            await mediator.Send(query))
            .RequirePermission(Permissions.Inbound.View);

        group.MapGet("/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetInboundOrderByIdQuery(id)))
            .RequirePermission(Permissions.Inbound.View);

        group.MapPost("/{id:guid}/rollback", async (Guid id, IMediator mediator) =>
            await mediator.Send(new RollbackInboundOrderCommand(id)))
            .RequirePermission(Permissions.Inbound.Manage);

        group.MapDelete("/{id:guid}/cancel", async (Guid id, IMediator mediator) =>
            await mediator.Send(new CancelInboundOrderCommand(id)))
            .RequirePermission(Permissions.Inbound.Manage);
    }
}