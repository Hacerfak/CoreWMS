using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

// 1. Aprovação do Plano pela Gestão
public record ApproveCycleCountPlanCommand(Guid PlanId) : IRequest<IResult>;

// 2. Contagem Cega da Posição pelo Coletor
public record RecordPositionCountCommand(Guid TaskId, decimal CountedQuantity) : IRequest<IResult>;

// 3. Solicitação de Recontagem pela Gestão
public record RequestRecountCommand(Guid TaskId) : IRequest<IResult>;

// 4. Efetivação do Ajuste Fiscal e Baixa
public record ApplyFiscalAdjustmentCommand(
    Guid TaskId,
    Guid FiscalDocumentId,
    string FiscalDocumentNumber,
    string? Notes
) : IRequest<IResult>;

public class ApproveAndAdjustPlanHandler :
    IRequestHandler<ApproveCycleCountPlanCommand, IResult>,
    IRequestHandler<RecordPositionCountCommand, IResult>,
    IRequestHandler<RequestRecountCommand, IResult>,
    IRequestHandler<ApplyFiscalAdjustmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly KardexChannel _kardex;

    public ApproveAndAdjustPlanHandler(ApplicationDbContext db, KardexChannel kardex)
    {
        _db = db;
        _kardex = kardex;
    }

    // 1. APROVAÇÃO DO PLANO
    public async Task<IResult> Handle(ApproveCycleCountPlanCommand request, CancellationToken ct)
    {
        var plan = await _db.CycleCountPlans.FirstOrDefaultAsync(p => p.Id == request.PlanId, ct);
        if (plan == null) return Results.NotFound(new { Message = "Plano não encontrado." });

        plan.ApproveForCounting();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Plano aprovado e liberado para contagem dos coletores." });
    }

    // 2. CONTAGEM CEGA DA POSIÇÃO
    public async Task<IResult> Handle(RecordPositionCountCommand request, CancellationToken ct)
    {
        var task = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null) return Results.NotFound(new { Message = "Tarefa de inventário não encontrada." });

        if (task.CycleCountPlan.Status == CycleCountPlanStatus.Draft)
            return Results.BadRequest(new { Message = "Este inventário ainda está em Rascunho e aguarda aprovação da Gestão." });

        task.CycleCountPlan.StartCounting();
        task.RecordPositionCount(request.CountedQuantity);
        task.CycleCountPlan.CheckCompletion();

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            task.Status,
            task.AdjustmentType,
            IsDivergent = task.Status == CycleCountTaskStatus.CountedWithDivergence,
            Message = "Contagem registrada com sucesso."
        });
    }

    // 3. SOLICITAR RECONTAGEM
    public async Task<IResult> Handle(RequestRecountCommand request, CancellationToken ct)
    {
        var task = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null) return Results.NotFound(new { Message = "Tarefa não encontrada." });

        task.RequestRecount();
        task.CycleCountPlan.StartCounting();

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = $"Recontagem solicitada! A tarefa voltou para a Rodada {task.CurrentRound}." });
    }

    // 4. TRATAMENTO FISCAL (SOBRA / FALTA)
    public async Task<IResult> Handle(ApplyFiscalAdjustmentCommand request, CancellationToken ct)
    {
        var task = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);

        if (task == null) return Results.NotFound(new { Message = "Tarefa não encontrada." });

        task.ApplyFiscalAdjustment(request.FiscalDocumentId, request.FiscalDocumentNumber.Trim(), request.Notes);
        task.CycleCountPlan.CheckCompletion();

        // Recálculo do Saldo Sistêmico
        var balance = await _db.InventoryBalances
            .FirstOrDefaultAsync(b => b.CompanyId == task.CycleCountPlan.CompanyId &&
                                      b.CustomerId == task.CycleCountPlan.CustomerId &&
                                      b.ProductId == task.ProductId, ct);

        if (balance != null)
        {
            decimal divergence = task.DivergenceQuantity;
            balance.AdjustAvailable(divergence);

            var transType = divergence > 0
                ? TransactionType.Inventory_Adjustment_In
                : TransactionType.Inventory_Adjustment_Out;

            var actionMsg = divergence > 0
                ? $"AJUSTE FISCAL (SOBRA): Vinculada NF-e Remessa {request.FiscalDocumentNumber}"
                : $"AJUSTE FISCAL (FALTA): Gerada NF-e Retorno Simbólico {request.FiscalDocumentNumber}";

            await _kardex.WriteAsync(new Features.Inventory.Entities.InventoryTransaction(
                task.CycleCountPlan.CompanyId,
                task.CycleCountPlan.CustomerId ?? Guid.Empty,
                task.ProductId,
                null,
                task.LocationId,
                transType,
                divergence,
                balance.TotalAvailable,
                request.FiscalDocumentId,
                actionMsg
            ), ct);
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Ajuste fiscal aplicado com sucesso! Saldo e Kardex atualizados." });
    }
}

public static class ApproveAndAdjustPlanEndpoints
{
    public static void MapApproveAndAdjustPlanEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/plans/{planId:guid}/approve", async (Guid planId, IMediator mediator) =>
            await mediator.Send(new ApproveCycleCountPlanCommand(planId)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);

        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/record-position", async (Guid taskId, RecordPositionCountCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { TaskId = taskId }))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);

        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/recount", async (Guid taskId, IMediator mediator) =>
            await mediator.Send(new RequestRecountCommand(taskId)))
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