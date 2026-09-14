using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound;

// ==========================================
// 1. DTOs E QUERIES (LEITURA)
// ==========================================
public record PendingReviewItemDto(
    Guid ItemId, Guid InboundOrderId, string AccessKey, string IssuerName, int LineNumber,
    string RawSkuCode, string? RawBarcode, string RawDescription, string RawNcm,
    decimal ExpectedQuantity, string? ExpectedBatch);

public record ListPendingReviewItemsQuery() : IRequest<IResult>;

// ==========================================
// 2. COMMAND E VALIDADOR (ESCRITA)
// ==========================================
public record LinkProductToItemCommand(Guid ItemId, Guid ProductId) : IRequest<IResult>;

public class LinkProductToItemCommandValidator : AbstractValidator<LinkProductToItemCommand>
{
    public LinkProductToItemCommandValidator()
    {
        RuleFor(x => x.ItemId).NotEmpty().WithMessage("O ID do item da ordem é obrigatório.");
        RuleFor(x => x.ProductId).NotEmpty().WithMessage("O ID do produto é obrigatório.");
    }
}

// ==========================================
// 3. HANDLERS
// ==========================================
public class ListPendingReviewItemsHandler : IRequestHandler<ListPendingReviewItemsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListPendingReviewItemsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListPendingReviewItemsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var pendingItems = await _db.InboundOrderItems
            .AsNoTracking()
            .Include(i => i.InboundOrder)
            .Where(i => i.InboundOrder.CompanyId == companyId && i.Status == InboundOrderItemStatus.Pending_Review)
            .OrderBy(i => i.InboundOrder.IssueDate)
            .ThenBy(i => i.LineNumber)
            .Select(i => new PendingReviewItemDto(
                i.Id, i.InboundOrderId, i.InboundOrder.AccessKey, i.InboundOrder.IssuerName, i.LineNumber,
                i.RawSkuCode, i.RawBarcode, i.RawDescription, i.RawNcm,
                i.ExpectedQuantity, i.ExpectedBatch
            ))
            .ToListAsync(ct);

        return Results.Ok(pendingItems);
    }
}

public class LinkProductToItemHandler : IRequestHandler<LinkProductToItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public LinkProductToItemHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(LinkProductToItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Busca o Item e a Ordem
        var item = await _db.InboundOrderItems
            .Include(i => i.InboundOrder)
            .FirstOrDefaultAsync(i => i.Id == request.ItemId && i.InboundOrder.CompanyId == companyId, ct);

        if (item == null)
            return Results.NotFound(new { Message = "Item da ordem não encontrado." });

        // 2. Validações de Negócio
        if (item.Status != InboundOrderItemStatus.Pending_Review)
            return Results.BadRequest(new { Message = "Este item não está pendente de revisão." });

        // 3. Busca e valida o Produto
        var product = await _db.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.ProductId && p.CompanyId == companyId, ct);

        if (product == null)
            return Results.BadRequest(new { Message = "Produto não encontrado." });

        if (product.CustomerId != item.InboundOrder.CustomerId)
            return Results.BadRequest(new { Message = "O produto selecionado pertence a um depositante diferente do emitente da Nota Fiscal." });

        // 4. Aplica a alteração de estado (Encapsulamento DDD)
        item.LinkProduct(product.Id);

        // 5. Salva e resolve a concorrência
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Este item foi modificado por outro usuário simultaneamente. Atualize a tela." });
        }

        return Results.NoContent();
    }
}

// ==========================================
// 4. ENDPOINTS
// ==========================================
public static class InboundReviewEndpoints
{
    public static void MapInboundReviewEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inbound/review").WithTags("Inbound").RequireAuthorization();

        // Lista tudo que o Gestor precisa resolver
        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListPendingReviewItemsQuery()))
             .RequirePermission(Permissions.Inbound.Review);

        // Aprova o vínculo
        group.MapPost("/{itemId:guid}/link", async (Guid itemId, LinkProductToItemCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { ItemId = itemId }))
             .RequirePermission(Permissions.Inbound.Review);
    }
}