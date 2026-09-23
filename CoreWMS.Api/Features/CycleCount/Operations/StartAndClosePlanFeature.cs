using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record StartCycleCountPlanCommand(Guid Id) : IRequest<IResult>;
public record CloseCycleCountPlanCommand(Guid Id) : IRequest<IResult>;

public class StartAndClosePlanHandler :
    IRequestHandler<StartCycleCountPlanCommand, IResult>,
    IRequestHandler<CloseCycleCountPlanCommand, IResult>
{
    private readonly ApplicationDbContext _db;

    public StartAndClosePlanHandler(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> Handle(StartCycleCountPlanCommand request, CancellationToken ct)
    {
        var plan = await _db.CycleCountPlans.FirstOrDefaultAsync(p => p.Id == request.Id, ct);
        if (plan == null) return Results.NotFound();

        plan.Start();
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Plano de inventário iniciado." });
    }

    public async Task<IResult> Handle(CloseCycleCountPlanCommand request, CancellationToken ct)
    {
        var plan = await _db.CycleCountPlans.Include(p => p.Tasks).FirstOrDefaultAsync(p => p.Id == request.Id, ct);
        if (plan == null) return Results.NotFound();

        plan.Close();
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Plano de inventário encerrado com sucesso." });
    }
}

public static class StartAndClosePlanEndpoints
{
    public static void MapStartAndClosePlanEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/plans/{id:guid}/start", async (Guid id, IMediator mediator) =>
            await mediator.Send(new StartCycleCountPlanCommand(id)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);

        app.MapPost("/api/cycle-count/plans/{id:guid}/close", async (Guid id, IMediator mediator) =>
            await mediator.Send(new CloseCycleCountPlanCommand(id)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}