using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.CycleCount.Enums;

namespace CoreWMS.Api.Features.CycleCount.Entities;

public class CycleCountPlan : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public CycleCountPlanStatus Status { get; private set; }

    public bool BlockMovements { get; private set; }
    public int MaxRounds { get; private set; }
    public bool EnableAdjustments { get; private set; }
    public Guid? AssignedUserId { get; private set; }

    public List<Guid> CustomerIds { get; private set; } = new();
    public List<Guid> ProductIds { get; private set; } = new();
    public List<Guid> LocationIds { get; private set; } = new();
    public string? Batch { get; private set; }

    private readonly List<CycleCountTask> _tasks = new();
    public IReadOnlyCollection<CycleCountTask> Tasks => _tasks.AsReadOnly();

    protected CycleCountPlan() { }

    public CycleCountPlan(
        Guid companyId,
        string name,
        bool blockMovements,
        int maxRounds,
        bool enableAdjustments,
        Guid? assignedUserId,
        List<Guid>? customerIds,
        List<Guid>? productIds,
        List<Guid>? locationIds,
        string? batch)
    {
        CompanyId = companyId;
        Name = name;
        Status = CycleCountPlanStatus.Draft;
        BlockMovements = blockMovements;
        MaxRounds = Math.Clamp(maxRounds, 1, 3);
        EnableAdjustments = enableAdjustments;
        AssignedUserId = assignedUserId;

        if (customerIds != null) CustomerIds = customerIds;
        if (productIds != null) ProductIds = productIds;
        if (locationIds != null) LocationIds = locationIds;
        Batch = batch;
    }

    public void ApproveForCounting()
    {
        if (Status != CycleCountPlanStatus.Draft)
            throw new InvalidOperationException("Apenas planos em rascunho podem ser aprovados.");

        Status = CycleCountPlanStatus.ApprovedForCounting;
        UpdatedAt = DateTime.UtcNow;
    }

    public void StartCounting()
    {
        if (Status == CycleCountPlanStatus.ApprovedForCounting)
        {
            Status = CycleCountPlanStatus.InCounting;
            UpdatedAt = DateTime.UtcNow;
        }
    }

    public void ReopenForCounting()
    {
        Status = CycleCountPlanStatus.InCounting;
        UpdatedAt = DateTime.UtcNow;
    }

    // Valida se o plano terminou todas as tarefas
    public void CheckCompletion()
    {
        var activeTasks = _tasks.Where(t => t.Status != CycleCountTaskStatus.Recounted).ToList();

        if (!activeTasks.Any())
            return;

        bool allTasksFinished = activeTasks.All(t =>
            t.Status == CycleCountTaskStatus.Resolved ||
            t.Status == CycleCountTaskStatus.CountedWithDivergence);

        if (allTasksFinished)
        {
            Status = CycleCountPlanStatus.InReview; // Muda para Em Análise
        }
        else
        {
            Status = CycleCountPlanStatus.InCounting; // Mantém Em Contagem
        }

        UpdatedAt = DateTime.UtcNow;
    }

    // Cancela e volta para Rascunho
    public void CancelToDraft()
    {
        Status = CycleCountPlanStatus.Draft;
        foreach (var task in _tasks)
        {
            task.ResetTask();
        }
        UpdatedAt = DateTime.UtcNow;
    }

    public void Close()
    {
        Status = CycleCountPlanStatus.Closed;
        UpdatedAt = DateTime.UtcNow;
    }
}