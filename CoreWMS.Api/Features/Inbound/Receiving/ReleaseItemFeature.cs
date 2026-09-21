using System.Security.Claims;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Receiving;

public record ReleaseItemCommand(Guid OrderItemId) : IRequest<IResult>;

public class ReleaseItemCommandValidator : AbstractValidator<ReleaseItemCommand>
{
    public ReleaseItemCommandValidator()
    {
        RuleFor(x => x.OrderItemId).NotEmpty();
    }
}

public class ReleaseItemHandler : IRequestHandler<ReleaseItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public ReleaseItemHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(ReleaseItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var userIdClaim = _http.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId)) return Results.Unauthorized();

        var isManager = _http.HttpContext!.User.HasClaim(c => c.Type == "Permission" && c.Value == Permissions.Inbound.Manage);

        var item = await _db.InboundOrderItems
            .FirstOrDefaultAsync(i => i.Id == request.OrderItemId && i.InboundOrder.CompanyId == companyId, ct);

        if (item == null) return Results.NotFound();
        if (!item.LockedByUserId.HasValue) return Results.BadRequest(new { Message = "Este item não está em conferência no momento." });

        if (item.LockedByUserId != userId && !isManager) return Results.Forbid();

        item.Unlock();

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Houve uma atualização simultânea neste item. Atualize a tela." });
        }

        return Results.Ok(new { Message = "Item liberado com sucesso." });
    }
}

public static class ReleaseItemEndpoints
{
    public static void MapReleaseItemEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/receive/{orderItemId:guid}/release", async (Guid orderItemId, IMediator mediator) => await mediator.Send(new ReleaseItemCommand(orderItemId)))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Receive);
    }
}