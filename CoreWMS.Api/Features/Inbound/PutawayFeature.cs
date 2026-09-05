using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound;

public record ExecutePutawayCommand(List<string> ScannedLpns, Guid DestinationLocationId) : IRequest<IResult>;

public class ExecutePutawayCommandValidator : AbstractValidator<ExecutePutawayCommand>
{
    public ExecutePutawayCommandValidator()
    {
        RuleFor(x => x.ScannedLpns).NotEmpty().WithMessage("Bipe pelo menos 1 LPN.");
        RuleFor(x => x.DestinationLocationId).NotEmpty();
    }
}

public class ExecutePutawayHandler : IRequestHandler<ExecutePutawayCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public ExecutePutawayHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(ExecutePutawayCommand request, CancellationToken ct)
    {
        var companyId = Guid.Parse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString()!);
        var loc = await _db.Locations.FirstOrDefaultAsync(l => l.Id == request.DestinationLocationId, ct);
        if (loc == null) return Results.BadRequest(new { Message = "Destino inválido." });

        var hus = await _db.HandlingUnits.Where(h => h.CompanyId == companyId && request.ScannedLpns.Contains(h.LpnCode)).ToListAsync(ct);
        if (!hus.Any() || hus.Any(h => h.Status != HandlingUnitStatus.Received))
            return Results.BadRequest(new { Message = "LPNs inválidos ou não estão na doca." });

        foreach (var hu in hus) hu.MoveToLocation(loc.Id);
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = $"{hus.Count} volumes movidos." });
    }
}

public static class PutawayEndpoints
{
    public static void MapPutawayEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGroup("/api/inbound/putaway").WithTags("Inbound").RequireAuthorization()
           .MapPost("/", async (ExecutePutawayCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .RequirePermission(Permissions.Inbound.ExecutePutaway);
    }
}