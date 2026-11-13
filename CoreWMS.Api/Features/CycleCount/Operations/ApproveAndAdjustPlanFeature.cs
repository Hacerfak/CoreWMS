using System.Security.Claims;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.CycleCount.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Inventory.Operations;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

// Commands
public record ApproveCycleCountPlanCommand(Guid PlanId) : IRequest<IResult>;
public record StartTaskCountingCommand(Guid TaskId) : IRequest<IResult>;
public record CancelTaskCountingCommand(Guid TaskId) : IRequest<IResult>;
public record RecordPositionCountCommand(Guid TaskId, decimal CountedQuantity) : IRequest<IResult>;
public record RequestRecountCommand(Guid TaskId) : IRequest<IResult>;
public record ReleaseLocationNextRoundCommand(Guid PlanId, Guid LocationId) : IRequest<IResult>;
public record CancelPlanToDraftCommand(Guid PlanId) : IRequest<IResult>;
public record DeleteCycleCountPlanCommand(Guid PlanId) : IRequest<IResult>;
public record ApplyFiscalAdjustmentCommand(Guid TaskId, string FiscalDocumentNumber, string? Notes) : IRequest<IResult>;

public class ApproveAndAdjustPlanHandler :
    IRequestHandler<ApproveCycleCountPlanCommand, IResult>,
    IRequestHandler<StartTaskCountingCommand, IResult>,
    IRequestHandler<CancelTaskCountingCommand, IResult>,
    IRequestHandler<RecordPositionCountCommand, IResult>,
    IRequestHandler<RequestRecountCommand, IResult>,
    IRequestHandler<ReleaseLocationNextRoundCommand, IResult>,
    IRequestHandler<CancelPlanToDraftCommand, IResult>,
    IRequestHandler<DeleteCycleCountPlanCommand, IResult>,
    IRequestHandler<ApplyFiscalAdjustmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IMediator _mediator;
    private readonly IHttpContextAccessor _http;

    public ApproveAndAdjustPlanHandler(ApplicationDbContext db, IMediator mediator, IHttpContextAccessor http)
    {
        _db = db;
        _mediator = mediator;
        _http = http;
    }

    private Guid GetCurrentUserId()
    {
        var userIdClaim = _http.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdClaim, out var id) ? id : Guid.Empty;
    }

    public async Task<IResult> Handle(ApproveCycleCountPlanCommand request, CancellationToken ct)
    {
        var plan = await _db.CycleCountPlans.FirstOrDefaultAsync(p => p.Id == request.PlanId, ct);
        if (plan == null) return Results.NotFound(new { Message = "Plano não encontrado." });

        plan.ApproveForCounting();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Plano aprovado e liberado para contagem dos coletores." });
    }

    public async Task<IResult> Handle(StartTaskCountingCommand request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Results.Unauthorized();

        var task = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null) return Results.NotFound(new { Message = "Tarefa não encontrada." });

        task.CycleCountPlan.StartCounting();
        task.StartCounting(userId);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Tarefa atribuída e em contagem." });
    }

    public async Task<IResult> Handle(CancelTaskCountingCommand request, CancellationToken ct)
    {
        var task = await _db.CycleCountTasks.FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);
        if (task == null) return Results.NotFound(new { Message = "Tarefa não encontrada." });

        task.CancelCounting();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Contagem cancelada e tarefa liberada." });
    }

    public async Task<IResult> Handle(RecordPositionCountCommand request, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var task = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
                .ThenInclude(p => p.Tasks)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null) return Results.NotFound(new { Message = "Tarefa não encontrada." });

        task.RecordRoundCount(request.CountedQuantity, userId, task.CycleCountPlan.MaxRounds);
        task.CycleCountPlan.CheckCompletion();

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Contagem registrada com sucesso." });
    }

    private async Task<IResult> ReleaseNextRoundForLocationAsync(Guid planId, Guid locationId, CancellationToken ct)
    {
        var plan = await _db.CycleCountPlans
            .Include(p => p.Tasks)
                .ThenInclude(t => t.Location)
            .FirstOrDefaultAsync(p => p.Id == planId, ct);

        if (plan == null)
            return Results.NotFound(new { Message = "Plano de inventário não encontrado." });

        var locationTasksQuery = plan.Tasks
            .Where(t => t.LocationId == locationId && t.Status != CycleCountTaskStatus.Recounted);

        var productIds = plan.ProductIds;
        bool hasProductFilter = productIds is { Count: > 0 };
        if (hasProductFilter)
        {
            locationTasksQuery = locationTasksQuery.Where(t => productIds!.Contains(t.ProductId));
        }

        var tasksToReopen = locationTasksQuery.ToList();

        if (!tasksToReopen.Any())
            return Results.NotFound(new { Message = "Nenhuma tarefa elegível encontrada neste endereço para nova rodada." });

        int nextRound = tasksToReopen.Max(t => t.CurrentRound) + 1;

        if (nextRound > plan.MaxRounds)
        {
            return Results.BadRequest(new
            {
                Message = $"O limite máximo de {plan.MaxRounds} rodada(s) configurado neste plano já foi atingido para este endereço."
            });
        }

        try
        {
            foreach (var t in tasksToReopen)
            {
                t.ReleaseForNextRound(nextRound, plan.MaxRounds);
            }

            plan.ReopenForCounting();
            await _db.SaveChangesAsync(ct);

            var locationPath = tasksToReopen.First().Location?.FullPath ?? locationId.ToString();
            var scopeMsg = hasProductFilter
                ? $"apenas para o(s) produto(s) filtrado(s) no plano ({tasksToReopen.Count} item(ns))"
                : $"para todos os itens do endereço ({tasksToReopen.Count} item(ns))";

            return Results.Ok(new
            {
                CurrentRound = nextRound,
                ReleasedTasksCount = tasksToReopen.Count,
                Message = $"Rodada {nextRound} liberada no endereço {locationPath} {scopeMsg}!"
            });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
    }

    public async Task<IResult> Handle(ReleaseLocationNextRoundCommand request, CancellationToken ct)
        => await ReleaseNextRoundForLocationAsync(request.PlanId, request.LocationId, ct);

    public async Task<IResult> Handle(RequestRecountCommand request, CancellationToken ct)
    {
        var task = await _db.CycleCountTasks
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null)
            return Results.NotFound(new { Message = "Tarefa não encontrada." });

        return await ReleaseNextRoundForLocationAsync(task.CycleCountPlanId, task.LocationId, ct);
    }

    public async Task<IResult> Handle(CancelPlanToDraftCommand request, CancellationToken ct)
    {
        var plan = await _db.CycleCountPlans.Include(p => p.Tasks).FirstOrDefaultAsync(p => p.Id == request.PlanId, ct);
        if (plan == null) return Results.NotFound(new { Message = "Plano não encontrado." });

        plan.CancelToDraft();
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Plano cancelado e retornado para Rascunho." });
    }

    public async Task<IResult> Handle(DeleteCycleCountPlanCommand request, CancellationToken ct)
    {
        var plan = await _db.CycleCountPlans.FirstOrDefaultAsync(p => p.Id == request.PlanId, ct);
        if (plan == null) return Results.NotFound(new { Message = "Plano não encontrado." });

        if (plan.Status != CycleCountPlanStatus.Draft)
            return Results.BadRequest(new { Message = "Apenas planos em Rascunho podem ser excluídos." });

        _db.CycleCountPlans.Remove(plan);
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Plano excluído com sucesso." });
    }

    public async Task<IResult> Handle(ApplyFiscalAdjustmentCommand request, CancellationToken ct)
    {
        var task = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
                .ThenInclude(p => p.Tasks)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null) return Results.NotFound(new { Message = "Tarefa não encontrada." });

        task.ApplyFiscalAdjustment(request.FiscalDocumentNumber.Trim(), request.Notes);
        task.CycleCountPlan.CheckCompletion();

        var balance = await _db.InventoryBalances
            .FirstOrDefaultAsync(b => b.CompanyId == task.CycleCountPlan.CompanyId &&
                                      b.CustomerId == task.CycleCountPlan.CustomerIds.FirstOrDefault() &&
                                      b.ProductId == task.ProductId, ct);

        if (balance != null)
        {
            decimal divergence = task.DivergenceQuantity;
            balance.AdjustAvailable(divergence);

            var transType = divergence > 0 ? TransactionType.Inventory_Adjustment_In : TransactionType.Inventory_Adjustment_Out;
            var actionMsg = divergence > 0 ? $"AJUSTE FISCAL (SOBRA): Remessa {request.FiscalDocumentNumber}" : $"AJUSTE FISCAL (FALTA): Retorno Simbólico {request.FiscalDocumentNumber}";

            await _db.SaveChangesAsync(ct);

            // DELEGAÇÃO VIA MEDIATR: Movimento auditado enviado de forma desacoplada
            await _mediator.Send(new RecordKardexMovementCommand(
                CustomerId: task.CycleCountPlan.CustomerIds.FirstOrDefault(),
                ProductId: task.ProductId,
                HandlingUnitId: null,
                LocationId: task.LocationId,
                Type: transType,
                QuantityChange: divergence,
                BalanceAfter: balance.TotalAvailable,
                SourceDocumentId: null,
                SourceDocumentNumber: actionMsg,
                CompanyId: task.CycleCountPlan.CompanyId
            ), ct);
        }
        else
        {
            await _db.SaveChangesAsync(ct);
        }

        return Results.Ok(new { Message = "Ajuste fiscal efetuado com sucesso." });
    }
}

