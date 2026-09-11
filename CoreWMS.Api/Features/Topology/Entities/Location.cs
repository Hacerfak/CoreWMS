using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Topology.Entities;

public class Location : AuditableEntity
{
    public Guid ZoneId { get; private set; }
    public Zone Zone { get; private set; } = null!;

    public Guid StorageTypeId { get; private set; }
    public StorageType StorageType { get; private set; } = null!;

    public string Code { get; private set; } = string.Empty; // Ex: B1

    // Caminho completo (Ex: P1-C1-B1) salvo no banco para indexação e leitura ultrarrápida via código de barras
    public string FullPath { get; private set; } = string.Empty;

    public int BaseCapacity { get; private set; } // Footprint (Quantos pallets cabem no chão)
    public bool IsActive { get; private set; } = true;

    protected Location() { }

    public Location(Guid zoneId, Guid storageTypeId, string code, string fullPath, int baseCapacity, string? aisle = null, string? building = null, string? level = null, string? slot = null)
    {
        ZoneId = zoneId;
        StorageTypeId = storageTypeId;
        Code = code.ToUpper().Trim();
        FullPath = fullPath.ToUpper().Trim();
        BaseCapacity = baseCapacity;
    }

    public void Update(Guid storageTypeId, int baseCapacity, bool isActive)
    {
        StorageTypeId = storageTypeId;
        BaseCapacity = baseCapacity;
        IsActive = isActive;
        UpdatedAt = DateTime.UtcNow;
    }
}