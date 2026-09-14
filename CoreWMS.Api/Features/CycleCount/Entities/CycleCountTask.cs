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

    public int ExpectedQuantity { get; private set; }
    public int CurrentRound { get; private set; }
    public bool IsStrictLpnMode { get; private set; }
    public CycleCountTaskStatus Status { get; private set; }

    private readonly List<CycleCountRecord> _records = new();
    public IReadOnlyCollection<CycleCountRecord> Records => _records.AsReadOnly();

    protected CycleCountTask() { }

    public CycleCountTask(Guid cycleCountPlanId, Guid locationId, Guid productId, int expectedQuantity)
    {
        CycleCountPlanId = cycleCountPlanId;
        LocationId = locationId;
        ProductId = productId;
        ExpectedQuantity = expectedQuantity;
        CurrentRound = 1;
        IsStrictLpnMode = false;
        Status = CycleCountTaskStatus.Pending;
    }

    // Registra contagem volumétrica (Rodadas 1 e 2)
    public void AddVolumetricRecord(Guid inspectorId, int countedQuantity)
    {
        if (IsStrictLpnMode) throw new InvalidOperationException("Esta tarefa exige contagem por LPN (Desmanche).");

        _records.Add(new CycleCountRecord(Id, CurrentRound, inspectorId, countedQuantity, null));

        if (countedQuantity == ExpectedQuantity)
        {
            Status = CycleCountTaskStatus.Resolved;
        }
        else
        {
            Status = CycleCountTaskStatus.Counted_With_Divergence;
            CurrentRound++;

            // Se falhou na rodada 2, pausa para o gestor avaliar
            if (CurrentRound > 2)
            {
                Status = CycleCountTaskStatus.Escalated_To_Manager;
            }
        }
        UpdatedAt = DateTime.UtcNow;
    }

    // Registra bipagem de HU individual (Rodadas 3+)
    public void AddStrictLpnRecord(Guid inspectorId, Guid handlingUnitId)
    {
        if (!IsStrictLpnMode) throw new InvalidOperationException("O modo LPN restrito não está ativado para esta tarefa.");

        // Verifica se a HU já foi bipada nesta mesma rodada para evitar duplicidade
        if (_records.Any(r => r.Round == CurrentRound && r.ScannedHandlingUnitId == handlingUnitId))
            return;

        _records.Add(new CycleCountRecord(Id, CurrentRound, inspectorId, null, handlingUnitId));
        UpdatedAt = DateTime.UtcNow;
    }

    // Ação do Gestor
    public void EscalateToStrictMode()
    {
        if (Status != CycleCountTaskStatus.Escalated_To_Manager) throw new InvalidOperationException("A tarefa não está aguardando revisão do gestor.");

        IsStrictLpnMode = true;
        Status = CycleCountTaskStatus.Pending; // Volta para os coletores, agora exigindo desmanche
        UpdatedAt = DateTime.UtcNow;
    }

    // Fechamento manual/forçado após tratamento de Quarentena
    public void ResolveTask()
    {
        Status = CycleCountTaskStatus.Resolved;
        UpdatedAt = DateTime.UtcNow;
    }
}