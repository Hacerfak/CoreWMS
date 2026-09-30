using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Products.Entities;

namespace CoreWMS.Api.Features.CycleCount.Entities;

public class CycleCountTask : AuditableEntity
{
    public Guid CycleCountPlanId { get; private set; }
    public CycleCountPlan CycleCountPlan { get; private set; } = null!;

    public Guid LocationId { get; private set; }
    public Location Location { get; private set; } = null!;

    public Guid ProductId { get; private set; }
    public Product Product { get; private set; } = null!;

    public Guid? AssignedUserId { get; private set; }

    public decimal ExpectedQuantity { get; private set; }
    public decimal? CountedQuantity { get; private set; }

    public decimal DivergenceQuantity => CountedQuantity.HasValue ? CountedQuantity.Value - ExpectedQuantity : 0m;

    public int CurrentRound { get; private set; }
    public bool IsDynamicStorage { get; private set; }
    public CycleCountTaskStatus Status { get; private set; }

    // Rastreamento da HU bipada pelo operador
    public string? ScannedLpn { get; private set; }
    public bool IsHuMismatch { get; private set; }

    // Histórico de Rodadas
    public decimal? CountRound1 { get; private set; }
    public Guid? UserRound1 { get; private set; }
    public decimal? CountRound2 { get; private set; }
    public Guid? UserRound2 { get; private set; }
    public decimal? CountRound3 { get; private set; }
    public Guid? UserRound3 { get; private set; }

    // Amarração Fiscal
    public AdjustmentType AdjustmentType { get; private set; }
    public string? FiscalDocumentNumber { get; private set; }
    public string? FiscalNotes { get; private set; }

    protected CycleCountTask() { }

    public CycleCountTask(
        Guid cycleCountPlanId,
        Guid locationId,
        Guid productId,
        decimal expectedQuantity,
        bool isDynamicStorage,
        Guid? assignedUserId)
    {
        CycleCountPlanId = cycleCountPlanId;
        LocationId = locationId;
        ProductId = productId;
        ExpectedQuantity = expectedQuantity;
        IsDynamicStorage = isDynamicStorage;
        AssignedUserId = assignedUserId;
        CurrentRound = 1;
        Status = CycleCountTaskStatus.Pending;
        AdjustmentType = AdjustmentType.None;
    }

    public void StartCounting(Guid userId)
    {
        AssignedUserId = userId;
        Status = CycleCountTaskStatus.InCounting;
        UpdatedAt = DateTime.UtcNow;
    }

    public void CancelCounting()
    {
        AssignedUserId = null;
        Status = CycleCountTaskStatus.Pending;
        UpdatedAt = DateTime.UtcNow;
    }

    public void RecordRoundCount(decimal quantity, Guid userId, int maxPlanRounds, string? scannedLpn = null, bool isHuMismatch = false)
    {
        CountedQuantity = quantity;
        ScannedLpn = scannedLpn;
        IsHuMismatch = isHuMismatch;

        if (CurrentRound == 1)
        {
            CountRound1 = quantity;
            UserRound1 = userId;
        }
        else if (CurrentRound == 2)
        {
            CountRound2 = quantity;
            UserRound2 = userId;
        }
        else if (CurrentRound == 3)
        {
            CountRound3 = quantity;
            UserRound3 = userId;
        }

        // É conciliado APENAS se a quantidade bater E não houver divergência de HU
        if (quantity == ExpectedQuantity && !isHuMismatch)
        {
            Status = CycleCountTaskStatus.Resolved;
            AdjustmentType = AdjustmentType.None;
        }
        else
        {
            if (CurrentRound < maxPlanRounds)
            {
                CurrentRound++;
                CountedQuantity = null;
                AssignedUserId = null;
                Status = CycleCountTaskStatus.Pending;
            }
            else
            {
                Status = CycleCountTaskStatus.CountedWithDivergence;
                if (quantity > ExpectedQuantity)
                    AdjustmentType = AdjustmentType.Surplus_InboundNfe;
                else if (quantity < ExpectedQuantity)
                    AdjustmentType = AdjustmentType.Shortage_ReturnNfe;
                else
                    AdjustmentType = AdjustmentType.None; // Divergência exclusiva de HU (LPN trocado)
            }
        }

        UpdatedAt = DateTime.UtcNow;
    }

    public void RequestRecount()
    {
        CurrentRound++;
        CountedQuantity = null;
        AssignedUserId = null;
        Status = CycleCountTaskStatus.Pending;
        AdjustmentType = AdjustmentType.None;
        UpdatedAt = DateTime.UtcNow;
    }

    public void ApplyFiscalAdjustment(string documentNumber, string? notes)
    {
        FiscalDocumentNumber = documentNumber;
        FiscalNotes = notes;
        Status = CycleCountTaskStatus.Resolved;
        UpdatedAt = DateTime.UtcNow;
    }

    public void MarkAsRecounted()
    {
        Status = CycleCountTaskStatus.Recounted;
        UpdatedAt = DateTime.UtcNow;
    }

    public void ResetTask()
    {
        CurrentRound = 1;
        CountedQuantity = null;
        AssignedUserId = null;
        CountRound1 = null; UserRound1 = null;
        CountRound2 = null; UserRound2 = null;
        CountRound3 = null; UserRound3 = null;
        ScannedLpn = null;
        IsHuMismatch = false;
        Status = CycleCountTaskStatus.Pending;
        AdjustmentType = AdjustmentType.None;
        FiscalDocumentNumber = null;
        FiscalNotes = null;
        UpdatedAt = DateTime.UtcNow;
    }
}