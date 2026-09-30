using System.Security.Claims;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record AddStrictLpnRecordCommand(Guid TaskId, string Lpn, decimal CountedQuantity) : IRequest<IResult>;

public class AddStrictLpnRecordCommandValidator : AbstractValidator<AddStrictLpnRecordCommand>
{
    public AddStrictLpnRecordCommandValidator()
    {
        RuleFor(x => x.TaskId).NotEmpty();
        RuleFor(x => x.Lpn).NotEmpty().WithMessage("Informe ou bipe o código LPN.");
        RuleFor(x => x.CountedQuantity).GreaterThanOrEqualTo(0).WithMessage("A quantidade contada não pode ser negativa.");
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
            .Include(t => t.CycleCountPlan)
                .ThenInclude(p => p.Tasks)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null)
            return Results.NotFound(new { Message = "Tarefa de inventário não encontrada." });

        if (task.Status == CycleCountTaskStatus.Resolved)
            return Results.BadRequest(new { Message = "Esta tarefa já foi concluída e conciliada." });

        var scannedLpn = request.Lpn.Trim().ToUpper();

        // 1. Verifica se a HU existe e se pertence a este endereço
        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Lpn == scannedLpn, ct);

        // Se a HU não existe ou está fisicamente em outro endereço, registra divergência de HU
        bool isHuMismatch = hu == null || hu.CurrentLocationId != task.LocationId;

        // 2. Registra o apontamento normalmente (Sem dar mensagem de erro para o operador)
        task.CycleCountPlan.StartCounting();
        task.RecordRoundCount(request.CountedQuantity, userId, task.CycleCountPlan.MaxRounds, scannedLpn, isHuMismatch);
        task.CycleCountPlan.CheckCompletion();

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Status = task.Status.ToString(),
            Message = "Contagem registrada com sucesso."
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