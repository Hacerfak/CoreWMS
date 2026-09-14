using CoreWMS.Api.Features.CycleCount.Entities;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount;

// ==========================================
// 1. DTOs & COMMANDS
// ==========================================
public record CreateCycleCountPlanCommand(string Name, Guid? CustomerId, Guid? ProductId, string? Batch, Guid? ZoneId, Guid? LocationId) : IRequest<IResult>;
public record AddVolumetricRecordCommand(Guid TaskId, int CountedQuantity) : IRequest<IResult>;
public record EscalateTaskCommand(Guid TaskId) : IRequest<IResult>;

// ==========================================
// 2. HANDLERS
// ==========================================
public class CreateCycleCountPlanHandler : IRequestHandler<CreateCycleCountPlanCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public CreateCycleCountPlanHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(CreateCycleCountPlanCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        var plan = new CycleCountPlan(companyId, request.Name, request.CustomerId, request.ProductId, request.Batch, request.ZoneId, request.LocationId);
        _db.CycleCountPlans.Add(plan);

        // 1. Busca todo o saldo disponível agrupado por Endereço e Produto que dê match com os filtros
        var query = _db.HandlingUnits.AsNoTracking().Where(h => h.CompanyId == companyId && h.CurrentLocationId.HasValue);

        if (request.CustomerId.HasValue) query = query.Where(h => h.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) query = query.Where(h => h.ProductId == request.ProductId);
        if (!string.IsNullOrWhiteSpace(request.Batch)) query = query.Where(h => h.Batch == request.Batch);
        if (request.LocationId.HasValue) query = query.Where(h => h.CurrentLocationId == request.LocationId);

        if (request.ZoneId.HasValue)
            query = query.Where(h => h.CurrentLocation != null && h.CurrentLocation.ZoneId == request.ZoneId);

        var snapshot = await query
            .GroupBy(h => new { h.CurrentLocationId, h.ProductId })
            .Select(g => new { g.Key.CurrentLocationId, g.Key.ProductId, ExpectedQty = g.Count() })
            .ToListAsync(ct);

        if (!snapshot.Any()) return Results.BadRequest(new { Message = "Nenhum saldo encontrado para os filtros informados." });

        // 2. Congela o saldo esperado criando as tarefas
        foreach (var item in snapshot)
        {
            var task = new CycleCountTask(plan.Id, item.CurrentLocationId!.Value, item.ProductId, item.ExpectedQty);
            _db.CycleCountTasks.Add(task);
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { plan.Id, TasksGenerated = snapshot.Count });
    }
}

public class AddVolumetricRecordHandler : IRequestHandler<AddVolumetricRecordCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public AddVolumetricRecordHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(AddVolumetricRecordCommand request, CancellationToken ct)
    {
        // 1. Identifica quem está operando o coletor
        var userId = Guid.Parse(_http.HttpContext!.User.Claims.First(c => c.Type == System.Security.Claims.ClaimTypes.NameIdentifier).Value);

        var task = await _db.CycleCountTasks.Include(t => t.Records).FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);
        if (task == null) return Results.NotFound();

        if (task.Status == CycleCountTaskStatus.Resolved)
            return Results.BadRequest(new { Message = "Esta tarefa já foi concluída." });

        // 2. Aplica a regra de negócio (Encapsulada na Entidade)
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

public class EscalateTaskHandler : IRequestHandler<EscalateTaskCommand, IResult>
{
    private readonly ApplicationDbContext _db;

    public EscalateTaskHandler(ApplicationDbContext db) { _db = db; }

    public async Task<IResult> Handle(EscalateTaskCommand request, CancellationToken ct)
    {
        var task = await _db.CycleCountTasks.FirstOrDefaultAsync(t => t.Id == request.TaskId, ct);
        if (task == null) return Results.NotFound();

        task.EscalateToStrictMode();
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// ==========================================
// 3. ENDPOINTS
// ==========================================
public static class CycleCountEndpoints
{
    public static void MapCycleCountEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/cycle-count").WithTags("CycleCount").RequireAuthorization();

        // Operações de Gestão
        group.MapPost("/plans", async (CreateCycleCountPlanCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Inventory.ManageQuality);
        group.MapPost("/tasks/{taskId:guid}/escalate", async (Guid taskId, IMediator mediator) => await mediator.Send(new EscalateTaskCommand(taskId))).RequirePermission(Permissions.Inventory.ManageQuality);

        // Operações do Coletor
        group.MapPost("/tasks/{taskId:guid}/record-volumetric", async (Guid taskId, AddVolumetricRecordCommand cmd, IMediator mediator) => await mediator.Send(cmd with { TaskId = taskId })).RequirePermission(Permissions.Inventory.View);
    }
}