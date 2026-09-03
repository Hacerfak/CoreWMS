using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Topology.Entities;

public class Warehouse : AuditableEntity
{
    public string Code { get; private set; } = string.Empty; // Ex: P1
    public string Name { get; private set; } = string.Empty;
    public decimal ClearanceHeight { get; private set; } // Pé Direito em Metros
    public bool IsActive { get; private set; } = true;

    public ICollection<Zone> Zones { get; private set; } = new List<Zone>();

    protected Warehouse() { }

    public Warehouse(string code, string name, decimal clearanceHeight)
    {
        Code = code.ToUpper().Trim();
        Name = name;
        ClearanceHeight = clearanceHeight;
    }

    public void Update(string name, decimal clearanceHeight)
    {
        Name = name;
        ClearanceHeight = clearanceHeight;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
}