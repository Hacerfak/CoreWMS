using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Products.Enums;

namespace CoreWMS.Api.Features.Products.Entities;

public class Product : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;
    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;
    public string Sku { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public string BaseUnit { get; private set; } = "UN";
    public string? BaseBarcode { get; private set; }
    public string? Ncm { get; private set; }
    public string? Cest { get; private set; }
    public int Origin { get; private set; } = 0;

    // Regras Logísticas WMS (Autônomas)
    public bool TracksBatch { get; private set; }
    public bool StrictBatch { get; private set; }
    public bool TracksManufacture { get; private set; }
    public bool StrictManufacture { get; private set; }
    public bool TracksExpiration { get; private set; }
    public bool StrictExpiration { get; private set; }
    public bool TracksSerial { get; private set; }
    public bool StrictSerial { get; private set; }
    public PickingStrategy PickingStrategy { get; private set; }
    public PickingBaseDate PickingBaseDate { get; private set; }
    public int? InboundShelfLifeToleranceDays { get; private set; }
    public int? OutboundShelfLifeToleranceDays { get; private set; }
    public bool IsActive { get; private set; } = true;

    public ICollection<ProductPackaging> Packagings { get; private set; } = new List<ProductPackaging>();

    protected Product() { }

    public Product(Guid companyId, Guid customerId, string sku, string description, string baseUnit)
    {
        CompanyId = companyId; CustomerId = customerId; Sku = sku.ToUpper().Trim(); Description = description; BaseUnit = baseUnit.ToUpper().Trim();
    }

    public void UpdateFiscal(string? ncm, string? cest, int origin, string? baseBarcode)
    {
        Ncm = ncm; Cest = cest; Origin = origin; BaseBarcode = baseBarcode; UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateRules(
        bool tracksBatch, bool strictBatch, bool tracksMfg, bool strictMfg, bool tracksExp, bool strictExp, bool tracksSerial, bool strictSerial,
        PickingStrategy strategy, PickingBaseDate baseDate, int? inShelfLife, int? outShelfLife)
    {
        TracksBatch = tracksBatch; StrictBatch = strictBatch; TracksManufacture = tracksMfg; StrictManufacture = strictMfg;
        TracksExpiration = tracksExp; StrictExpiration = strictExp; TracksSerial = tracksSerial; StrictSerial = strictSerial;
        PickingStrategy = strategy; PickingBaseDate = baseDate;
        InboundShelfLifeToleranceDays = inShelfLife; OutboundShelfLifeToleranceDays = outShelfLife; UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateBasicInfo(string description, string baseUnit)
    {
        Description = description; BaseUnit = baseUnit.ToUpper().Trim(); UpdatedAt = DateTime.UtcNow;
    }
}