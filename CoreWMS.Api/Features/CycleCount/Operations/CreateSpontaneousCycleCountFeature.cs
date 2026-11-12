using System.Security.Claims;
using CoreWMS.Api.Features.CycleCount.Entities;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record CreateSpontaneousCycleCountCommand(
    List<string> LocationCodes,
    int MaxRounds = 2
) : IRequest<IResult>;

public class CreateSpontaneousCycleCountValidator : AbstractValidator<CreateSpontaneousCycleCountCommand>
{
    public CreateSpontaneousCycleCountValidator()
    {
        RuleFor(x => x.LocationCodes)
            .NotEmpty().WithMessage("Informe ou bipe ao menos um endereço para iniciar a contagem.");
    }
}

public class CreateSpontaneousCycleCountHandler : IRequestHandler<CreateSpontaneousCycleCountCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public CreateSpontaneousCycleCountHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(CreateSpontaneousCycleCountCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var user = _http.HttpContext?.User;
        var userIdClaim = user?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return Results.Unauthorized();

        var userName = user?.FindFirst("Name")?.Value ?? user?.Identity?.Name ?? "Operador";

        var normalizedCodes = request.LocationCodes
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Select(c => c.Trim().ToUpper())
            .Distinct()
            .ToList();

        // 1. Localiza os endereços na topologia da empresa
        var locations = await _db.Locations
            .Include(l => l.StorageType)
            .Include(l => l.Zone)
                .ThenInclude(z => z.Warehouse)
            .Where(l => l.IsActive &&
                        (normalizedCodes.Contains(l.FullPath.ToUpper()) || normalizedCodes.Contains(l.Code.ToUpper())))
            .ToListAsync(ct);

        if (!locations.Any())
            return Results.BadRequest(new { Message = "Nenhum endereço válido encontrado para os códigos informados." });

        var missingCodes = normalizedCodes
            .Where(c => !locations.Any(l => l.FullPath.Equals(c, StringComparison.OrdinalIgnoreCase) || l.Code.Equals(c, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        if (missingCodes.Any())
            return Results.BadRequest(new { Message = $"Endereço(s) não encontrado(s): {string.Join(", ", missingCodes)}." });

        var locationIds = locations.Select(l => l.Id).ToList();

        // 2. Verifica se algum endereço já está em contagem ativa
        var alreadyInCount = await _db.CycleCountTasks
            .AsNoTracking()
            .Include(t => t.CycleCountPlan)
            .Include(t => t.Location)
            .FirstOrDefaultAsync(t =>
                t.CycleCountPlan.CompanyId == companyId &&
                (t.CycleCountPlan.Status == CycleCountPlanStatus.ApprovedForCounting ||
                 t.CycleCountPlan.Status == CycleCountPlanStatus.InCounting ||
                 t.CycleCountPlan.Status == CycleCountPlanStatus.InReview) &&
                locationIds.Contains(t.LocationId), ct);

        if (alreadyInCount != null)
        {
            return Results.BadRequest(new
            {
                Message = $"O endereço '{alreadyInCount.Location.FullPath}' já faz parte do inventário ativo '{alreadyInCount.CycleCountPlan.Name}'."
            });
        }

        // 3. Cria o plano espontâneo já aprovado/em contagem, bloqueando movimentações e vinculado ao operador
        var planName = $"Inventário Espontâneo - {userName} ({DateTime.UtcNow.AddHours(-3):dd/MM HH:mm})";
        var plan = new CycleCountPlan(
            companyId: companyId,
            name: planName,
            blockMovements: true,
            maxRounds: request.MaxRounds,
            enableAdjustments: true,
            assignedUserId: userId,
            customerIds: new List<Guid>(),
            productIds: new List<Guid>(),
            locationIds: locationIds,
            batch: null
        );

        plan.ApproveForCounting();
        plan.StartCounting();
        _db.CycleCountPlans.Add(plan);

        // 4. Snapshot cego das HUs atualmente nesses endereços
        var snapshot = await _db.HandlingUnits
            .AsNoTracking()
            .Where(h => h.CompanyId == companyId &&
                        h.CurrentLocationId.HasValue &&
                        locationIds.Contains(h.CurrentLocationId.Value) &&
                        h.CurrentQuantity > 0)
            .GroupBy(h => new { LocationId = h.CurrentLocationId!.Value, h.ProductId })
            .Select(g => new
            {
                g.Key.LocationId,
                g.Key.ProductId,
                ExpectedQty = g.Sum(x => x.CurrentQuantity)
            })
            .ToListAsync(ct);

        int tasksCreated = 0;

        foreach (var loc in locations)
        {
            bool isDynamic = loc.StorageType?.Role == StorageRole.Storage &&
                             (loc.StorageType.CapacityStrategy == StorageCapacityStrategy.DynamicStacking ||
                              (loc.StorageType.Name?.Contains("Blocado", StringComparison.OrdinalIgnoreCase) ?? false));

            var locItems = snapshot.Where(s => s.LocationId == loc.Id).ToList();

            if (locItems.Any())
            {
                foreach (var item in locItems)
                {
                    var task = new CycleCountTask(plan.Id, loc.Id, item.ProductId, item.ExpectedQty, isDynamic, userId);
                    _db.CycleCountTasks.Add(task);
                    tasksCreated++;
                }
            }
            else
            {
                // Endereço vazio no sistema: vincula ao primeiro produto da empresa apenas como âncora de ExpectedQty = 0
                // (Permite ao operador confirmar posição vazia ou detectar sobra física!)
                var fallbackProductId = await _db.Products
                    .AsNoTracking()
                    .Where(p => p.CompanyId == companyId)
                    .Select(p => p.Id)
                    .FirstOrDefaultAsync(ct);

                if (fallbackProductId != Guid.Empty)
                {
                    var emptyTask = new CycleCountTask(plan.Id, loc.Id, fallbackProductId, 0m, isDynamic, userId);
                    _db.CycleCountTasks.Add(emptyTask);
                    tasksCreated++;
                }
            }
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            plan.Id,
            PlanName = plan.Name,
            LocationsCount = locations.Count,
            TasksGenerated = tasksCreated,
            Message = $"Contagem espontânea iniciada para {locations.Count} endereço(s). Movimentações bloqueadas até a revisão."
        });
    }
}

public static class CreateSpontaneousCycleCountEndpoints
{
    public static void MapCreateSpontaneousCycleCountEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/plans/spontaneous", async (CreateSpontaneousCycleCountCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}