using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Topology.Entities;

public class Zone : AuditableEntity
{
    public Guid WarehouseId { get; private set; }
    public Warehouse Warehouse { get; private set; } = null!;

    public string Code { get; private set; } = string.Empty; // Ex: C1
    public string Name { get; private set; } = string.Empty;
    public bool IsActive { get; private set; } = true;

    public ICollection<Location> Locations { get; private set; } = new List<Location>();

    protected Zone() { }

    public Zone(Guid warehouseId, string code, string name)
    {
        WarehouseId = warehouseId;
        Code = code.ToUpper().Trim();
        Name = name;
    }

    public void Update(string name)
    {
        Name = name;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
}