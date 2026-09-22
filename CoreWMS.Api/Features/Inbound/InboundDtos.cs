namespace CoreWMS.Api.Features.Inbound;

public record PendingReviewItemDto(
    Guid ItemId, Guid InboundOrderId, Guid CustomerId, string AccessKey, string IssuerName,
    int LineNumber, string RawSkuCode, string? RawBarcode, string RawDescription,
    string RawNcm, string? RawCest, string RawUnit, decimal ExpectedQuantity, string? ExpectedBatch
);

public record ReceiveVolumeDto(Guid PackagingTypeId, int VolumeCount, decimal QuantityPerVolume, string? Batch, DateTime? ManufactureDate, DateTime? ExpirationDate, string? SerialNumber, Guid TargetLocationId, Inventory.Enums.QualityStatus QualityStatus);

public record InboundOrderDto(
    Guid Id, Guid? CustomerId, string? CustomerName, string IssuerCnpj, string IssuerName,
    string AccessKey, DateTime IssueDate, string Status, bool HasPendingReview
);

// Incluídos ExpectedBatch, ExpectedManufactureDate e ExpectedExpirationDate
public record InboundOrderItemDto(
    Guid Id, Guid? ProductId, int LineNumber, string Sku, string Description,
    decimal ExpectedQuantity, decimal ReceivedQuantity, string Status,
    Guid? LockedByUserId, Guid? DockLocationId, string? DockLocationPath,
    string? ExpectedBatch, DateTime? ExpectedManufactureDate, DateTime? ExpectedExpirationDate
);

public record InboundOrderDetailsDto(
    Guid Id, Guid? CustomerId, string? CustomerName, string IssuerCnpj, string IssuerName,
    string AccessKey, string RawXml, DateTime IssueDate, DateTime CreatedAt, string Status,
    List<InboundOrderItemDto> Items
);