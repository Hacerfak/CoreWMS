namespace CoreWMS.Api.Features.Products;

public record ProductPackagingDto(Guid Id, Guid PackagingTypeId, string PackagingTypeCode, decimal ConversionFactor, bool IsDefaultInbound, bool IsDefaultOutbound, bool AllowFractionalPicking, decimal GrossWeight, decimal NetWeight, decimal LengthMm, decimal WidthMm, decimal HeightMm, decimal CubageM3, string? Barcode);

public record ProductDto(
    Guid Id, Guid CustomerId, string CustomerName, string Sku, string Description, string BaseUnit, string? BaseBarcode, string? Ncm, string? Cest, int Origin, int MaxStacking,
    bool TracksBatch, bool StrictBatch, bool TracksManufacture, bool StrictManufacture, bool TracksExpiration, bool StrictExpiration, bool TracksSerial, bool StrictSerial,
    int PickingStrategy, int PickingBaseDate, int? InboundShelfLifeToleranceDays, int? OutboundShelfLifeToleranceDays, bool IsActive, List<ProductPackagingDto> Packagings);