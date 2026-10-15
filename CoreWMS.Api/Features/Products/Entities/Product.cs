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
    // Pesos Unitários da Unidade Base (Fallback oficial para WMS e SEFAZ)
    public decimal NetWeight { get; private set; }   // Peso Líquido Unitário (kg)
    public decimal GrossWeight { get; private set; } // Peso Bruto Unitário (kg)
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

    public Product(Guid companyId, Guid customerId, string sku, string description, string baseUnit, decimal netWeight = 0m, decimal grossWeight = 0m)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        Sku = sku.ToUpper().Trim();
        Description = description;
        BaseUnit = baseUnit.ToUpper().Trim();
        NetWeight = Math.Round(netWeight, 4);
        GrossWeight = Math.Round(grossWeight, 4);
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

    public void UpdateWeights(decimal netWeight, decimal grossWeight)
    {
        if (netWeight < 0 || grossWeight < 0)
            throw new ArgumentException("Os pesos do produto não podem ser negativos.");

        NetWeight = Math.Round(netWeight, 4);
        GrossWeight = Math.Round(grossWeight, 4);
        UpdatedAt = DateTime.UtcNow;
    }
}