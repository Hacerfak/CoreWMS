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

    public decimal ExpectedQuantity { get; private set; }
    public decimal? CountedQuantity { get; private set; }
    public decimal DivergenceQuantity => (CountedQuantity ?? 0m) - ExpectedQuantity;

    public int CurrentRound { get; private set; }
    public bool IsDynamicStorage { get; private set; } // Armazenamento Blocado / Dinâmico
    public CycleCountTaskStatus Status { get; private set; }

    // Amarração Fiscal do Ajuste
    public AdjustmentType AdjustmentType { get; private set; }
    public Guid? FiscalDocumentId { get; private set; }
    public string? FiscalDocumentNumber { get; private set; }
    public string? FiscalNotes { get; private set; }

    // Coleção do Histórico de Apontamentos / Bipagens (Records)
    private readonly List<CycleCountRecord> _records = new();
    public IReadOnlyCollection<CycleCountRecord> Records => _records.AsReadOnly();

    protected CycleCountTask() { }

    public CycleCountTask(Guid cycleCountPlanId, Guid locationId, Guid productId, decimal expectedQuantity, bool isDynamicStorage)
    {
        CycleCountPlanId = cycleCountPlanId;
        LocationId = locationId;
        ProductId = productId;
        ExpectedQuantity = expectedQuantity;
        IsDynamicStorage = isDynamicStorage;
        CurrentRound = 1;
        Status = CycleCountTaskStatus.Pending;
        AdjustmentType = AdjustmentType.None;
    }

    // Apontamento Cego da Posição (Volumétrico)
    public void RecordPositionCount(decimal countedQuantity, Guid? inspectorId = null)
    {
        CountedQuantity = countedQuantity;

        if (inspectorId.HasValue)
        {
            _records.Add(new CycleCountRecord(Id, CurrentRound, inspectorId.Value, (int)countedQuantity, null));
        }

        if (countedQuantity == ExpectedQuantity)
        {
            Status = CycleCountTaskStatus.Resolved;
            AdjustmentType = AdjustmentType.None;
        }
        else
        {
            Status = CycleCountTaskStatus.CountedWithDivergence;
            AdjustmentType = countedQuantity > ExpectedQuantity
                ? AdjustmentType.Surplus_InboundNfe
                : AdjustmentType.Shortage_ReturnNfe;
        }

        UpdatedAt = DateTime.UtcNow;
    }

    // Registro de Bipagem Estrita de HU/LPN Individual
    public void AddStrictLpnRecord(Guid inspectorId, Guid handlingUnitId)
    {
        if (_records.Any(r => r.Round == CurrentRound && r.ScannedHandlingUnitId == handlingUnitId))
            return;

        _records.Add(new CycleCountRecord(Id, CurrentRound, inspectorId, null, handlingUnitId));
        UpdatedAt = DateTime.UtcNow;
    }

    // Recontagem (Nova Rodada solicitada pela Gestão)
    public void RequestRecount()
    {
        CurrentRound++;
        CountedQuantity = null;
        Status = CycleCountTaskStatus.Pending;
        AdjustmentType = AdjustmentType.None;
        UpdatedAt = DateTime.UtcNow;
    }

    // Aplicação do Ajuste Fiscal e Baixa
    public void ApplyFiscalAdjustment(Guid documentId, string documentNumber, string? notes)
    {
        FiscalDocumentId = documentId;
        FiscalDocumentNumber = documentNumber;
        FiscalNotes = notes;
        Status = CycleCountTaskStatus.Resolved;
        UpdatedAt = DateTime.UtcNow;
    }
}