using System.Security.Claims;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record AddVolumetricRecordCommand(Guid TaskId, int CountedQuantity) : IRequest<IResult>;

public class AddVolumetricRecordCommandValidator : AbstractValidator<AddVolumetricRecordCommand>
{
    public AddVolumetricRecordCommandValidator()
    {
        RuleFor(x => x.TaskId).NotEmpty();
        RuleFor(x => x.CountedQuantity).GreaterThanOrEqualTo(0);
    }
}

public class AddVolumetricRecordHandler : IRequestHandler<AddVolumetricRecordCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public AddVolumetricRecordHandler(ApplicationDbContext db, IHttpContextAccessor http)
    {
        _db = db;
        _http = http;
    }

    public async Task<IResult> Handle(AddVolumetricRecordCommand request, CancellationToken ct)
    {
        var userIdClaim = _http.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return Results.Unauthorized();

        var task = await _db.CycleCountTasks.Include(t => t.Records).FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);
        if (task == null) return Results.NotFound();

        if (task.Status == CycleCountTaskStatus.Resolved)
            return Results.BadRequest(new { Message = "Esta tarefa já foi concluída." });

        task.AddVolumetricRecord(userId, request.CountedQuantity);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            task.Status,
            task.CurrentRound,
            IsResolved = task.Status == CycleCountTaskStatus.Resolved
        });
    }
}

public static class AddVolumetricRecordEndpoints
{
    public static void MapAddVolumetricRecordEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/record-volumetric", async (Guid taskId, AddVolumetricRecordCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { TaskId = taskId }))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}