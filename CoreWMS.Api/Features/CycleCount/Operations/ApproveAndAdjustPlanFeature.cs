using System.Security.Claims;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.CycleCount.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

// Commands
public record ApproveCycleCountPlanCommand(Guid PlanId) : IRequest<IResult>;
public record StartTaskCountingCommand(Guid TaskId) : IRequest<IResult>;
public record CancelTaskCountingCommand(Guid TaskId) : IRequest<IResult>;
public record RecordPositionCountCommand(Guid TaskId, decimal CountedQuantity) : IRequest<IResult>;
public record RequestRecountCommand(Guid TaskId) : IRequest<IResult>;
public record CancelPlanToDraftCommand(Guid PlanId) : IRequest<IResult>;
public record DeleteCycleCountPlanCommand(Guid PlanId) : IRequest<IResult>;
public record ApplyFiscalAdjustmentCommand(Guid TaskId, string FiscalDocumentNumber, string? Notes) : IRequest<IResult>;

public class ApproveAndAdjustPlanHandler :
    IRequestHandler<ApproveCycleCountPlanCommand, IResult>,
    IRequestHandler<StartTaskCountingCommand, IResult>,
    IRequestHandler<CancelTaskCountingCommand, IResult>,
    IRequestHandler<RecordPositionCountCommand, IResult>,
    IRequestHandler<RequestRecountCommand, IResult>,
    IRequestHandler<CancelPlanToDraftCommand, IResult>,
    IRequestHandler<DeleteCycleCountPlanCommand, IResult>,
    IRequestHandler<ApplyFiscalAdjustmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly KardexChannel _kardex;
    private readonly IHttpContextAccessor _http;

    public ApproveAndAdjustPlanHandler(ApplicationDbContext db, KardexChannel kardex, IHttpContextAccessor http)
    {
        _db = db;
        _kardex = kardex;
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

    public async Task<IResult> Handle(RequestRecountCommand request, CancellationToken ct)
    {
        var task = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null) return Results.NotFound(new { Message = "Tarefa não encontrada." });

        task.MarkAsRecounted();

        var newTask = new CycleCountTask(
            task.CycleCountPlanId,
            task.LocationId,
            task.ProductId,
            task.ExpectedQuantity,
            task.IsDynamicStorage,
            task.CycleCountPlan.AssignedUserId
        );

        _db.CycleCountTasks.Add(newTask);
        task.CycleCountPlan.ReopenForCounting();

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Recontagem solicitada com sucesso!" });
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

            await _kardex.WriteAsync(new Features.Inventory.Entities.InventoryTransaction(
                task.CycleCountPlan.CompanyId,
                task.CycleCountPlan.CustomerIds.FirstOrDefault(),
                task.ProductId,
                null,
                task.LocationId,
                transType,
                divergence,
                balance.TotalAvailable,
                null,
                actionMsg
            ), ct);
        }

        await _db.SaveChangesAsync(ct);
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