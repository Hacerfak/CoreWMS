using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Services;

public static class CycleCountLockValidator
{
    public static async Task<string?> GetBlockedLocationErrorAsync(
        ApplicationDbContext db,
        Guid companyId,
        IEnumerable<Guid?> locationIds,
        CancellationToken ct)
    {
        var validIds = locationIds
            .Where(id => id.HasValue && id.Value != Guid.Empty)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();

        if (!validIds.Any())
            return null;

        var blockedTask = await db.CycleCountTasks
            .AsNoTracking()
            .Include(t => t.CycleCountPlan)
            .Include(t => t.Location)
            .FirstOrDefaultAsync(t =>
                t.CycleCountPlan.CompanyId == companyId &&
                t.CycleCountPlan.BlockMovements &&
                (t.CycleCountPlan.Status == CycleCountPlanStatus.ApprovedForCounting ||
                 t.CycleCountPlan.Status == CycleCountPlanStatus.InCounting ||
                 t.CycleCountPlan.Status == CycleCountPlanStatus.InReview) &&
                validIds.Contains(t.LocationId), ct);

        if (blockedTask != null)
        {
            return $"Operação Bloqueada: O endereço '{blockedTask.Location.FullPath}' está bloqueado pelo inventário '{blockedTask.CycleCountPlan.Name}' (Status: {blockedTask.CycleCountPlan.Status}).";
        }

        return null;
    }
}