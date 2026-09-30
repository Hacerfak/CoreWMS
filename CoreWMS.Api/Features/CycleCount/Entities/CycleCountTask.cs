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

    // Divergência calculada SOMENTE quando há contagem finalizada
    public decimal DivergenceQuantity => CountedQuantity.HasValue ? CountedQuantity.Value - ExpectedQuantity : 0m;

    public int CurrentRound { get; private set; }
    public bool IsDynamicStorage { get; private set; }
    public CycleCountTaskStatus Status { get; private set; }

    // Histórico de Rodadas (1ª, 2ª e 3ª Contagens)
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

    // 1. Iniciar Contagem (Atribui usuário e altera para Em Contagem)
    public void StartCounting(Guid userId)
    {
        AssignedUserId = userId;
        Status = CycleCountTaskStatus.InCounting;
        UpdatedAt = DateTime.UtcNow;
    }

    // 2. Cancelar Contagem no Modal (Libera para outro operador)
    public void CancelCounting()
    {
        AssignedUserId = null;
        Status = CycleCountTaskStatus.Pending;
        UpdatedAt = DateTime.UtcNow;
    }

    // 3. Registrar Contagem da Rodada Atual
    public void RecordRoundCount(decimal quantity, Guid userId, int maxPlanRounds)
    {
        CountedQuantity = quantity;

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

        if (quantity == ExpectedQuantity)
        {
            Status = CycleCountTaskStatus.Resolved;
            AdjustmentType = AdjustmentType.None;
        }
        else
        {
            if (CurrentRound < maxPlanRounds)
            {
                CurrentRound++;
                CountedQuantity = null; // Reseta para próxima rodada
                AssignedUserId = null;  // Libera para outro operador
                Status = CycleCountTaskStatus.Pending;
            }
            else
            {
                Status = CycleCountTaskStatus.CountedWithDivergence;
                AdjustmentType = quantity > ExpectedQuantity
                    ? AdjustmentType.Surplus_InboundNfe
                    : AdjustmentType.Shortage_ReturnNfe;
            }
        }

        UpdatedAt = DateTime.UtcNow;
    }

    // 4. Pedir Recontagem
    public void RequestRecount()
    {
        CurrentRound++;
        CountedQuantity = null;
        AssignedUserId = null;
        Status = CycleCountTaskStatus.Pending;
        AdjustmentType = AdjustmentType.None;
        UpdatedAt = DateTime.UtcNow;
    }

    // 5. Aplicar Ajuste Fiscal
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

    // 6. Resetar Tarefa ao Cancelar Plano
    public void ResetTask()
    {
        CurrentRound = 1;
        CountedQuantity = null;
        AssignedUserId = null;
        CountRound1 = null; UserRound1 = null;
        CountRound2 = null; UserRound2 = null;
        CountRound3 = null; UserRound3 = null;
        Status = CycleCountTaskStatus.Pending;
        AdjustmentType = AdjustmentType.None;
        FiscalDocumentNumber = null;
        FiscalNotes = null;
        UpdatedAt = DateTime.UtcNow;
    }
}