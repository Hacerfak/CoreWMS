using System.Security.Claims;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Receiving;

public record StartReceivingCommand(Guid OrderItemId, Guid DockLocationId) : IRequest<IResult>;

public class StartReceivingCommandValidator : AbstractValidator<StartReceivingCommand>
{
    public StartReceivingCommandValidator()
    {
        RuleFor(x => x.OrderItemId).NotEmpty();
        RuleFor(x => x.DockLocationId).NotEmpty().WithMessage("É obrigatório informar a doca de recebimento.");
    }
}

public class StartReceivingHandler : IRequestHandler<StartReceivingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public StartReceivingHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(StartReceivingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var userIdClaim = _http.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId)) return Results.Unauthorized();

        var item = await _db.InboundOrderItems
            .Include(i => i.InboundOrder)
            .FirstOrDefaultAsync(i => i.Id == request.OrderItemId && i.InboundOrder.CompanyId == companyId, ct);

        if (item == null) return Results.NotFound(new { Message = "Item não encontrado." });

        try
        {
            item.LockForReceiving(userId, request.DockLocationId);

            // Atualiza a ordem para "Em Recebimento" caso ainda esteja em "Aguardando Recebimento"
            if (item.InboundOrder.Status == InboundOrderStatus.Pending)
            {
                item.InboundOrder.UpdateStatus(InboundOrderStatus.Receiving);
            }

            await _db.SaveChangesAsync(ct);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Houve uma atualização simultânea neste item. Atualize a tela." });
        }

        return Results.Ok(new { Message = "Item reservado para recebimento." });
    }
}

public static class StartReceivingEndpoints
{
    public static void MapStartReceivingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/receive/start", async (StartReceivingCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Receive);
    }
}