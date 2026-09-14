using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.CycleCount.Entities;

public class CycleCountRecord : AuditableEntity
{
    public Guid CycleCountTaskId { get; private set; }

    public int Round { get; private set; }
    public Guid InspectorId { get; private set; }

    // Contagem Volumétrica (Blocados sem desmanche)
    public int? CountedQuantity { get; private set; }

    // Contagem LPN (Porta-Pallets ou Blocados em Rodada 3)
    public Guid? ScannedHandlingUnitId { get; private set; }

    protected CycleCountRecord() { }

    public CycleCountRecord(Guid cycleCountTaskId, int round, Guid inspectorId, int? countedQuantity, Guid? scannedHandlingUnitId)
    {
        CycleCountTaskId = cycleCountTaskId;
        Round = round;
        InspectorId = inspectorId;
        CountedQuantity = countedQuantity;
        ScannedHandlingUnitId = scannedHandlingUnitId;
    }
}