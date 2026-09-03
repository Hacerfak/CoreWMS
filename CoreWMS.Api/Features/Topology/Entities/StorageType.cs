using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Topology.Enums;

namespace CoreWMS.Api.Features.Topology.Entities;

public class StorageType : AuditableEntity
{
    public string Name { get; private set; } = string.Empty;
    public bool IsVirtual { get; private set; }
    public bool AllowMixedProducts { get; private set; }
    public bool AllowMixedBatches { get; private set; }
    public StorageCapacityStrategy CapacityStrategy { get; private set; }
    public bool IsActive { get; private set; } = true;

    protected StorageType() { }

    public StorageType(string name, bool isVirtual, bool allowMixedProducts, bool allowMixedBatches, StorageCapacityStrategy capacityStrategy)
    {
        Name = name;
        IsVirtual = isVirtual;
        AllowMixedProducts = allowMixedProducts;
        AllowMixedBatches = allowMixedBatches;
        CapacityStrategy = capacityStrategy;
    }

    public void Update(string name, bool isVirtual, bool allowMixedProducts, bool allowMixedBatches, StorageCapacityStrategy capacityStrategy)
    {
        Name = name;
        IsVirtual = isVirtual;
        AllowMixedProducts = allowMixedProducts;
        AllowMixedBatches = allowMixedBatches;
        CapacityStrategy = capacityStrategy;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
}