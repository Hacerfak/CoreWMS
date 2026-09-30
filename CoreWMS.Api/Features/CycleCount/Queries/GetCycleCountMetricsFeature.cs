using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Queries;

public record CycleCountMetricsDto(
    decimal GlobalIraRate,            // IRA % (Índice de Acuracidade de Estoque)
    int TotalPlansCount,              // Total de planos criados
    int ActivePlansCount,             // Planos em andamento/liberados
    int TotalTasksCount,              // Total de posições inventariadas
    int ResolvedTasksCount,           // Posições conciliadas sem divergência
    int DivergentTasksCount,          // Posições com divergência física
    int PendingFiscalAdjustmentsCount,// Divergências aguardando NF-e (Sobra/Falta)
    decimal TotalSurplusQuantity,     // Total de peças sobrando
    decimal TotalShortageQuantity     // Total de peças faltando
);

public record GetCycleCountMetricsQuery(Guid? CustomerId) : IRequest<IResult>;

public class GetCycleCountMetricsHandler : IRequestHandler<GetCycleCountMetricsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetCycleCountMetricsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetCycleCountMetricsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var plansQuery = _db.CycleCountPlans.AsNoTracking().Where(p => p.CompanyId == companyId);
        var tasksQuery = _db.CycleCountTasks.AsNoTracking().Where(t => t.CycleCountPlan.CompanyId == companyId);

        // Viseira Partner B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            plansQuery = plansQuery.Where(p => p.CustomerIds.Count == 0 || p.CustomerIds.Any(id => allowedCustomerIds.Contains(id)));
            tasksQuery = tasksQuery.Where(t => t.CycleCountPlan.CustomerIds.Count == 0 || t.CycleCountPlan.CustomerIds.Any(id => allowedCustomerIds.Contains(id)));
        }

        // Filtro por Depositante Específico
        if (request.CustomerId.HasValue)
        {
            plansQuery = plansQuery.Where(p => p.CustomerIds.Count == 0 || p.CustomerIds.Contains(request.CustomerId.Value));
            tasksQuery = tasksQuery.Where(t => t.CycleCountPlan.CustomerIds.Count == 0 || t.CycleCountPlan.CustomerIds.Contains(request.CustomerId.Value));
        }

        var totalPlans = await plansQuery.CountAsync(ct);
        var activePlans = await plansQuery.CountAsync(p => p.Status == CycleCountPlanStatus.ApprovedForCounting || p.Status == CycleCountPlanStatus.InCounting, ct);

        var totalTasks = await tasksQuery.CountAsync(ct);
        var resolvedTasks = await tasksQuery.CountAsync(t => t.Status == CycleCountTaskStatus.Resolved, ct);
        var divergentTasks = await tasksQuery.CountAsync(t => t.Status == CycleCountTaskStatus.CountedWithDivergence, ct);
        var pendingFiscal = await tasksQuery.CountAsync(t => t.Status == CycleCountTaskStatus.CountedWithDivergence && string.IsNullOrEmpty(t.FiscalDocumentNumber), ct);

        // Cálculo do IRA (Índice de Acuracidade de Estoque Global)
        decimal iraRate = totalTasks > 0
            ? Math.Round(((decimal)(totalTasks - divergentTasks) / totalTasks) * 100m, 2)
            : 100m;

        var surplusQty = await tasksQuery
            .Where(t => t.CountedQuantity.HasValue && t.CountedQuantity.Value > t.ExpectedQuantity)
            .SumAsync(t => (decimal?)(t.CountedQuantity!.Value - t.ExpectedQuantity), ct) ?? 0m;

        var shortageQty = await tasksQuery
            .Where(t => t.CountedQuantity.HasValue && t.CountedQuantity.Value < t.ExpectedQuantity)
            .SumAsync(t => (decimal?)(t.ExpectedQuantity - t.CountedQuantity!.Value), ct) ?? 0m;

        var metrics = new CycleCountMetricsDto(
            iraRate,
            totalPlans,
            activePlans,
            totalTasks,
            resolvedTasks,
            divergentTasks,
            pendingFiscal,
            surplusQty,
            shortageQty
        );

        return Results.Ok(metrics);
    }
}

public static class GetCycleCountMetricsEndpoints
{
    public static void MapGetCycleCountMetricsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/cycle-count/metrics", async ([AsParameters] GetCycleCountMetricsQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}