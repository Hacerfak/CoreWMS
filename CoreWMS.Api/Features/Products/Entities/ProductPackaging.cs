using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Products.Entities;

public class ProductPackaging : AuditableEntity
{
    public Guid ProductId { get; private set; }
    public Product Product { get; private set; } = null!;
    public Guid PackagingTypeId { get; private set; }
    public PackagingType PackagingType { get; private set; } = null!;
    public string? Barcode { get; private set; }
    public decimal ConversionFactor { get; private set; }
    public bool AllowFractionalPicking { get; private set; }

    // Dimensões e Peso
    public decimal GrossWeight { get; private set; }
    public decimal NetWeight { get; private set; }
    public decimal LengthMm { get; private set; }
    public decimal WidthMm { get; private set; }
    public decimal HeightMm { get; private set; }
    public int MaxStacking { get; private set; } = 1;
    public decimal CubageM3 => LengthMm * WidthMm * HeightMm / 1000000000m;

    protected ProductPackaging() { }

    public ProductPackaging(Guid productId, Guid packagingTypeId, decimal conversionFactor, bool allowFractionalPicking, int maxStacking = 1)
    {
        ProductId = productId;
        PackagingTypeId = packagingTypeId;
        ConversionFactor = conversionFactor;
        AllowFractionalPicking = allowFractionalPicking;
        MaxStacking = maxStacking > 0 ? maxStacking : 1;
    }

    public void UpdateFlagsAndFactor(decimal conversionFactor, bool allowFractionalPicking)
    {
        ConversionFactor = conversionFactor;
        AllowFractionalPicking = allowFractionalPicking;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateDimensions(decimal grossWeight, decimal netWeight, decimal length, decimal width, decimal height, string? barcode, int maxStacking = 1)
    {
        GrossWeight = grossWeight;
        NetWeight = netWeight;
        LengthMm = length;
        WidthMm = width;
        HeightMm = height;
        Barcode = barcode;
        MaxStacking = maxStacking > 0 ? maxStacking : 1;
        UpdatedAt = DateTime.UtcNow;
    }
}