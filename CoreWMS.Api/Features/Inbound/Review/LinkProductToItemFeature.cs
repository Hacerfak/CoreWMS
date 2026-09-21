using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Review;

public record LinkProductToItemCommand(Guid ItemId, Guid ProductId) : IRequest<IResult>;

public class LinkProductToItemCommandValidator : AbstractValidator<LinkProductToItemCommand>
{
    public LinkProductToItemCommandValidator()
    {
        RuleFor(x => x.ItemId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
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

        var item = await _db.InboundOrderItems
            .Include(i => i.InboundOrder)
            .FirstOrDefaultAsync(i => i.Id == request.ItemId && i.InboundOrder.CompanyId == companyId, ct);

        if (item == null) return Results.NotFound(new { Message = "Item da ordem não encontrado." });
        if (item.Status != InboundOrderItemStatus.Pending_Review) return Results.BadRequest(new { Message = "Este item não está pendente de revisão." });

        var product = await _db.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == request.ProductId && p.CompanyId == companyId, ct);

        if (product == null) return Results.BadRequest(new { Message = "Produto não encontrado." });
        if (product.CustomerId != item.InboundOrder.CustomerId) return Results.BadRequest(new { Message = "O produto selecionado pertence a um depositante diferente do emitente da Nota Fiscal." });

        item.LinkProduct(product.Id);

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

public static class LinkProductToItemEndpoints
{
    public static void MapLinkProductToItemEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/review/{itemId:guid}/link", async (Guid itemId, LinkProductToItemCommand cmd, IMediator mediator) => await mediator.Send(cmd with { ItemId = itemId }))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Review);
    }
}