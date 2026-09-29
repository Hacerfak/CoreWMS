using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Products.Entities;

namespace CoreWMS.Api.Features.CycleCount.Entities;

public class CycleCountPlan : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public CycleCountPlanStatus Status { get; private set; }

    // Filtros do Inventário
    public Guid? CustomerId { get; private set; }
    public Customer? Customer { get; private set; }
    public Guid? ProductId { get; private set; }
    public Product? Product { get; private set; }
    public string? Batch { get; private set; }
    public Guid? ZoneId { get; private set; }
    public Zone? Zone { get; private set; }
    public Guid? LocationId { get; private set; }
    public Location? Location { get; private set; }

    private readonly List<CycleCountTask> _tasks = new();
    public IReadOnlyCollection<CycleCountTask> Tasks => _tasks.AsReadOnly();

    protected CycleCountPlan() { }

    public CycleCountPlan(Guid companyId, string name, Guid? customerId, Guid? productId, string? batch, Guid? zoneId, Guid? locationId)
    {
        CompanyId = companyId;
        Name = name;
        Status = CycleCountPlanStatus.Draft; // Inicia sempre como Rascunho
        CustomerId = customerId;
        ProductId = productId;
        Batch = batch;
        ZoneId = zoneId;
        LocationId = locationId;
    }

    public void ApproveForCounting()
    {
        if (Status != CycleCountPlanStatus.Draft)
            throw new InvalidOperationException("Apenas planos em Rascunho podem ser aprovados para contagem.");

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

    public void CheckCompletion()
    {
        if (_tasks.All(t => t.Status == CycleCountTaskStatus.Resolved))
        {
            Status = CycleCountPlanStatus.Closed;
        }
        else if (_tasks.All(t => t.Status != CycleCountTaskStatus.Pending))
        {
            Status = CycleCountPlanStatus.InReview;
        }
        UpdatedAt = DateTime.UtcNow;
    }

    public void Close()
    {
        if (_tasks.Any(t => t.Status == CycleCountTaskStatus.Pending || t.Status == CycleCountTaskStatus.CountedWithDivergence))
            throw new InvalidOperationException("Não é possível fechar o plano com tarefas pendentes de contagem ou divergências sem tratamento fiscal.");

        Status = CycleCountPlanStatus.Closed;
        UpdatedAt = DateTime.UtcNow;
    }
}