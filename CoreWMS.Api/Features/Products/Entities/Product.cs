using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Products.Enums;

namespace CoreWMS.Api.Features.Products.Entities;

public class Product : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public Guid CustomerId { get; private set; } // Depositante dono do produto
    public Customer Customer { get; private set; } = null!;

    // Identificação Básica
    public string Sku { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public string BaseUnit { get; private set; } = "UN"; // Unidade de medida fiscal base
    public string? BaseBarcode { get; private set; } // EAN/GTIN base

    // Dados Fiscais (Zeus DF-e)
    public string? Ncm { get; private set; }
    public string? Cest { get; private set; }
    public int Origin { get; private set; } = 0; // 0-Nacional, 1-Estrangeira Direta, etc.

    // Parâmetros Físicos e de Ocupação (Integração com Topologia)
    public int MaxStacking { get; private set; } = 1; // Limite de empilhamento no Blocado

    // Regras Logísticas WMS (Herdadas do Customer na criação, mas personalizáveis)
    public bool RequireBatchControl { get; private set; }
    public bool RequireManufactureDate { get; private set; }
    public bool RequireExpirationDate { get; private set; }
    public bool RequireSerialControl { get; private set; }
    public PickingStrategy PickingStrategy { get; private set; }

    // Tolerâncias de Validade
    public int? InboundShelfLifeToleranceDays { get; private set; }
    public int? OutboundShelfLifeToleranceDays { get; private set; }

    public bool IsActive { get; private set; } = true;

    // Relacionamento com os Volumes
    public ICollection<ProductPackaging> Packagings { get; private set; } = new List<ProductPackaging>();

    protected Product() { }

    public Product(Guid companyId, Guid customerId, string sku, string description, string baseUnit, PickingStrategy strategy)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        Sku = sku.ToUpper().Trim();
        Description = description;
        BaseUnit = baseUnit.ToUpper().Trim();
        PickingStrategy = strategy;
    }

    public void UpdateFiscal(string? ncm, string? cest, int origin, string? baseBarcode)
    {
        Ncm = ncm;
        Cest = cest;
        Origin = origin;
        BaseBarcode = baseBarcode;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateRules(bool reqBatch, bool reqMfg, bool reqExp, bool reqSerial, PickingStrategy strategy, int maxStacking, int? inShelfLife, int? outShelfLife)
    {
        RequireBatchControl = reqBatch;
        RequireManufactureDate = reqMfg;
        RequireExpirationDate = reqExp;
        RequireSerialControl = reqSerial;
        PickingStrategy = strategy;
        MaxStacking = maxStacking;
        InboundShelfLifeToleranceDays = inShelfLife;
        OutboundShelfLifeToleranceDays = outShelfLife;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateBasicInfo(string description, string baseUnit)
    {
        Description = description;
        BaseUnit = baseUnit.ToUpper().Trim();
        UpdatedAt = DateTime.UtcNow;
    }
}