using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record EscalateTaskCommand(Guid TaskId) : IRequest<IResult>;

public class EscalateTaskCommandValidator : AbstractValidator<EscalateTaskCommand>
{
    public EscalateTaskCommandValidator()
    {
        RuleFor(x => x.TaskId).NotEmpty();
    }
}

public class EscalateTaskHandler : IRequestHandler<EscalateTaskCommand, IResult>
{
    private readonly ApplicationDbContext _db;

    public EscalateTaskHandler(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> Handle(EscalateTaskCommand request, CancellationToken ct)
    {
        var task = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
                .ThenInclude(p => p.Tasks)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null)
            return Results.NotFound(new { Message = "Tarefa não encontrada." });

        var plan = task.CycleCountPlan;
        if (plan == null)
            return Results.NotFound(new { Message = "Plano de contagem não encontrado." });

        var productIds = plan.ProductIds;
        var locationTasksQuery = plan.Tasks
            .Where(t => t.LocationId == task.LocationId && t.Status != CycleCountTaskStatus.Recounted);

        bool hasProductFilter = productIds is { Count: > 0 };
        if (hasProductFilter)
        {
            locationTasksQuery = locationTasksQuery.Where(t => productIds.Contains(t.ProductId));
        }

        var tasksToReopen = locationTasksQuery.ToList();

        if (!tasksToReopen.Any())
            return Results.NotFound(new { Message = "Nenhuma tarefa elegível encontrada neste endereço para nova rodada." });

        int nextRound = tasksToReopen.Max(t => t.CurrentRound) + 1;

        try
        {
            foreach (var t in tasksToReopen)
            {
                t.ReleaseForNextRound(nextRound, plan.MaxRounds);
            }

            plan.ReopenForCounting();
            await _db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                CurrentRound = nextRound,
                ReleasedTasksCount = tasksToReopen.Count,
                Status = CycleCountTaskStatus.Pending.ToString(),
                Message = $"Recontagem solicitada com sucesso! Rodada {nextRound} liberada no endereço ({tasksToReopen.Count} item(ns))."
            });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
    }
}

public static class EscalateTaskEndpoints
{
    public static void MapEscalateTaskEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/escalate", async (Guid taskId, IMediator mediator) =>
            await mediator.Send(new EscalateTaskCommand(taskId)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}