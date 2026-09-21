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
        var task = await _db.CycleCountTasks.FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);
        if (task == null) return Results.NotFound();

        task.EscalateToStrictMode();
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
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