public static class ApproveAndAdjustPlanEndpoints
{
    public static void MapApproveAndAdjustPlanEndpoints(this IEndpointRouteBuilder app)
    {
        // Endpoints do Coletor / Operação
        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/start", async (Guid taskId, IMediator mediator) =>
            await mediator.Send(new StartTaskCountingCommand(taskId)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);

        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/cancel-counting", async (Guid taskId, IMediator mediator) =>
            await mediator.Send(new CancelTaskCountingCommand(taskId)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);

        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/record-position", async (Guid taskId, RecordPositionCountCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { TaskId = taskId }))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);

        // Endpoints da Gestão / Auditoria
        app.MapPost("/api/cycle-count/plans/{planId:guid}/approve", async (Guid planId, IMediator mediator) =>
            await mediator.Send(new ApproveCycleCountPlanCommand(planId)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);

        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/recount", async (Guid taskId, IMediator mediator) =>
            await mediator.Send(new RequestRecountCommand(taskId)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);

        app.MapPost("/api/cycle-count/locations/{planId:guid}/{locationId:guid}/recount", async (Guid planId, Guid locationId, IMediator mediator) =>
            await mediator.Send(new ReleaseLocationNextRoundCommand(planId, locationId)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);

        app.MapPost("/api/cycle-count/plans/{planId:guid}/cancel", async (Guid planId, IMediator mediator) =>
            await mediator.Send(new CancelPlanToDraftCommand(planId)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);

        app.MapDelete("/api/cycle-count/plans/{planId:guid}", async (Guid planId, IMediator mediator) =>
            await mediator.Send(new DeleteCycleCountPlanCommand(planId)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);

        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/apply-fiscal-adjustment", async (Guid taskId, ApplyFiscalAdjustmentCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { TaskId = taskId }))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}