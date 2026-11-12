using System.Security.Claims;
using CoreWMS.Api.Features.CycleCount.Entities;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record BlindCountEntryDto(
    string ScannedCode, // Pode ser LPN da HU ou SKU/EAN do produto
    decimal CountedQuantity
);

public record RecordBlindLocationCountCommand(
    Guid PlanId,
    Guid LocationId,
    bool IsEmptyLocation,
    List<BlindCountEntryDto> Entries
) : IRequest<IResult>;

public record StartLocationCountingCommand(Guid PlanId, Guid LocationId) : IRequest<IResult>;
public record CancelLocationCountingCommand(Guid PlanId, Guid LocationId) : IRequest<IResult>;

public class RecordBlindLocationCountHandler :
    IRequestHandler<RecordBlindLocationCountCommand, IResult>,
    IRequestHandler<StartLocationCountingCommand, IResult>,
    IRequestHandler<CancelLocationCountingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public RecordBlindLocationCountHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    private Guid GetUserId()
    {
        var claim = _http.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
    }

    public async Task<IResult> Handle(StartLocationCountingCommand request, CancellationToken ct)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty) return Results.Unauthorized();

        var tasks = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
            .Where(t => t.CycleCountPlanId == request.PlanId &&
                        t.LocationId == request.LocationId &&
                        (t.Status == CycleCountTaskStatus.Pending || t.Status == CycleCountTaskStatus.InCounting))
            .ToListAsync(ct);

        if (!tasks.Any())
            return Results.NotFound(new { Message = "Nenhuma tarefa pendente encontrada para este endereço." });

        tasks.First().CycleCountPlan.StartCounting();
        foreach (var t in tasks)
        {
            t.StartCounting(userId);
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Contagem do endereço iniciada." });
    }

    public async Task<IResult> Handle(CancelLocationCountingCommand request, CancellationToken ct)
    {
        var tasks = await _db.CycleCountTasks
            .Where(t => t.CycleCountPlanId == request.PlanId &&
                        t.LocationId == request.LocationId &&
                        t.Status == CycleCountTaskStatus.InCounting)
            .ToListAsync(ct);

        foreach (var t in tasks)
        {
            t.CancelCounting();
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Contagem cancelada e endereço devolvido à fila." });
    }

    public async Task<IResult> Handle(RecordBlindLocationCountCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var userId = GetUserId();
        if (userId == Guid.Empty) return Results.Unauthorized();

        var plan = await _db.CycleCountPlans
            .Include(p => p.Tasks)
            .FirstOrDefaultAsync(p => p.Id == request.PlanId && p.CompanyId == companyId, ct);

        if (plan == null)
            return Results.NotFound(new { Message = "Plano de inventário não encontrado." });

        var locationTasks = plan.Tasks
            .Where(t => t.LocationId == request.LocationId &&
                        (t.Status == CycleCountTaskStatus.Pending || t.Status == CycleCountTaskStatus.InCounting))
            .ToList();

        if (!locationTasks.Any())
            return Results.BadRequest(new { Message = "Não há tarefas abertas para este endereço neste plano." });

        if (!request.IsEmptyLocation && (request.Entries == null || !request.Entries.Any()))
            return Results.BadRequest(new { Message = "Adicione ao menos um item/LPN bipado ou marque 'Posição Vazia'." });

        plan.StartCounting();

        // Agrupa leituras do operador por ProductId resolvendo LPN ou SKU/EAN
        var countedByProduct = new Dictionary<Guid, (decimal Qty, string? LastLpn, bool AnyHuMismatch)>();
        var unknownEntries = new List<BlindCountEntryDto>();

        if (!request.IsEmptyLocation && request.Entries != null)
        {
            foreach (var entry in request.Entries)
            {
                var code = entry.ScannedCode.Trim().ToUpper();
                if (string.IsNullOrEmpty(code) || entry.CountedQuantity < 0) continue;

                // 1. Tenta resolver como LPN de HU
                var hu = await _db.HandlingUnits
                    .AsNoTracking()
                    .FirstOrDefaultAsync(h => h.CompanyId == companyId && h.Lpn == code, ct);

                if (hu != null)
                {
                    bool mismatch = hu.CurrentLocationId != request.LocationId;
                    if (countedByProduct.TryGetValue(hu.ProductId, out var acc))
                        countedByProduct[hu.ProductId] = (acc.Qty + entry.CountedQuantity, code, acc.AnyHuMismatch || mismatch);
                    else
                        countedByProduct[hu.ProductId] = (entry.CountedQuantity, code, mismatch);
                    continue;
                }

                // 2. Tenta resolver como SKU ou Código de Barras EAN
                var product = await _db.Products
                    .AsNoTracking()
                    .FirstOrDefaultAsync(p => p.CompanyId == companyId &&
                                              (p.Sku.ToUpper() == code || (p.BaseBarcode != null && p.BaseBarcode.ToUpper() == code)), ct);

                if (product != null)
                {
                    if (countedByProduct.TryGetValue(product.Id, out var acc))
                        countedByProduct[product.Id] = (acc.Qty + entry.CountedQuantity, acc.LastLpn, acc.AnyHuMismatch);
                    else
                        countedByProduct[product.Id] = (entry.CountedQuantity, null, false);
                }
                else
                {
                    unknownEntries.Add(entry);
                }
            }
        }

        if (unknownEntries.Any())
        {
            var badCodes = string.Join(", ", unknownEntries.Select(u => u.ScannedCode));
            return Results.BadRequest(new
            {
                Message = $"Código(s) LPN/SKU não reconhecido(s) no cadastro da empresa: {badCodes}."
            });
        }

        // 3. Concilia cada tarefa existente no endereço
        foreach (var task in locationTasks)
        {
            if (countedByProduct.TryGetValue(task.ProductId, out var found))
            {
                task.RecordRoundCount(found.Qty, userId, plan.MaxRounds, found.LastLpn, found.AnyHuMismatch);
                countedByProduct.Remove(task.ProductId);
            }
            else
            {
                // Produto era esperado (ou placeholder vazio), mas operador contou 0 (ou marcou Posição Vazia)
                task.RecordRoundCount(0m, userId, plan.MaxRounds, null, false);
            }
        }

        // 4. Sobras imprevistas: Produtos bipados pelo operador que NÃO estavam no snapshot daquela posição
        bool isDynamic = locationTasks.First().IsDynamicStorage;
        int round = locationTasks.First().CurrentRound;

        foreach (var extra in countedByProduct)
        {
            if (extra.Value.Qty <= 0) continue;

            var surplusTask = new CycleCountTask(
                plan.Id,
                request.LocationId,
                extra.Key,
                expectedQuantity: 0m,
                isDynamicStorage: isDynamic,
                assignedUserId: userId
            );

            while (surplusTask.CurrentRound < round)
            {
                surplusTask.RequestRecount(plan.MaxRounds);
            }

            surplusTask.RecordRoundCount(extra.Value.Qty, userId, plan.MaxRounds, extra.Value.LastLpn, extra.Value.AnyHuMismatch);
            _db.CycleCountTasks.Add(surplusTask);
        }

        plan.CheckCompletion();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = "Contagem cega do endereço registrada com sucesso e enviada para revisão da Gestão."
        });
    }
}

public static class RecordBlindLocationCountEndpoints
{
    public static void MapRecordBlindLocationCountEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/cycle-count/locations").WithTags("CycleCount").RequireAuthorization();

        group.MapPost("/{planId:guid}/{locationId:guid}/start", async (Guid planId, Guid locationId, IMediator mediator) =>
            await mediator.Send(new StartLocationCountingCommand(planId, locationId)))
            .RequirePermission(Permissions.Inventory.View);

        group.MapPost("/{planId:guid}/{locationId:guid}/cancel", async (Guid planId, Guid locationId, IMediator mediator) =>
            await mediator.Send(new CancelLocationCountingCommand(planId, locationId)))
            .RequirePermission(Permissions.Inventory.View);

        group.MapPost("/{planId:guid}/{locationId:guid}/record", async (Guid planId, Guid locationId, RecordBlindLocationCountCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { PlanId = planId, LocationId = locationId }))
            .RequirePermission(Permissions.Inventory.View);
    }
}