using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Products.Entities;

public class ProductPackaging : AuditableEntity
{
    public Guid ProductId { get; private set; }
    public Product Product { get; private set; } = null!;

    public Guid PackagingTypeId { get; private set; }
    public PackagingType PackagingType { get; private set; } = null!;

    public string? Barcode { get; private set; } // DUN14 / ITF14 da caixa ou pallet
    public decimal ConversionFactor { get; private set; } // Quantidade da unidade base. Ex: 1 Pallet = 1500 UN

    // Flag de comportamento
    public bool IsDefaultInbound { get; private set; } // Vem marcado se for a forma padrão de recebimento
    public bool IsDefaultOutbound { get; private set; }
    public bool AllowFractionalPicking { get; private set; } // Posso abrir esse volume para expedir solto?

    // Dimensões e Peso (Fundamentais para roteirização e cálculo de Frete)
    public decimal GrossWeight { get; private set; } // Peso Bruto (KG)
    public decimal NetWeight { get; private set; } // Peso Líquido (KG)
    public decimal LengthMm { get; private set; }
    public decimal WidthMm { get; private set; }
    public decimal HeightMm { get; private set; }

    // Cubagem M3 Calculada
    public decimal CubageM3 => (LengthMm * WidthMm * HeightMm) / 1000000000m;

    protected ProductPackaging() { }

    public ProductPackaging(Guid productId, Guid packagingTypeId, decimal conversionFactor, bool isDefaultInbound, bool isDefaultOutbound, bool allowFractionalPicking)
    {
        ProductId = productId;
        PackagingTypeId = packagingTypeId;
        ConversionFactor = conversionFactor;
        IsDefaultInbound = isDefaultInbound;
        IsDefaultOutbound = isDefaultOutbound;
        AllowFractionalPicking = allowFractionalPicking;
    }

    public void UpdateFlagsAndFactor(decimal conversionFactor, bool isDefaultInbound, bool isDefaultOutbound, bool allowFractionalPicking)
    {
        ConversionFactor = conversionFactor;
        IsDefaultInbound = isDefaultInbound;
        IsDefaultOutbound = isDefaultOutbound;
        AllowFractionalPicking = allowFractionalPicking;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateDimensions(decimal grossWeight, decimal netWeight, decimal length, decimal width, decimal height, string? barcode)
    {
        GrossWeight = grossWeight;
        NetWeight = netWeight;
        LengthMm = length;
        WidthMm = width;
        HeightMm = height;
        Barcode = barcode;
        UpdatedAt = DateTime.UtcNow;
    }
}