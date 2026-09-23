using System.Security.Claims;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record AddStrictLpnRecordCommand(Guid TaskId, string Lpn) : IRequest<IResult>;

public class AddStrictLpnRecordCommandValidator : AbstractValidator<AddStrictLpnRecordCommand>
{
    public AddStrictLpnRecordCommandValidator()
    {
        RuleFor(x => x.TaskId).NotEmpty();
        RuleFor(x => x.Lpn).NotEmpty().WithMessage("Informe ou bipe o LPN.");
    }
}

public class AddStrictLpnRecordHandler : IRequestHandler<AddStrictLpnRecordCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public AddStrictLpnRecordHandler(ApplicationDbContext db, IHttpContextAccessor http)
    {
        _db = db;
        _http = http;
    }

    public async Task<IResult> Handle(AddStrictLpnRecordCommand request, CancellationToken ct)
    {
        var userIdClaim = _http.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return Results.Unauthorized();

        var task = await _db.CycleCountTasks
            .Include(t => t.Records)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null) return Results.NotFound(new { Message = "Tarefa de inventário não encontrada." });
        if (!task.IsStrictLpnMode)
            return Results.BadRequest(new { Message = "Esta tarefa não está em modo estrito de bipagem de LPN." });

        var hu = await _db.HandlingUnits
            .FirstOrDefaultAsync(h => h.Lpn == request.Lpn.Trim().ToUpper(), ct);

        if (hu == null)
            return Results.BadRequest(new { Message = $"LPN '{request.Lpn}' não encontrado no sistema." });

        task.AddStrictLpnRecord(userId, hu.Id);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            task.Status,
            ScannedLpn = hu.Lpn,
            Message = $"LPN '{hu.Lpn}' bipado com sucesso na rodada {task.CurrentRound}."
        });
    }
}

public static class AddStrictLpnRecordEndpoints
{
    public static void MapAddStrictLpnRecordEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/record-lpn", async (Guid taskId, AddStrictLpnRecordCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { TaskId = taskId }))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}