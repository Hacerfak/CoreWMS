using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Products.Entities;

namespace CoreWMS.Api.Features.Inbound.Entities;

public class InboundOrderItem : AuditableEntity
{
    public Guid InboundOrderId { get; private set; }
    public InboundOrder InboundOrder { get; private set; } = null!;

    // Vínculo com o catálogo WMS (Pode ser nulo inicialmente até a Revisão do Gestor)
    public Guid? ProductId { get; private set; }
    public Product? Product { get; private set; }

    // Dados extraídos diretamente do XML (Imutáveis)
    public string SkuOriginal { get; private set; } = string.Empty; // Tag <cProd>
    public string? BarcodeOriginal { get; private set; } // Tag <cEAN>
    public string DescriptionOriginal { get; private set; } = string.Empty; // Tag <xProd>
    public string UnitOriginal { get; private set; } = string.Empty; // Tag <uCom>
    public decimal ExpectedQty { get; private set; } // Tag <qCom>
    public decimal UnitValue { get; private set; } // Tag <vUnCom>
    public decimal TotalValue { get; private set; } // Tag <vProd>

    public string? Ncm { get; private set; }
    public string? Cest { get; private set; }

    // Rastreabilidade Integrada (Tag <rastro> e <med>)
    public string? BatchOriginal { get; private set; } // Tag <nLote>
    public DateTime? ManufactureDateOriginal { get; private set; } // Tag <dFab>
    public DateTime? ExpirationDateOriginal { get; private set; } // Tag <dVal>

    protected InboundOrderItem() { }

    public InboundOrderItem(Guid inboundOrderId, string skuOriginal, string? barcodeOriginal, string descriptionOriginal, string unitOriginal, decimal expectedQty, decimal unitValue, decimal totalValue, string? ncm, string? cest, string? batchOriginal, DateTime? manufactureDateOriginal, DateTime? expirationDateOriginal)
    {
        InboundOrderId = inboundOrderId;
        SkuOriginal = skuOriginal;
        BarcodeOriginal = barcodeOriginal;
        DescriptionOriginal = descriptionOriginal;
        UnitOriginal = unitOriginal;
        ExpectedQty = expectedQty;
        UnitValue = unitValue;
        TotalValue = totalValue;
        Ncm = ncm;
        Cest = cest;
        BatchOriginal = batchOriginal;

        // CORREÇÃO: Forçando a conversão para UTC caso a data venha do XML sem timezone (Unspecified/Local)
        ManufactureDateOriginal = manufactureDateOriginal?.Kind == DateTimeKind.Utc
            ? manufactureDateOriginal
            : manufactureDateOriginal?.ToUniversalTime();

        ExpirationDateOriginal = expirationDateOriginal?.Kind == DateTimeKind.Utc
            ? expirationDateOriginal
            : expirationDateOriginal?.ToUniversalTime();
    }

    // Ação do Gestor na tela de Revisão
    public void LinkProduct(Guid productId)
    {
        ProductId = productId;
        UpdatedAt = DateTime.UtcNow;
    }
}